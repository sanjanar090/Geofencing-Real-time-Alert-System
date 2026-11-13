# Multi-stage build for Go Backend
FROM golang:1.23-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/geofencing-server .

# Runtime container
FROM alpine:latest
RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app
COPY --from=builder /app/geofencing-server .
COPY backend/database/schema.sql ./backend/database/schema.sql

EXPOSE 8080

CMD ["./geofencing-server"]
