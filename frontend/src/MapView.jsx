
import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  getGeofences,
  getVehicles,
  getVehicleLocation,
} from "./api";

function FitMap({ geofences, vehicleLocations }) {
  const map = useMap();

  useEffect(() => {
    const bounds = L.latLngBounds([]);

    geofences.forEach((geofence) => {
      if (geofence.boundary) {
        try {
          const boundaryData =
            typeof geofence.boundary === "string"
              ? JSON.parse(geofence.boundary)
              : geofence.boundary;
          const geoBounds = L.geoJSON(boundaryData).getBounds();

          if (geoBounds.isValid()) {
            bounds.extend(geoBounds);
          }
        } catch {
          // ignore invalid bounds
        }
      }
    });

    vehicleLocations.forEach((location) => {
      if (
        Number.isFinite(Number(location.latitude)) &&
        Number.isFinite(Number(location.longitude))
      ) {
        bounds.extend([
          Number(location.latitude),
          Number(location.longitude),
        ]);
      }
    });

    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.3), { maxZoom: 16 });
    }
  }, [map, geofences, vehicleLocations]);

  return null;
}

export default function MapView({ refreshTrigger = 0 }) {
  const [geofences, setGeofences] = useState([]);
  const [vehicleLocations, setVehicleLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadMapData() {
      try {
        setError("");

        const [geofenceResponse, vehicleResponse] = await Promise.all([
          getGeofences(),
          getVehicles(),
        ]);

        const geofenceList = geofenceResponse.geofences || [];
        const vehicleList = vehicleResponse.vehicles || [];

        setGeofences(geofenceList);

        const locations = await Promise.all(
          vehicleList.map(async (vehicle) => {
            try {
              const location = await getVehicleLocation(vehicle.id);

              if (
                location.latitude == null ||
                location.longitude == null
              ) {
                return null;
              }

              return {
                ...location,
                vehicle,
              };
            } catch {
              return null;
            }
          })
        );

        setVehicleLocations(locations.filter(Boolean));
      } catch (err) {
        setError(err.message || "Unable to load map data");
      } finally {
        setLoading(false);
      }
    }

    loadMapData();
  }, [refreshTrigger]);

  return (
    <div style={{ width: "100%", height: "420px", position: "relative" }}>
      {loading && (
        <div style={{ padding: "12px" }}>Loading map data...</div>
      )}

      {error && (
        <div style={{ padding: "12px", color: "#ac1717" }}>
          {error}
        </div>
      )}

      <MapContainer
        center={[17.385, 78.4867]}
        zoom={14}
        style={{
          height: "100%",
          width: "100%",
          borderRadius: "10px",
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {geofences.map((geofence) => {
          let boundaryData = geofence.boundary;
          if (typeof boundaryData === "string") {
            try {
              boundaryData = JSON.parse(boundaryData);
            } catch {
              return null;
            }
          }
          if (!boundaryData) return null;

          return (
            <GeoJSON
              key={`${geofence.id}-${geofence.name}`}
              data={boundaryData}
              style={{
                color: "#176bc0",
                weight: 3,
                fillColor: "#3b82f6",
                fillOpacity: 0.2,
              }}
              onEachFeature={(feature, layer) => {
                layer.bindPopup(
                  `<div style="min-width: 140px;">
                    <strong>${geofence.name}</strong><br/>
                    <span style="font-size: 12px; color: #555;">Category: ${geofence.category}</span><br/>
                    <span style="font-size: 12px; color: #16845b; font-weight: 600;">Status: ${geofence.status || "active"}</span>
                  </div>`
                );
              }}
            />
          );
        })}

        {vehicleLocations.map((item) => (
          <CircleMarker
            key={item.vehicle_id}
            center={[
              Number(item.latitude),
              Number(item.longitude),
            ]}
            radius={9}
            pathOptions={{
              color: "#ffffff",
              weight: 3,
              fillColor: "#16a36a",
              fillOpacity: 1,
            }}
          >
            <Popup>
              <div style={{ minWidth: "180px" }}>
                <strong>{item.vehicle.vehicle_number}</strong>
                <p>Driver: {item.vehicle.driver_name}</p>
                <p>Type: {item.vehicle.vehicle_type}</p>
                <p>
                  Status:{" "}
                  {item.current_geofences?.some(
                    (zone) => zone.status === "inside"
                  )
                    ? "Inside Geofence"
                    : "Outside Geofence"}
                </p>
                <p>
                  Latitude: {item.latitude}
                  <br />
                  Longitude: {item.longitude}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        <FitMap
          geofences={geofences}
          vehicleLocations={vehicleLocations}
        />
      </MapContainer>
    </div>
  );
}
