
const BACKEND_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const API = BACKEND_BASE ? BACKEND_BASE : "/api";

async function request(endpoint, options = {}) {
  const response = await fetch(`${API}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const text = await response.text();

  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Server returned an invalid response");
  }

  if (!response.ok) {
    throw new Error(
      data.error || data.message || `Request failed: ${response.status}`
    );
  }

  return data;
}

export const getGeofences = () => request("/geofences");

export const createGeofence = (data) =>
  request("/geofences", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const getVehicles = () => request("/vehicles");

export const createVehicle = (data) =>
  request("/vehicles", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const updateVehicleLocation = (data) =>
  request("/vehicles/location", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const getVehicleLocation = (id) =>
  request(`/vehicles/location/${id}`);

export const getAlerts = (params = {}) => {
  const query = new URLSearchParams();
  if (params.geofence_id) query.append("geofence_id", params.geofence_id);
  if (params.vehicle_id) query.append("vehicle_id", params.vehicle_id);
  const qStr = query.toString();
  return request(`/alerts${qStr ? `?${qStr}` : ""}`);
};

export const configureAlert = (data) =>
  request("/alerts/configure", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const getViolations = (params = {}) => {
  const query = new URLSearchParams();
  if (params.geofence_id) query.append("geofence_id", params.geofence_id);
  if (params.vehicle_id) query.append("vehicle_id", params.vehicle_id);
  if (params.limit) query.append("limit", params.limit);
  if (params.start_date) query.append("start_date", params.start_date);
  if (params.end_date) query.append("end_date", params.end_date);
  const qStr = query.toString();
  return request(`/violations/history${qStr ? `?${qStr}` : ""}`);
};
