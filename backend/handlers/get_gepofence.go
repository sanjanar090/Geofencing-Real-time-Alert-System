
package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type GeofenceListItem struct {
	ID          int64           `json:"id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Category    string          `json:"category"`
	Status      string          `json:"status"`
	Boundary    json.RawMessage `json:"boundary"`
}

func GetGeofences(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		w.Header().Set("Content-Type", "application/json")

		category := r.URL.Query().Get("category")

		query := `
			SELECT
				id,
				name,
				COALESCE(description, ''),
				category,
				status,
				ST_AsGeoJSON(boundary)
			FROM geofences
			WHERE ($1 = '' OR category = $1)
			ORDER BY id
		`

		rows, err := pool.Query(r.Context(), query, category)
		if err != nil {
			sendError(w, http.StatusInternalServerError, "Could not retrieve geofences", start)
			return
		}
		defer rows.Close()

		geofences := []GeofenceListItem{}

		for rows.Next() {
			var item GeofenceListItem
			var boundary string

			err := rows.Scan(
				&item.ID,
				&item.Name,
				&item.Description,
				&item.Category,
				&item.Status,
				&boundary,
			)

			if err != nil {
				sendError(w, http.StatusInternalServerError, "Could not read geofence data", start)
				return
			}

			item.Boundary = json.RawMessage(boundary)
			geofences = append(geofences, item)
		}

		if err := rows.Err(); err != nil {
			sendError(w, http.StatusInternalServerError, "Error reading geofences", start)
			return
		}

		response := map[string]interface{}{
			"geofences": geofences,
			"time_ns":   fmt.Sprintf("%d", time.Since(start).Nanoseconds()),
		}

		json.NewEncoder(w).Encode(response)
	}
}
