package services

import (
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

type AlertHub struct {
	clients    map[*websocket.Conn]bool
	register   chan *websocket.Conn
	unregister chan *websocket.Conn
	broadcast  chan []byte
	mutex      sync.Mutex
}

func NewAlertHub() *AlertHub {
	return &AlertHub{
		clients:    make(map[*websocket.Conn]bool),
		register:   make(chan *websocket.Conn),
		unregister: make(chan *websocket.Conn),
		broadcast:  make(chan []byte),
	}
}

func (h *AlertHub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mutex.Lock()
			h.clients[client] = true
			h.mutex.Unlock()

		case client := <-h.unregister:
			h.mutex.Lock()
			if h.clients[client] {
				delete(h.clients, client)
				client.Close()
			}
			h.mutex.Unlock()

		case message := <-h.broadcast:
			h.mutex.Lock()
			for client := range h.clients {
				err := client.WriteMessage(websocket.TextMessage, message)
				if err != nil {
					log.Println("WebSocket write error:", err)
					delete(h.clients, client)
					client.Close()
				}
			}
			h.mutex.Unlock()
		}
	}
}

func (h *AlertHub) Register(client *websocket.Conn) {
	h.register <- client
}

func (h *AlertHub) Unregister(client *websocket.Conn) {
	h.unregister <- client
}

func (h *AlertHub) Broadcast(message []byte) {
	h.broadcast <- message
}