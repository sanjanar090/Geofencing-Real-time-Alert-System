
package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type VehicleListItem struct {
	ID            int64  `json:"id"`
	VehicleNumber string `json:"vehicle_number"`
	DriverName    string `json:"driver_name"`
	VehicleType   string `json:"vehicle_type"`
	Phone         string `json:"phone"`
}

func GetVehicles(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		w.Header().Set("Content-Type", "application/json")

		rows, err := pool.Query(
			r.Context(),
			`SELECT id, vehicle_number, driver_name, vehicle_type, phone
			 FROM vehicles
			 ORDER BY id`,
		)

		if err != nil {
			sendError(w, http.StatusInternalServerError, "Failed to retrieve vehicles", start)
			return
		}
		defer rows.Close()

		vehicles := []VehicleListItem{}

		for rows.Next() {
			var vehicle VehicleListItem

			err := rows.Scan(
				&vehicle.ID,
				&vehicle.VehicleNumber,
				&vehicle.DriverName,
				&vehicle.VehicleType,
				&vehicle.Phone,
			)

			if err != nil {
				sendError(w, http.StatusInternalServerError, "Failed to read vehicle data", start)
				return
			}

			vehicles = append(vehicles, vehicle)
		}

		if err := rows.Err(); err != nil {
			sendError(w, http.StatusInternalServerError, "Failed to read vehicle records", start)
			return
		}

		response := map[string]interface{}{
			"vehicles": vehicles,
			"time_ns":  fmt.Sprintf("%d", time.Since(start).Nanoseconds()),
		}

		json.NewEncoder(w).Encode(response)
	}
}
