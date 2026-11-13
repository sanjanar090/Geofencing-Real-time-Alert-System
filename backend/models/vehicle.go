
package models

import "strings"

type VehicleRequest struct {
	VehicleNumber string `json:"vehicle_number"`
	DriverName    string `json:"driver_name"`
	VehicleType   string `json:"vehicle_type"`
	Phone         string `json:"phone"`
}

func (v VehicleRequest) Validate() bool {
	return strings.TrimSpace(v.VehicleNumber) != "" &&
		strings.TrimSpace(v.DriverName) != "" &&
		strings.TrimSpace(v.VehicleType) != "" &&
		strings.TrimSpace(v.Phone) != ""
}
