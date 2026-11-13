
package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/dewanshpatle/geofencing-real-time-alert-system/backend/models"
	"github.com/dewanshpatle/geofencing-real-time-alert-system/backend/services"
)

type CurrentGeofence struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Category string `json:"category"`
	Status   string `json:"status"`
}

type geofenceCheck struct {
	fence     CurrentGeofence
	isInside  bool
	wasInside bool
}

func UpdateVehicleLocation(pool *pgxpool.Pool, hub *services.AlertHub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		w.Header().Set("Content-Type", "application/json")

		var request models.LocationRequest

		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			sendError(w, http.StatusBadRequest, "Invalid JSON", start)
			return
		}

		if err := request.Validate(); err != nil {
			sendError(w, http.StatusBadRequest, err.Error(), start)
			return
		}

		recordedAt, _ := time.Parse(time.RFC3339, request.Timestamp)

		tx, err := pool.Begin(r.Context())
		if err != nil {
			sendError(w, http.StatusInternalServerError, "Could not start transaction", start)
			return
		}
		defer tx.Rollback(r.Context())

		var previousLat, previousLon float64

		err = tx.QueryRow(
			r.Context(),
			`SELECT ST_Y(location), ST_X(location)
			 FROM vehicle_locations
			 WHERE vehicle_id = $1
			 ORDER BY recorded_at DESC, id DESC
			 LIMIT 1`,
			request.VehicleID,
		).Scan(&previousLat, &previousLon)

		hasPreviousLocation := err == nil

		if err != nil && err != pgx.ErrNoRows {
			sendError(w, http.StatusInternalServerError, "Could not read previous location", start)
			return
		}

		_, err = tx.Exec(
			r.Context(),
			`INSERT INTO vehicle_locations (vehicle_id, location, recorded_at)
			 VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4)`,
			request.VehicleID,
			request.Longitude,
			request.Latitude,
			recordedAt,
		)

		if err != nil {
			sendError(w, http.StatusInternalServerError, "Could not save vehicle location", start)
			return
		}

		rows, err := tx.Query(
			r.Context(),
			`SELECT
				id,
				name,
				category,
				ST_Covers(boundary, ST_SetSRID(ST_MakePoint($1, $2), 4326)),
				CASE WHEN $3 THEN
					ST_Covers(boundary, ST_SetSRID(ST_MakePoint($4, $5), 4326))
				ELSE false END
			 FROM geofences
			 WHERE status = 'active'
			 ORDER BY id`,
			request.Longitude,
			request.Latitude,
			hasPreviousLocation,
			previousLon,
			previousLat,
		)

		if err != nil {
			sendError(w, http.StatusInternalServerError, "Could not check geofences", start)
			return
		}

		checks := []geofenceCheck{}
		currentGeofences := []CurrentGeofence{}

		for rows.Next() {
			var check geofenceCheck

			if err := rows.Scan(
				&check.fence.ID,
				&check.fence.Name,
				&check.fence.Category,
				&check.isInside,
				&check.wasInside,
			); err != nil {
				rows.Close()
				sendError(w, http.StatusInternalServerError, "Could not read geofences", start)
				return
			}

			if check.isInside {
				check.fence.Status = "inside"
			} else {
				check.fence.Status = "outside"
			}

			checks = append(checks, check)
			currentGeofences = append(currentGeofences, check.fence)
		}

		if err := rows.Err(); err != nil {
			rows.Close()
			sendError(w, http.StatusInternalServerError, "Error reading geofences", start)
			return
		}

		rows.Close()

		// Store WebSocket messages until the transaction commits.
		messages := [][]byte{}

		for _, check := range checks {
			if !hasPreviousLocation {
				continue
			}

			eventType := ""

			if !check.wasInside && check.isInside {
				eventType = "entry"
			} else if check.wasInside && !check.isInside {
				eventType = "exit"
			}

			if eventType == "" {
				continue
			}

			var configured bool

			err := tx.QueryRow(
				r.Context(),
				`SELECT EXISTS (
					SELECT 1
					FROM alert_configs
					WHERE geofence_id = $1
					AND (vehicle_id IS NULL OR vehicle_id = $2)
					AND (event_type = $3 OR event_type = 'both')
				)`,
				check.fence.ID,
				request.VehicleID,
				eventType,
			).Scan(&configured)

			if err != nil {
				sendError(w, http.StatusInternalServerError, "Could not check alert rules", start)
				return
			}

			if !configured {
				continue
			}

			var vehicleNumber, driverName string

			err = tx.QueryRow(
				r.Context(),
				`SELECT vehicle_number, driver_name
				 FROM vehicles
				 WHERE id = $1`,
				request.VehicleID,
			).Scan(&vehicleNumber, &driverName)

			if err != nil {
				sendError(w, http.StatusInternalServerError, "Could not read vehicle details", start)
				return
			}

			var eventID int64

			err = tx.QueryRow(
				r.Context(),
				`INSERT INTO alerts
					(vehicle_id, geofence_id, event_type, location, created_at)
				 VALUES
					($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6)
				 RETURNING id`,
				request.VehicleID,
				check.fence.ID,
				eventType,
				request.Longitude,
				request.Latitude,
				recordedAt,
			).Scan(&eventID)

			if err != nil {
				sendError(w, http.StatusInternalServerError, "Could not save alert", start)
				return
			}

			// Prepare the real-time alert message.
			alertMessage := map[string]interface{}{
				"event_id":   eventID,
				"event_type": eventType,
				"timestamp":  recordedAt,
				"vehicle": map[string]interface{}{
					"id":             request.VehicleID,
					"vehicle_number": vehicleNumber,
					"driver_name":    driverName,
				},
				"geofence": map[string]interface{}{
					"id":       check.fence.ID,
					"name":     check.fence.Name,
					"category": check.fence.Category,
				},
				"location": map[string]interface{}{
					"latitude":  request.Latitude,
					"longitude": request.Longitude,
				},
			}

			message, err := json.Marshal(alertMessage)
			if err != nil {
				sendError(w, http.StatusInternalServerError, "Could not prepare alert message", start)
				return
			}

			messages = append(messages, message)
		}

		if err := tx.Commit(r.Context()); err != nil {
			sendError(w, http.StatusInternalServerError, "Could not save location transaction", start)
			return
		}

		// Broadcast only after the database transaction succeeds.
		for _, message := range messages {
			go hub.Broadcast(message)
		}

		response := map[string]interface{}{
			"vehicle_id":        request.VehicleID,
			"location_updated":  true,
			"current_geofences": currentGeofences,
			"time_ns":           fmt.Sprintf("%d", time.Since(start).Nanoseconds()),
		}

		json.NewEncoder(w).Encode(response)
	}
}
