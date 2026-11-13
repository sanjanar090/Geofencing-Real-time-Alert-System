
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gorilla/mux"

	"github.com/dewanshpatle/geofencing-real-time-alert-system/backend/database"
	"github.com/dewanshpatle/geofencing-real-time-alert-system/backend/handlers"
	"github.com/dewanshpatle/geofencing-real-time-alert-system/backend/services"
)

func main() {
	// Connect to PostgreSQL
	pool, err := database.Connect()
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	// Create router
	router := mux.NewRouter()

	// Create and start WebSocket alert manager
	alertHub := services.NewAlertHub()
	go alertHub.Run()

	// WebSocket API
	router.HandleFunc(
		"/ws/alerts",
		handlers.WebSocketAlerts(alertHub),
	)

	// Geofence APIs
	router.HandleFunc("/geofences", handlers.CreateGeofence(pool)).Methods("POST")
	router.HandleFunc("/geofences", handlers.GetGeofences(pool)).Methods("GET")

	// Vehicle APIs
	router.HandleFunc("/vehicles", handlers.CreateVehicle(pool)).Methods("POST")
	router.HandleFunc("/vehicles", handlers.GetVehicles(pool)).Methods("GET")

	router.HandleFunc(
		"/vehicles/location",
		handlers.UpdateVehicleLocation(pool, alertHub),
	).Methods("POST")

	router.HandleFunc(
		"/vehicles/location/{vehicle_id}",
		handlers.GetVehicleLocation(pool),
	).Methods("GET")

	// Alert APIs
	router.HandleFunc("/alerts/configure", handlers.ConfigureAlert(pool)).Methods("POST")
	router.HandleFunc("/alerts", handlers.GetAlerts(pool)).Methods("GET")
	router.HandleFunc("/violations/history", handlers.GetViolationsHistory(pool)).Methods("GET")

	// Start HTTP server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Println("Server running on http://localhost:" + port)
	log.Fatal(http.ListenAndServe(":"+port, router))
}
