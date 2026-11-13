
package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func GetAlerts(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		w.Header().Set("Content-Type", "application/json")

		var geofenceID *int64
		var vehicleID *int64

		if value := r.URL.Query().Get("geofence_id"); value != "" {
			id, err := strconv.ParseInt(value, 10, 64)
			if err != nil || id <= 0 {
				sendError(w, http.StatusBadRequest, "Invalid geofence_id", start)
				return
			}
			geofenceID = &id
		}

		if value := r.URL.Query().Get("vehicle_id"); value != "" {
			id, err := strconv.ParseInt(value, 10, 64)
			if err != nil || id <= 0 {
				sendError(w, http.StatusBadRequest, "Invalid vehicle_id", start)
				return
			}
			vehicleID = &id
		}

		rows, err := pool.Query(r.Context(), `
			SELECT
				a.id,
				a.event_type,
				a.created_at,
				v.id,
				v.vehicle_number,
				v.driver_name,
				g.id,
				g.name,
				g.category,
				ST_Y(a.location),
				ST_X(a.location)
			FROM alerts a
			JOIN vehicles v ON v.id = a.vehicle_id
			JOIN geofences g ON g.id = a.geofence_id
			WHERE ($1::bigint IS NULL OR a.geofence_id = $1)
			  AND ($2::bigint IS NULL OR a.vehicle_id = $2)
			ORDER BY a.created_at DESC, a.id DESC
		`, geofenceID, vehicleID)

		if err != nil {
			sendError(w, http.StatusInternalServerError, "Failed to fetch alerts", start)
			return
		}
		defer rows.Close()

		alerts := []map[string]interface{}{}

		for rows.Next() {
			var (
				id, vID, gID int64
				eventType, vehicleNumber, driverName string
				geofenceName, category string
				createdAt time.Time
				latitude, longitude float64
			)

			if err := rows.Scan(
				&id, &eventType, &createdAt,
				&vID, &vehicleNumber, &driverName,
				&gID, &geofenceName, &category,
				&latitude, &longitude,
			); err != nil {
				sendError(w, http.StatusInternalServerError, "Failed to read alerts", start)
				return
			}

			alerts = append(alerts, map[string]interface{}{
				"id": id,
				"event_type": eventType,
				"timestamp": createdAt,
				"vehicle": map[string]interface{}{
					"id": vID,
					"vehicle_number": vehicleNumber,
					"driver_name": driverName,
				},
				"geofence": map[string]interface{}{
					"id": gID,
					"name": geofenceName,
					"category": category,
				},
				"location": map[string]interface{}{
					"latitude": latitude,
					"longitude": longitude,
				},
			})
		}

		if err := rows.Err(); err != nil {
			sendError(w, http.StatusInternalServerError, "Failed to read alerts", start)
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"alerts": alerts,
			"time_ns": strconv.FormatInt(time.Since(start).Nanoseconds(), 10),
		})
	}
}
