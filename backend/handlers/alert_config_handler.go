
package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type AlertConfigRequest struct {
	GeofenceID int64  `json:"geofence_id"`
	VehicleID  *int64 `json:"vehicle_id"`
	EventType  string `json:"event_type"`
}

func ConfigureAlert(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		w.Header().Set("Content-Type", "application/json")

		var request AlertConfigRequest

		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			sendError(w, http.StatusBadRequest, "Invalid JSON", start)
			return
		}

		request.EventType = strings.ToLower(strings.TrimSpace(request.EventType))

		if request.GeofenceID <= 0 {
			sendError(w, http.StatusBadRequest, "Invalid geofence_id", start)
			return
		}

		if request.VehicleID != nil && *request.VehicleID <= 0 {
			sendError(w, http.StatusBadRequest, "Invalid vehicle_id", start)
			return
		}

		if request.EventType != "entry" &&
			request.EventType != "exit" &&
			request.EventType != "both" {
			sendError(w, http.StatusBadRequest, "event_type must be entry, exit, or both", start)
			return
		}

		var configID int64

		err := pool.QueryRow(r.Context(), `
			INSERT INTO alert_configs (geofence_id, vehicle_id, event_type)
			VALUES ($1, $2, $3)
			RETURNING id
		`, request.GeofenceID, request.VehicleID, request.EventType).Scan(&configID)

		if err != nil {
			sendError(w, http.StatusBadRequest, "Failed to configure alert. Check geofence_id and vehicle_id", start)
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"id":          configID,
			"geofence_id": request.GeofenceID,
			"vehicle_id":  request.VehicleID,
			"event_type":  request.EventType,
			"message":     "Alert configured successfully",
			"time_ns": strconv.FormatInt(
				time.Since(start).Nanoseconds(), 10,
			),
		})
	}
}
