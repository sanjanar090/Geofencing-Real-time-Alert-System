
package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/dewanshpatle/geofencing-real-time-alert-system/backend/models"
)

func CreateGeofence(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		w.Header().Set("Content-Type", "application/json")

		var request models.GeofenceRequest

		err := json.NewDecoder(r.Body).Decode(&request)
		if err != nil {
			sendError(w, http.StatusBadRequest, "Invalid JSON", start)
			return
		}

		if err := request.Validate(); err != nil {
			sendError(w, http.StatusBadRequest, err.Error(), start)
			return
		}

		// Convert [latitude, longitude] pairs into PostGIS polygon coordinates.
		var points []string

		for _, point := range request.Coordinates {
			latitude := point[0]
			longitude := point[1]

			points = append(points, fmt.Sprintf("%f %f", longitude, latitude))
		}

		polygonWKT := "POLYGON((" + strings.Join(points, ", ") + "))"

		var id int64

		err = pool.QueryRow(
			r.Context(),
			`INSERT INTO geofences
			(name, description, category, boundary)
			VALUES ($1, $2, $3, ST_GeomFromText($4, 4326))
			RETURNING id`,
			request.Name,
			request.Description,
			request.Category,
			polygonWKT,
		).Scan(&id)

		if err != nil {
			sendError(w, http.StatusInternalServerError, "Could not create geofence", start)
			return
		}

		response := map[string]interface{}{
			"id":      id,
			"name":    request.Name,
			"status":  "created",
			"time_ns": fmt.Sprintf("%d", time.Since(start).Nanoseconds()),
		}

		json.NewEncoder(w).Encode(response)
	}
}

func sendError(w http.ResponseWriter, statusCode int, message string, start time.Time) {
	w.WriteHeader(statusCode)

	response := map[string]string{
		"error":   message,
		"time_ns": fmt.Sprintf("%d", time.Since(start).Nanoseconds()),
	}

	json.NewEncoder(w).Encode(response)
}
