package models_test

import (
	"testing"
	"time"

	"github.com/dewanshpatle/geofencing-real-time-alert-system/backend/models"
)

func TestGeofenceValidation(t *testing.T) {
	// 1. Valid Geofence
	validGeo := models.GeofenceRequest{
		Name:     "Hyderabad Delivery Zone",
		Category: "delivery_zone",
		Coordinates: [][]float64{
			{17.385, 78.4867},
			{17.390, 78.4867},
			{17.390, 78.4920},
			{17.385, 78.4920},
			{17.385, 78.4867},
		},
	}
	if err := validGeo.Validate(); err != nil {
		t.Fatalf("expected valid geofence, got: %v", err)
	}

	// 2. Unclosed polygon
	unclosed := models.GeofenceRequest{
		Name:     "Unclosed Zone",
		Category: "delivery_zone",
		Coordinates: [][]float64{
			{17.385, 78.4867},
			{17.390, 78.4867},
			{17.390, 78.4920},
			{17.385, 78.4920},
		},
	}
	if err := unclosed.Validate(); err == nil {
		t.Fatalf("expected error for unclosed polygon")
	}

	// 3. Invalid Category
	invalidCat := validGeo
	invalidCat.Category = "unknown_zone"
	if err := invalidCat.Validate(); err == nil {
		t.Fatalf("expected error for invalid category")
	}

	// 4. Empty Name
	emptyName := validGeo
	emptyName.Name = ""
	if err := emptyName.Validate(); err == nil {
		t.Fatalf("expected error for empty name")
	}
}

func TestVehicleValidation(t *testing.T) {
	valid := models.VehicleRequest{
		VehicleNumber: "TS09AB1234",
		DriverName:    "Rahul Sharma",
		VehicleType:   "Truck",
		Phone:         "9876543210",
	}
	if !valid.Validate() {
		t.Fatalf("expected valid vehicle request")
	}

	invalid := valid
	invalid.VehicleNumber = "  "
	if invalid.Validate() {
		t.Fatalf("expected invalid for empty vehicle number")
	}
}

func TestLocationValidation(t *testing.T) {
	valid := models.LocationRequest{
		VehicleID: 1,
		Latitude:  17.388,
		Longitude: 78.489,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
	if err := valid.Validate(); err != nil {
		t.Fatalf("expected valid location, got: %v", err)
	}

	invalidLat := valid
	invalidLat.Latitude = 120.0
	if err := invalidLat.Validate(); err == nil {
		t.Fatalf("expected error for latitude > 90")
	}

	invalidTime := valid
	invalidTime.Timestamp = "not-a-timestamp"
	if err := invalidTime.Validate(); err == nil {
		t.Fatalf("expected error for non-RFC3339 timestamp")
	}
}
