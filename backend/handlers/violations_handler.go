
package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func GetViolationsHistory(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		w.Header().Set("Content-Type", "application/json")

		query := r.URL.Query()

		var vehicleID *int64
		var geofenceID *int64

		if value := query.Get("vehicle_id"); value != "" {
			id, err := strconv.ParseInt(value, 10, 64)
			if err != nil || id <= 0 {
				sendError(w, http.StatusBadRequest, "Invalid vehicle_id", start)
				return
			}
			vehicleID = &id
		}

		if value := query.Get("geofence_id"); value != "" {
			id, err := strconv.ParseInt(value, 10, 64)
			if err != nil || id <= 0 {
				sendError(w, http.StatusBadRequest, "Invalid geofence_id", start)
				return
			}
			geofenceID = &id
		}

		limit := 50
		if value := query.Get("limit"); value != "" {
			n, err := strconv.Atoi(value)
			if err != nil || n < 1 || n > 500 {
				sendError(w, http.StatusBadRequest, "Limit must be between 1 and 500", start)
				return
			}
			limit = n
		}

		var startDate, endDate *time.Time

		if value := query.Get("start_date"); value != "" {
			t, err := time.Parse(time.RFC3339, value)
			if err != nil {
				sendError(w, http.StatusBadRequest, "Invalid start_date", start)
				return
			}
			startDate = &t
		}

		if value := query.Get("end_date"); value != "" {
			t, err := time.Parse(time.RFC3339, value)
			if err != nil {
				sendError(w, http.StatusBadRequest, "Invalid end_date", start)
				return
			}
			endDate = &t
		}

		if startDate != nil && endDate != nil && endDate.Before(*startDate) {
			sendError(w, http.StatusBadRequest, "end_date must be after start_date", start)
			return
		}

		var totalCount int

		err := pool.QueryRow(r.Context(), `
			SELECT COUNT(*)
			FROM alerts a
			WHERE ($1::bigint IS NULL OR a.vehicle_id = $1)
			  AND ($2::bigint IS NULL OR a.geofence_id = $2)
			  AND ($3::timestamptz IS NULL OR a.created_at >= $3)
			  AND ($4::timestamptz IS NULL OR a.created_at <= $4)
		`, vehicleID, geofenceID, startDate, endDate).Scan(&totalCount)

		if err != nil {
			sendError(w, http.StatusInternalServerError, "Failed to count violations", start)
			return
		}

		rows, err := pool.Query(r.Context(), `
			SELECT
				a.id, a.event_type, a.created_at,
				v.id, v.vehicle_number, v.driver_name,
				g.id, g.name, g.category,
				ST_Y(a.location), ST_X(a.location)
			FROM alerts a
			JOIN vehicles v ON v.id = a.vehicle_id
			JOIN geofences g ON g.id = a.geofence_id
			WHERE ($1::bigint IS NULL OR a.vehicle_id = $1)
			  AND ($2::bigint IS NULL OR a.geofence_id = $2)
			  AND ($3::timestamptz IS NULL OR a.created_at >= $3)
			  AND ($4::timestamptz IS NULL OR a.created_at <= $4)
			ORDER BY a.created_at DESC, a.id DESC
			LIMIT $5
		`, vehicleID, geofenceID, startDate, endDate, limit)

		if err != nil {
			sendError(w, http.StatusInternalServerError, "Failed to fetch violations", start)
			return
		}
		defer rows.Close()

		violations := []map[string]interface{}{}

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
				sendError(w, http.StatusInternalServerError, "Failed to read violations", start)
				return
			}

			violations = append(violations, map[string]interface{}{
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
			sendError(w, http.StatusInternalServerError, "Failed to read violations", start)
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"violations": violations,
			"total_count": totalCount,
			"time_ns": strconv.FormatInt(time.Since(start).Nanoseconds(), 10),
		})
	}
}
