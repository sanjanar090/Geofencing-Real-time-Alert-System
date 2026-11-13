
package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/dewanshpatle/geofencing-real-time-alert-system/backend/models"
)

func CreateVehicle(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		w.Header().Set("Content-Type", "application/json")

		var request models.VehicleRequest

		err := json.NewDecoder(r.Body).Decode(&request)
		if err != nil {
			sendError(w, http.StatusBadRequest, "Invalid JSON", start)
			return
		}

		if !request.Validate() {
			sendError(w, http.StatusBadRequest, "All vehicle fields are required", start)
			return
		}

		var id int64

		err = pool.QueryRow(
			r.Context(),
			`INSERT INTO vehicles
			(vehicle_number, driver_name, vehicle_type, phone)
			VALUES ($1, $2, $3, $4)
			RETURNING id`,
			request.VehicleNumber,
			request.DriverName,
			request.VehicleType,
			request.Phone,
		).Scan(&id)

		if err != nil {
			sendError(w, http.StatusConflict, "Vehicle number may already exist", start)
			return
		}

		response := map[string]interface{}{
			"id":             id,
			"vehicle_number": request.VehicleNumber,
			"driver_name":    request.DriverName,
			"vehicle_type":   request.VehicleType,
			"phone":          request.Phone,
			"time_ns":        fmt.Sprintf("%d", time.Since(start).Nanoseconds()),
		}

		json.NewEncoder(w).Encode(response)
	}
}
