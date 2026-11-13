
package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
)

func GetVehicleLocation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		w.Header().Set("Content-Type", "application/json")

		id, err := strconv.ParseInt(mux.Vars(r)["vehicle_id"], 10, 64)
		if err != nil || id <= 0 {
			sendError(w, http.StatusBadRequest, "Invalid vehicle_id", start)
			return
		}

		var result struct {
			VehicleID int64   `json:"vehicle_id"`
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
			Timestamp time.Time `json:"timestamp"`
		}

		err = pool.QueryRow(r.Context(), `
			SELECT vehicle_id, ST_Y(location), ST_X(location), recorded_at
			FROM vehicle_locations
			WHERE vehicle_id = $1
			ORDER BY recorded_at DESC, id DESC
			LIMIT 1
		`, id).Scan(
			&result.VehicleID,
			&result.Latitude,
			&result.Longitude,
			&result.Timestamp,
		)

		if err != nil {
			sendError(w, http.StatusNotFound, "Vehicle location not found", start)
			return
		}

		var geofences []CurrentGeofence

		rows, err := pool.Query(r.Context(), `
			SELECT id, name, category
			FROM geofences
			WHERE status = 'active'
			AND ST_Covers(
				boundary,
				ST_SetSRID(ST_MakePoint($1, $2), 4326)
			)
			ORDER BY id
		`, result.Longitude, result.Latitude)

		if err != nil {
			sendError(w, http.StatusInternalServerError, "Failed to fetch geofences", start)
			return
		}
		defer rows.Close()

		for rows.Next() {
			var fence CurrentGeofence
			if err := rows.Scan(&fence.ID, &fence.Name, &fence.Category); err != nil {
				sendError(w, http.StatusInternalServerError, "Failed to read geofences", start)
				return
			}
			fence.Status = "inside"
			geofences = append(geofences, fence)
		}

		if err := rows.Err(); err != nil {
			sendError(w, http.StatusInternalServerError, "Failed to read geofences", start)
			return
		}

		if geofences == nil {
			geofences = []CurrentGeofence{}
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"vehicle_id": result.VehicleID,
			"latitude": result.Latitude,
			"longitude": result.Longitude,
			"timestamp": result.Timestamp,
			"current_geofences": geofences,
			"time_ns": strconv.FormatInt(time.Since(start).Nanoseconds(), 10),
		})
	}
}
