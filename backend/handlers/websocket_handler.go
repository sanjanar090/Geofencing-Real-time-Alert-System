package handlers

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/dewanshpatle/geofencing-real-time-alert-system/backend/services"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func WebSocketAlerts(hub *services.AlertHub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Println("WebSocket upgrade error:", err)
			return
		}

		hub.Register(conn)
		defer hub.Unregister(conn)

		log.Println("WebSocket client connected")

		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				log.Println("WebSocket client disconnected")
				break
			}
		}
	}
}