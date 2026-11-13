
package models

import (
	"fmt"
	"math"
	"time"
)

type LocationRequest struct {
	VehicleID int64   `json:"vehicle_id"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Timestamp string  `json:"timestamp"`
}

func (l LocationRequest) Validate() error {
	if l.VehicleID <= 0 {
		return fmt.Errorf("invalid vehicle_id")
	}

	if math.IsNaN(l.Latitude) || math.IsInf(l.Latitude, 0) ||
		l.Latitude < -90 || l.Latitude > 90 {
		return fmt.Errorf("invalid latitude")
	}

	if math.IsNaN(l.Longitude) || math.IsInf(l.Longitude, 0) ||
		l.Longitude < -180 || l.Longitude > 180 {
		return fmt.Errorf("invalid longitude")
	}

	if _, err := time.Parse(time.RFC3339, l.Timestamp); err != nil {
		return fmt.Errorf("timestamp must be in ISO 8601 format")
	}

	return nil
}
