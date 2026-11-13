
package models

import (
	"fmt"
	"math"
	"strings"
)

type GeofenceRequest struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Category    string      `json:"category"`
	Coordinates [][]float64 `json:"coordinates"`
}

type GeofenceResponse struct {
	ID     int64  `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

func (g GeofenceRequest) Validate() error {
	if strings.TrimSpace(g.Name) == "" {
		return fmt.Errorf("geofence name is required")
	}

	validCategories := map[string]bool{
		"delivery_zone":  true,
		"restricted_zone": true,
		"toll_zone":       true,
		"customer_area":   true,
	}

	if !validCategories[g.Category] {
		return fmt.Errorf("invalid geofence category")
	}

	if len(g.Coordinates) < 4 {
		return fmt.Errorf("at least 4 coordinate pairs are required")
	}

	uniquePoints := make(map[[2]float64]bool)

	for _, point := range g.Coordinates {
		if len(point) != 2 {
			return fmt.Errorf("each coordinate must contain latitude and longitude")
		}

		lat, lon := point[0], point[1]

		if math.IsNaN(lat) || math.IsInf(lat, 0) ||
			math.IsNaN(lon) || math.IsInf(lon, 0) {
			return fmt.Errorf("coordinates must be valid numbers")
		}

		if lat < -90 || lat > 90 {
			return fmt.Errorf("latitude must be between -90 and 90")
		}

		if lon < -180 || lon > 180 {
			return fmt.Errorf("longitude must be between -180 and 180")
		}

		uniquePoints[[2]float64{lat, lon}] = true
	}

	if len(uniquePoints) < 4 {
		// Three unique points plus the repeated closing point are required.
		if len(uniquePoints) != 3 {
			return fmt.Errorf("polygon must contain at least 3 unique points")
		}
	}

	first := g.Coordinates[0]
	last := g.Coordinates[len(g.Coordinates)-1]

	if first[0] != last[0] || first[1] != last[1] {
		return fmt.Errorf("polygon must be closed: first and last coordinates must match")
	}

	return nil
}
