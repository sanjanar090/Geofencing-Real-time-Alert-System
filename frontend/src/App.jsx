import { useEffect, useState, useRef } from "react";
import {
  LayoutDashboard,
  MapPin,
  Truck,
  Bell,
  History,
  Settings,
  Activity,
  ShieldCheck,
  Radio,
  Plus,
  RefreshCw,
  ChevronRight,
  ArrowUpRight,
  Clock3,
  X,
  MapPinned,
  Navigation,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Server,
  Database,
} from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";

import {
  getGeofences,
  getVehicles,
  getAlerts,
  createGeofence,
  createVehicle,
  updateVehicleLocation,
  getVehicleLocation,
  configureAlert,
  getViolations,
} from "./api";

import MapView from "./MapView";
import "./App.css";

const initialGeofenceForm = {
  name: "",
  description: "",
  category: "delivery_zone",
  south: "17.395",
  west: "78.500",
  north: "17.400",
  east: "78.505",
};

const initialVehicleForm = {
  vehicle_number: "",
  driver_name: "",
  vehicle_type: "Truck",
  phone: "",
};

const initialLocationForm = {
  vehicle_id: "",
  latitude: "17.388",
  longitude: "78.489",
};

const initialAlertConfigForm = {
  geofence_id: "",
  vehicle_id: "",
  event_type: "both",
};

const fieldLabel = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#42546b",
  marginBottom: 7,
};

const fieldStyle = {
  width: "100%",
  padding: "11px 12px",
  border: "1px solid #dce3ed",
  borderRadius: 7,
  outline: "none",
  fontSize: 14,
  color: "#263d59",
  marginBottom: 16,
  boxSizing: "border-box",
};

function App() {
  const [page, setPage] = useState("Dashboard");
  const [geofences, setGeofences] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [violations, setViolations] = useState([]);
  const [vehicleLocations, setVehicleLocations] = useState({});
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [success, setSuccess] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [liveToast, setLiveToast] = useState(null);
  const [mapRefreshTrigger, setMapRefreshTrigger] = useState(0);

  // Modals
  const [showGeofenceModal, setShowGeofenceModal] = useState(false);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showConfigAlertModal, setShowConfigAlertModal] = useState(false);

  // Forms
  const [geoForm, setGeoForm] = useState(initialGeofenceForm);
  const [vehicleForm, setVehicleForm] = useState(initialVehicleForm);
  const [locationForm, setLocationForm] = useState(initialLocationForm);
  const [alertConfigForm, setAlertConfigForm] = useState(initialAlertConfigForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [vehicleSearchTerm, setVehicleSearchTerm] = useState("");

  // Alerts Page Filters
  const [alertGeofenceFilter, setAlertGeofenceFilter] = useState("");
  const [alertVehicleFilter, setAlertVehicleFilter] = useState("");
  const [alertTypeFilter, setAlertTypeFilter] = useState("");

  // Violations Page Filters
  const [violationGeofenceFilter, setViolationGeofenceFilter] = useState("");
  const [violationVehicleFilter, setViolationVehicleFilter] = useState("");
  const [violationTypeFilter, setViolationTypeFilter] = useState("");

  const wsRef = useRef(null);

  async function loadDashboard() {
    setLoading(true);
    setPageError("");

    try {
      const [geoData, vehicleData, alertData, violationData] = await Promise.all([
        getGeofences(),
        getVehicles(),
        getAlerts(),
        getViolations(),
      ]);

      const loadedGeofences = geoData.geofences || [];
      const loadedVehicles = vehicleData.vehicles || [];
      const loadedAlerts = alertData.alerts || [];
      const loadedViolations = violationData.violations || [];

      setGeofences(loadedGeofences);
      setVehicles(loadedVehicles);
      setAlerts(loadedAlerts);
      setViolations(loadedViolations);

      // Fetch locations for each vehicle
      const locMap = {};
      await Promise.all(
        loadedVehicles.map(async (v) => {
          try {
            const loc = await getVehicleLocation(v.id);
            if (loc && loc.latitude != null) {
              locMap[v.id] = loc;
            }
          } catch {
            // No location recorded yet
          }
        })
      );
      setVehicleLocations(locMap);
    } catch (err) {
      console.error(err);
      setPageError(err.message || "Unable to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }

  // WebSocket for Live Alerts
  useEffect(() => {
    let active = true;
    let reconnectTimeout = null;

    function connectWebSocket() {
      try {
        let wsUrl;
        if (import.meta.env.VITE_WS_URL) {
          wsUrl = `${import.meta.env.VITE_WS_URL.replace(/\/+$/, "")}/ws/alerts`;
        } else if (import.meta.env.VITE_API_URL) {
          const apiUrl = new URL(import.meta.env.VITE_API_URL);
          const wsProto = apiUrl.protocol === "https:" ? "wss:" : "ws:";
          wsUrl = `${wsProto}//${apiUrl.host}/ws/alerts`;
        } else {
          const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
          wsUrl = `${protocol}//${window.location.hostname}:8080/ws/alerts`;
        }

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!active) return;
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          if (!active) return;
          try {
            const newAlert = JSON.parse(event.data);
            setAlerts((prev) => [newAlert, ...prev]);
            setLiveToast({
              type: newAlert.event_type || "alert",
              message: `🚨 Real-time alert: Vehicle ${newAlert.vehicle?.vehicle_number || ""} triggered ${newAlert.event_type?.toUpperCase()} event at ${newAlert.geofence?.name || "zone"}!`,
            });
            setTimeout(() => setLiveToast(null), 7000);

            // Update map and vehicle locations
            setMapRefreshTrigger((prev) => prev + 1);
            if (newAlert.vehicle?.id && newAlert.location) {
              setVehicleLocations((prev) => ({
                ...prev,
                [newAlert.vehicle.id]: {
                  vehicle_id: newAlert.vehicle.id,
                  latitude: newAlert.location.latitude,
                  longitude: newAlert.location.longitude,
                  timestamp: newAlert.timestamp,
                  current_geofences: [
                    {
                      id: newAlert.geofence?.id,
                      name: newAlert.geofence?.name,
                      category: newAlert.geofence?.category,
                      status: newAlert.event_type === "entry" ? "inside" : "outside",
                    },
                  ],
                },
              }));
            }
          } catch (e) {
            console.error("WebSocket message parse error:", e);
          }
        };

        ws.onclose = () => {
          if (!active) return;
          setWsConnected(false);
          reconnectTimeout = setTimeout(connectWebSocket, 4000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (err) {
        console.warn("WebSocket connection failure:", err);
      }
    }

    connectWebSocket();

    return () => {
      active = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  useEffect(() => {
    loadDashboard();
  }, []);

  function navigate(label) {
    setPage(label);
    setPageError("");
    setSuccess("");
    setFormError("");
  }

  // GEOFENCE CREATION
  function openGeofenceModal() {
    setGeoForm(initialGeofenceForm);
    setFormError("");
    setShowGeofenceModal(true);
  }

  async function handleCreateGeofence(event) {
    event.preventDefault();
    setFormError("");
    setSaving(true);

    const south = Number(geoForm.south);
    const west = Number(geoForm.west);
    const north = Number(geoForm.north);
    const east = Number(geoForm.east);

    if (!geoForm.name.trim()) {
      setFormError("Please enter a geofence name.");
      setSaving(false);
      return;
    }

    if (
      ![south, west, north, east].every(Number.isFinite) ||
      south >= north ||
      west >= east ||
      south < -90 ||
      north > 90 ||
      west < -180 ||
      east > 180
    ) {
      setFormError("Please enter valid boundary coordinates.");
      setSaving(false);
      return;
    }

    const payload = {
      name: geoForm.name.trim(),
      description: geoForm.description.trim(),
      category: geoForm.category,
      coordinates: [
        [south, west],
        [north, west],
        [north, east],
        [south, east],
        [south, west],
      ],
    };

    try {
      await createGeofence(payload);
      setShowGeofenceModal(false);
      setGeoForm(initialGeofenceForm);
      setSuccess("Geofence created successfully.");
      setMapRefreshTrigger((prev) => prev + 1);
      await loadDashboard();
    } catch (err) {
      console.error("Geofence creation error:", err);
      setFormError(err.message || "Unable to create geofence.");
    } finally {
      setSaving(false);
    }
  }

  // VEHICLE CREATION
  function openVehicleModal() {
    setVehicleForm(initialVehicleForm);
    setFormError("");
    setShowVehicleModal(true);
  }

  async function handleCreateVehicle(event) {
    event.preventDefault();
    setFormError("");
    setSaving(true);

    if (!vehicleForm.vehicle_number.trim()) {
      setFormError("Please enter a vehicle registration number.");
      setSaving(false);
      return;
    }

    if (!vehicleForm.driver_name.trim()) {
      setFormError("Please enter a driver name.");
      setSaving(false);
      return;
    }

    const payload = {
      vehicle_number: vehicleForm.vehicle_number.trim(),
      driver_name: vehicleForm.driver_name.trim(),
      vehicle_type: vehicleForm.vehicle_type,
      phone: vehicleForm.phone.trim(),
    };

    try {
      await createVehicle(payload);
      setShowVehicleModal(false);
      setVehicleForm(initialVehicleForm);
      setSuccess(`Vehicle ${payload.vehicle_number} registered successfully.`);
      await loadDashboard();
    } catch (err) {
      console.error("Vehicle registration error:", err);
      setFormError(err.message || "Unable to register vehicle.");
    } finally {
      setSaving(false);
    }
  }

  // UPDATE VEHICLE GPS LOCATION
  function openLocationModal(vehicleId) {
    const defaultVehicle = vehicleId || (vehicles[0] ? String(vehicles[0].id) : "");
    const existing = vehicleLocations[defaultVehicle];
    setLocationForm({
      vehicle_id: String(defaultVehicle),
      latitude: existing?.latitude != null ? String(existing.latitude) : "17.388",
      longitude: existing?.longitude != null ? String(existing.longitude) : "78.489",
    });
    setFormError("");
    setShowLocationModal(true);
  }

  async function handleUpdateLocation(event) {
    event.preventDefault();
    setFormError("");
    setSaving(true);

    const vId = Number(locationForm.vehicle_id);
    const lat = Number(locationForm.latitude);
    const lon = Number(locationForm.longitude);

    if (!vId || !Number.isFinite(vId)) {
      setFormError("Please select a valid vehicle.");
      setSaving(false);
      return;
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setFormError("Please enter valid latitude and longitude coordinates.");
      setSaving(false);
      return;
    }

    const payload = {
      vehicle_id: vId,
      latitude: lat,
      longitude: lon,
      timestamp: new Date().toISOString(),
    };

    try {
      const res = await updateVehicleLocation(payload);
      setShowLocationModal(false);
      const insideZones = res.current_geofences?.filter((g) => g.status === "inside").map((g) => g.name);
      const zoneStatusText = insideZones && insideZones.length > 0
        ? `Inside: ${insideZones.join(", ")}`
        : "Outside geofences";

      setSuccess(`Location updated for Vehicle ID #${vId}! Status: ${zoneStatusText}`);
      setMapRefreshTrigger((prev) => prev + 1);
      await loadDashboard();
    } catch (err) {
      console.error("Update location error:", err);
      setFormError(err.message || "Unable to update vehicle location.");
    } finally {
      setSaving(false);
    }
  }

  // CONFIGURE ALERT RULE
  function openAlertConfigModal() {
    setAlertConfigForm({
      geofence_id: geofences[0] ? String(geofences[0].id) : "",
      vehicle_id: "",
      event_type: "both",
    });
    setFormError("");
    setShowConfigAlertModal(true);
  }

  async function handleConfigureAlert(event) {
    event.preventDefault();
    setFormError("");
    setSaving(true);

    const gId = Number(alertConfigForm.geofence_id);
    const vId = alertConfigForm.vehicle_id ? Number(alertConfigForm.vehicle_id) : null;

    if (!gId || !Number.isFinite(gId)) {
      setFormError("Please select a valid geofence.");
      setSaving(false);
      return;
    }

    const payload = {
      geofence_id: gId,
      vehicle_id: vId,
      event_type: alertConfigForm.event_type,
    };

    try {
      await configureAlert(payload);
      setShowConfigAlertModal(false);
      setSuccess("Alert rule configured successfully.");
      await loadDashboard();
    } catch (err) {
      console.error("Configure alert error:", err);
      setFormError(err.message || "Unable to configure alert.");
    } finally {
      setSaving(false);
    }
  }

  // Filtered lists
  const filteredGeofences = geofences.filter((geo) =>
    `${geo.name || ""} ${geo.category || ""} ${geo.description || ""} ${geo.status || ""}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );

  const filteredVehicles = vehicles.filter((v) =>
    `${v.vehicle_number || ""} ${v.driver_name || ""} ${v.vehicle_type || ""} ${v.phone || ""}`
      .toLowerCase()
      .includes(vehicleSearchTerm.toLowerCase())
  );

  // Alerts filtering
  const filteredAlerts = alerts.filter((a) => {
    if (alertGeofenceFilter && String(a.geofence?.id) !== String(alertGeofenceFilter)) return false;
    if (alertVehicleFilter && String(a.vehicle?.id) !== String(alertVehicleFilter)) return false;
    if (alertTypeFilter && a.event_type !== alertTypeFilter) return false;
    return true;
  });

  function resetAlertFilter() {
    setAlertGeofenceFilter("");
    setAlertVehicleFilter("");
    setAlertTypeFilter("");
  }

  // Violations filtering
  async function applyViolationFilter() {
    setLoading(true);
    setPageError("");
    try {
      const params = {};
      if (violationGeofenceFilter) params.geofence_id = violationGeofenceFilter;
      if (violationVehicleFilter) params.vehicle_id = violationVehicleFilter;
      const data = await getViolations(params);
      let list = data.violations || [];
      if (violationTypeFilter) {
        list = list.filter((v) => v.event_type === violationTypeFilter);
      }
      setViolations(list);
    } catch (err) {
      setPageError(err.message || "Failed to filter violations");
    } finally {
      setLoading(false);
    }
  }

  function resetViolationFilter() {
    setViolationGeofenceFilter("");
    setViolationVehicleFilter("");
    setViolationTypeFilter("");
    loadDashboard();
  }

  const navItems = [
    { label: "Dashboard", icon: LayoutDashboard },
    { label: "Geofences", icon: MapPin },
    { label: "Vehicles", icon: Truck },
    { label: "Alerts", icon: Bell },
    { label: "Violations History", icon: History },
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand" onClick={() => navigate("Dashboard")} style={{ cursor: "pointer" }}>
          <div className="brand-icon"><Radio size={22} /></div>
          <div>
            <h2>GeoTrack</h2>
            <span>FLEET INTELLIGENCE</span>
          </div>
        </div>

        <div className="nav-section">
          <p className="nav-label">MAIN MENU</p>
          <nav>
            {navItems.map(({ label, icon: Icon }) => (
              <a
                key={label}
                className={`nav-item ${page === label ? "active" : ""}`}
                onClick={() => navigate(label)}
              >
                <Icon size={19} />
                <span>{label}</span>
              </a>
            ))}
          </nav>
        </div>

        <div className="sidebar-bottom">
          <p className="nav-label">PREFERENCES</p>
          <a
            className={`nav-item ${page === "Settings" ? "active" : ""}`}
            onClick={() => navigate("Settings")}
          >
            <Settings size={19} />
            <span>Settings</span>
          </a>
          <div className="profile">
            <div className="avatar">GT</div>
            <div className="profile-info">
              <strong>GeoTrack Admin</strong>
              <span>Administrator</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <span onClick={() => navigate("Dashboard")} style={{ cursor: "pointer" }}>Workspace</span>
            <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>

          <div className="top-actions">
            <div className="system-status">
              <span className="status-dot"></span>
              System Operational
            </div>
            <div
              className="system-status"
              style={{
                color: wsConnected ? "#16845b" : "#b77b32",
                background: wsConnected ? "#eaf5ee" : "#fbf2e6",
                padding: "4px 8px",
                borderRadius: "12px",
                fontSize: 11,
              }}
            >
              <span
                className="status-dot"
                style={{ background: wsConnected ? "#20a477" : "#d97706" }}
              ></span>
              {wsConnected ? "WebSocket Live" : "WS Reconnecting"}
            </div>
            <button className="notification-button" onClick={() => navigate("Alerts")} title="View Alerts">
              <Bell size={19} />
              {alerts.length > 0 && <span className="notification-dot"></span>}
            </button>
            <div className="top-avatar" onClick={() => navigate("Settings")} style={{ cursor: "pointer" }} title="Settings">
              A
            </div>
          </div>
        </header>

        <section className="content">
          {liveToast && (
            <div
              style={{
                marginBottom: 16,
                padding: "14px 18px",
                borderRadius: 8,
                background: "#fef3c7",
                border: "1px solid #fcd34d",
                color: "#92400e",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                boxShadow: "0 4px 12px rgba(217, 119, 6, 0.15)",
                animation: "select-appear 0.2s ease-out",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <AlertTriangle size={19} color="#d97706" />
                <span>{liveToast.message}</span>
              </div>
              <button
                onClick={() => setLiveToast(null)}
                style={{
                  border: 0,
                  background: "transparent",
                  cursor: "pointer",
                  color: "#92400e",
                }}
              >
                <X size={16} />
              </button>
            </div>
          )}

          {pageError && (
            <div className="error-message">
              {pageError}
              <button onClick={loadDashboard}>Retry</button>
            </div>
          )}

          {success && (
            <div className="success-message" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{success}</span>
              <button
                onClick={() => setSuccess("")}
                style={{ border: 0, background: "transparent", cursor: "pointer", color: "#12845b" }}
              >
                <X size={15} />
              </button>
            </div>
          )}

          {/* ===================== DASHBOARD VIEW ===================== */}
          {page === "Dashboard" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">OVERVIEW</p>
                  <h1>Dashboard</h1>
                  <p className="page-description">
                    Monitor your fleet, geofences and real-time activity.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="secondary-button" onClick={openVehicleModal}>
                    <Plus size={15} /> Add Vehicle
                  </button>
                  <button className="primary-button" onClick={openGeofenceModal}>
                    <Plus size={17} /> Add Geofence
                  </button>
                </div>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-heading">
                    <span>Total Geofences</span>
                    <div className="stat-icon blue"><MapPin size={19} /></div>
                  </div>
                  <h2>{loading ? "..." : geofences.length}</h2>
                  <p>Configured monitoring zones</p>
                </div>

                <div className="stat-card">
                  <div className="stat-heading">
                    <span>Registered Vehicles</span>
                    <div className="stat-icon teal"><Truck size={19} /></div>
                  </div>
                  <h2>{loading ? "..." : vehicles.length}</h2>
                  <p>Fleet vehicles registered</p>
                </div>

                <div className="stat-card">
                  <div className="stat-heading">
                    <span>Active Alerts</span>
                    <div className="stat-icon amber"><Bell size={19} /></div>
                  </div>
                  <h2>{loading ? "..." : alerts.length}</h2>
                  <p>Recorded geofence events</p>
                </div>

                <div className="stat-card">
                  <div className="stat-heading">
                    <span>System Status</span>
                    <div className="stat-icon green"><ShieldCheck size={19} /></div>
                  </div>
                  <h2 className="status-value">{wsConnected ? "Live Connected" : "Operational"}</h2>
                  <p>PostGIS & WebSocket active</p>
                </div>
              </div>

              <div className="section-heading">
                <div>
                  <h2>Live Vehicle Monitoring</h2>
                  <p>Geographic overview of your fleet and active geofences.</p>
                </div>
                <div className="map-actions">
                  <button className="secondary-button" onClick={() => openLocationModal()}>
                    <Navigation size={15} /> Update GPS
                  </button>
                  <button className="secondary-button" onClick={() => navigate("Vehicles")}>
                    <Truck size={15} /> Vehicles
                  </button>
                  <button className="secondary-button" onClick={loadDashboard}>
                    <RefreshCw size={14} /> Refresh
                  </button>
                </div>
              </div>

              <div className="map-container">
                <MapView refreshTrigger={mapRefreshTrigger} />
              </div>

              <div className="bottom-grid">
                <div className="panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Recent Alerts</h3>
                      <p>Latest geofence events</p>
                    </div>
                    <span
                      className="text-button"
                      onClick={() => navigate("Alerts")}
                      style={{ cursor: "pointer" }}
                    >
                      View all <ArrowUpRight size={15} />
                    </span>
                  </div>

                  {alerts.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon"><Bell size={21} /></div>
                      <p>No recent alerts available</p>
                    </div>
                  ) : (
                    <div className="activity-list">
                      {alerts.slice(0, 5).map((alert, index) => (
                        <div className="activity-row" key={alert.id || alert.event_id || index}>
                          <div
                            className="activity-indicator"
                            style={{
                              background: alert.event_type === "entry" ? "#e7f6ee" : "#fff3e3",
                              color: alert.event_type === "entry" ? "#12845b" : "#b77b32",
                            }}
                          >
                            <Bell size={16} />
                          </div>
                          <div>
                            <strong>
                              {alert.vehicle?.vehicle_number || "Vehicle"} {alert.event_type?.toUpperCase()}
                            </strong>
                            <p>
                              Zone: {alert.geofence?.name || "Geofence"} ·{" "}
                              {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : "Just now"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Fleet Overview</h3>
                      <p>Registered vehicles and locations</p>
                    </div>
                    <span
                      className="text-button"
                      onClick={() => navigate("Vehicles")}
                      style={{ cursor: "pointer" }}
                    >
                      View fleet <ArrowUpRight size={15} />
                    </span>
                  </div>

                  {vehicles.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon"><Activity size={21} /></div>
                      <p>No registered vehicles</p>
                    </div>
                  ) : (
                    <div className="activity-list">
                      {vehicles.slice(0, 5).map((vehicle) => {
                        const loc = vehicleLocations[vehicle.id];
                        const inside = loc?.current_geofences?.some((g) => g.status === "inside");
                        return (
                          <div className="activity-row" key={vehicle.id}>
                            <div className="activity-indicator"><Truck size={16} /></div>
                            <div style={{ flex: 1 }}>
                              <strong>{vehicle.vehicle_number}</strong>
                              <p>
                                {vehicle.driver_name} · {vehicle.vehicle_type} · {vehicle.phone}
                              </p>
                            </div>
                            <span
                              style={{
                                fontSize: 11,
                                padding: "4px 8px",
                                borderRadius: 12,
                                fontWeight: 600,
                                background: !loc ? "#f1f4f8" : inside ? "#e7f6ee" : "#fff3e3",
                                color: !loc ? "#6b7280" : inside ? "#12845b" : "#b77b32",
                              }}
                            >
                              {!loc ? "No GPS" : inside ? "Inside Zone" : "Outside"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ===================== GEOFENCES VIEW ===================== */}
          {page === "Geofences" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">LOCATION MANAGEMENT</p>
                  <h1>Geofences</h1>
                  <p className="page-description">
                    Create and manage your fleet monitoring zones.
                  </p>
                </div>
                <button className="primary-button" onClick={openGeofenceModal}>
                  <Plus size={17} /> Add Geofence
                </button>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-heading">
                    <span>Total Geofences</span>
                    <div className="stat-icon blue"><MapPin size={19} /></div>
                  </div>
                  <h2>{geofences.length}</h2>
                  <p>Configured monitoring zones</p>
                </div>

                <div className="stat-card">
                  <div className="stat-heading">
                    <span>Active Zones</span>
                    <div className="stat-icon green"><ShieldCheck size={19} /></div>
                  </div>
                  <h2>{geofences.filter((g) => g.status === "active").length}</h2>
                  <p>Currently active geofences</p>
                </div>
              </div>

              <div className="panel" style={{ marginTop: 24 }}>
                <div className="panel-heading" style={{ flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <h3>All Geofences</h3>
                    <p>Manage your configured geographic boundaries ({filteredGeofences.length} shown).</p>
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search geofences..."
                      style={{
                        padding: "10px 12px",
                        border: "1px solid #dce3ed",
                        borderRadius: 7,
                        outline: "none",
                        width: 220,
                      }}
                    />
                    {searchTerm && (
                      <button className="secondary-button" onClick={() => setSearchTerm("")}>
                        Clear
                      </button>
                    )}
                    <button className="secondary-button" onClick={loadDashboard}>
                      <RefreshCw size={14} /> Refresh
                    </button>
                  </div>
                </div>

                {loading ? (
                  <p style={{ padding: 20 }}>Loading geofences...</p>
                ) : filteredGeofences.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon"><MapPinned size={21} /></div>
                    <p>{searchTerm ? "No geofences match your search." : "No geofences found. Add your first geofence."}</p>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      textAlign: "left",
                      fontSize: 14,
                    }}>
                      <thead>
                        <tr style={{ background: "#f6f8fb", color: "#63738a" }}>
                          {["ID", "NAME", "CATEGORY", "DESCRIPTION", "STATUS"].map((heading) => (
                            <th key={heading} style={{
                              padding: "15px 16px",
                              fontWeight: 600,
                              borderBottom: "1px solid #e8edf3",
                            }}>
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredGeofences.map((geo) => (
                          <tr key={geo.id}>
                            <td style={{ padding: 16, borderBottom: "1px solid #edf0f4", color: "#8a98a9" }}>
                              #{geo.id}
                            </td>
                            <td style={{ padding: 16, borderBottom: "1px solid #edf0f4" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div className="stat-icon blue"><MapPin size={17} /></div>
                                <strong>{geo.name}</strong>
                              </div>
                            </td>
                            <td style={{ padding: 16, borderBottom: "1px solid #edf0f4" }}>
                              <span style={{
                                padding: "4px 8px",
                                borderRadius: 6,
                                background: "#f0f4f9",
                                color: "#253b53",
                                fontSize: 12,
                                fontWeight: 500,
                              }}>
                                {geo.category}
                              </span>
                            </td>
                            <td style={{ padding: 16, borderBottom: "1px solid #edf0f4", color: "#64758b" }}>
                              {geo.description || "—"}
                            </td>
                            <td style={{ padding: 16, borderBottom: "1px solid #edf0f4" }}>
                              <span style={{
                                display: "inline-block",
                                padding: "5px 10px",
                                borderRadius: 20,
                                background: geo.status === "active" ? "#e7f6ee" : "#fff3e3",
                                color: geo.status === "active" ? "#12845b" : "#a66a12",
                                fontSize: 12,
                                fontWeight: 600,
                              }}>
                                {geo.status || "active"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ===================== VEHICLES VIEW ===================== */}
          {page === "Vehicles" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">FLEET MANAGEMENT</p>
                  <h1>Vehicles</h1>
                  <p className="page-description">
                    Manage fleet vehicles, register new assets, and update GPS locations.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="secondary-button" onClick={() => openLocationModal()}>
                    <Navigation size={15} /> Update GPS Location
                  </button>
                  <button className="primary-button" onClick={openVehicleModal}>
                    <Plus size={17} /> Add Vehicle
                  </button>
                </div>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-heading">
                    <span>Total Vehicles</span>
                    <div className="stat-icon teal"><Truck size={19} /></div>
                  </div>
                  <h2>{vehicles.length}</h2>
                  <p>Registered in system</p>
                </div>

                <div className="stat-card">
                  <div className="stat-heading">
                    <span>Tracked on GPS</span>
                    <div className="stat-icon blue"><Activity size={19} /></div>
                  </div>
                  <h2>{Object.keys(vehicleLocations).length}</h2>
                  <p>Vehicles with coordinates</p>
                </div>

                <div className="stat-card">
                  <div className="stat-heading">
                    <span>Inside Geofence</span>
                    <div className="stat-icon green"><ShieldCheck size={19} /></div>
                  </div>
                  <h2>
                    {
                      Object.values(vehicleLocations).filter((loc) =>
                        loc.current_geofences?.some((g) => g.status === "inside")
                      ).length
                    }
                  </h2>
                  <p>Currently within zone</p>
                </div>

                <div className="stat-card">
                  <div className="stat-heading">
                    <span>Outside Geofence</span>
                    <div className="stat-icon amber"><Radio size={19} /></div>
                  </div>
                  <h2>
                    {
                      Object.values(vehicleLocations).filter(
                        (loc) => !loc.current_geofences?.some((g) => g.status === "inside")
                      ).length
                    }
                  </h2>
                  <p>Operating outside boundaries</p>
                </div>
              </div>

              <div className="panel" style={{ marginTop: 24 }}>
                <div className="panel-heading" style={{ flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <h3>Registered Fleet Assets</h3>
                    <p>Live coordinates and geofence containment status from PostgreSQL ({filteredVehicles.length} shown).</p>
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <input
                      value={vehicleSearchTerm}
                      onChange={(e) => setVehicleSearchTerm(e.target.value)}
                      placeholder="Search vehicles, driver, type..."
                      style={{
                        padding: "10px 12px",
                        border: "1px solid #dce3ed",
                        borderRadius: 7,
                        outline: "none",
                        width: 250,
                      }}
                    />
                    {vehicleSearchTerm && (
                      <button className="secondary-button" onClick={() => setVehicleSearchTerm("")}>
                        Clear
                      </button>
                    )}
                    <button className="secondary-button" onClick={loadDashboard}>
                      <RefreshCw size={14} /> Refresh
                    </button>
                  </div>
                </div>

                {loading ? (
                  <p style={{ padding: 20 }}>Loading vehicles...</p>
                ) : filteredVehicles.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon"><Truck size={21} /></div>
                    <p>{vehicleSearchTerm ? "No vehicles match your search." : "No vehicles found. Click 'Add Vehicle' to register one."}</p>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      textAlign: "left",
                      fontSize: 14,
                    }}>
                      <thead>
                        <tr style={{ background: "#f6f8fb", color: "#63738a" }}>
                          {["ID", "VEHICLE NUMBER", "DRIVER NAME", "TYPE", "PHONE", "CURRENT GEOFENCE", "GPS COORDINATES", "ACTIONS"].map((heading) => (
                            <th key={heading} style={{
                              padding: "15px 16px",
                              fontWeight: 600,
                              borderBottom: "1px solid #e8edf3",
                            }}>
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredVehicles.map((vehicle) => {
                          const loc = vehicleLocations[vehicle.id];
                          const insideZone = loc?.current_geofences?.find((g) => g.status === "inside");
                          return (
                            <tr key={vehicle.id}>
                              <td style={{ padding: 16, borderBottom: "1px solid #edf0f4", color: "#8a98a9" }}>
                                #{vehicle.id}
                              </td>
                              <td style={{ padding: 16, borderBottom: "1px solid #edf0f4" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <div className="stat-icon teal"><Truck size={17} /></div>
                                  <strong>{vehicle.vehicle_number}</strong>
                                </div>
                              </td>
                              <td style={{ padding: 16, borderBottom: "1px solid #edf0f4" }}>
                                {vehicle.driver_name}
                              </td>
                              <td style={{ padding: 16, borderBottom: "1px solid #edf0f4" }}>
                                <span style={{
                                  padding: "4px 8px",
                                  borderRadius: 6,
                                  background: "#f0f4f9",
                                  color: "#253b53",
                                  fontSize: 12,
                                  fontWeight: 500,
                                }}>
                                  {vehicle.vehicle_type}
                                </span>
                              </td>
                              <td style={{ padding: 16, borderBottom: "1px solid #edf0f4", color: "#64758b" }}>
                                {vehicle.phone || "—"}
                              </td>
                              <td style={{ padding: 16, borderBottom: "1px solid #edf0f4" }}>
                                {insideZone ? (
                                  <span style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 5,
                                    padding: "5px 10px",
                                    borderRadius: 20,
                                    background: "#e7f6ee",
                                    color: "#12845b",
                                    fontSize: 12,
                                    fontWeight: 600,
                                  }}>
                                    <CheckCircle2 size={13} /> Inside {insideZone.name}
                                  </span>
                                ) : loc ? (
                                  <span style={{
                                    display: "inline-block",
                                    padding: "5px 10px",
                                    borderRadius: 20,
                                    background: "#fff3e3",
                                    color: "#a66a12",
                                    fontSize: 12,
                                    fontWeight: 600,
                                  }}>
                                    Outside Geofences
                                  </span>
                                ) : (
                                  <span style={{ color: "#9ca3af", fontSize: 13 }}>No location yet</span>
                                )}
                              </td>
                              <td style={{ padding: 16, borderBottom: "1px solid #edf0f4", fontSize: 13, color: "#475569" }}>
                                {loc ? (
                                  <div>
                                    <span>Lat: {loc.latitude.toFixed(4)}</span>
                                    <br />
                                    <span>Lon: {loc.longitude.toFixed(4)}</span>
                                  </div>
                                ) : (
                                  <span style={{ color: "#9ca3af" }}>—</span>
                                )}
                              </td>
                              <td style={{ padding: 16, borderBottom: "1px solid #edf0f4" }}>
                                <button
                                  className="secondary-button"
                                  onClick={() => openLocationModal(vehicle.id)}
                                  style={{ padding: "6px 10px", fontSize: 12 }}
                                >
                                  <Navigation size={13} /> Update GPS
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ===================== ALERTS VIEW ===================== */}
          {page === "Alerts" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">NOTIFICATIONS & RULES</p>
                  <h1>Alerts & Events</h1>
                  <p className="page-description">
                    Live stream of geofence breach, entry, and exit events.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="primary-button" onClick={openAlertConfigModal}>
                    <Plus size={17} /> Configure Alert Rule
                  </button>
                  <button className="secondary-button" onClick={loadDashboard}>
                    <RefreshCw size={14} /> Refresh
                  </button>
                </div>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-heading">
                    <span>Total Alerts</span>
                    <div className="stat-icon amber"><Bell size={19} /></div>
                  </div>
                  <h2>{alerts.length}</h2>
                  <p>Recorded events</p>
                </div>

                <div className="stat-card">
                  <div className="stat-heading">
                    <span>Entry Events</span>
                    <div className="stat-icon green"><CheckCircle2 size={19} /></div>
                  </div>
                  <h2>{alerts.filter((a) => a.event_type === "entry").length}</h2>
                  <p>Vehicles entered zones</p>
                </div>

                <div className="stat-card">
                  <div className="stat-heading">
                    <span>Exit Events</span>
                    <div className="stat-icon amber"><AlertTriangle size={19} /></div>
                  </div>
                  <h2>{alerts.filter((a) => a.event_type === "exit").length}</h2>
                  <p>Vehicles exited zones</p>
                </div>

                <div className="stat-card">
                  <div className="stat-heading">
                    <span>WebSocket Stream</span>
                    <div className="stat-icon blue"><Radio size={19} /></div>
                  </div>
                  <h2 className="status-value" style={{ fontSize: 18 }}>
                    {wsConnected ? "Active Stream" : "Disconnected"}
                  </h2>
                  <p>Port 8080 /ws/alerts</p>
                </div>
              </div>

              <div className="panel" style={{ marginTop: 24 }}>
                <div className="panel-heading" style={{ flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                  <div>
                    <h3>Alert History Log</h3>
                    <p>Real-time geofence events received from WebSocket and database ({filteredAlerts.length} shown).</p>
                  </div>
                  <span className="live-tag"><span></span> LIVE UPDATING</span>
                </div>

                {/* Filter controls for Alerts */}
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16, background: "#f8fafc", padding: "12px 14px", borderRadius: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Filter size={15} color="#64748b" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Filter Alerts:</span>
                  </div>

                  <select
                    value={alertGeofenceFilter}
                    onChange={(e) => setAlertGeofenceFilter(e.target.value)}
                    style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid #dce3ed", fontSize: 13, background: "white" }}
                  >
                    <option value="">All Geofences</option>
                    {geofences.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={alertVehicleFilter}
                    onChange={(e) => setAlertVehicleFilter(e.target.value)}
                    style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid #dce3ed", fontSize: 13, background: "white" }}
                  >
                    <option value="">All Vehicles</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.vehicle_number}
                      </option>
                    ))}
                  </select>

                  <select
                    value={alertTypeFilter}
                    onChange={(e) => setAlertTypeFilter(e.target.value)}
                    style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid #dce3ed", fontSize: 13, background: "white" }}
                  >
                    <option value="">All Event Types</option>
                    <option value="entry">Entry Events Only</option>
                    <option value="exit">Exit Events Only</option>
                  </select>

                  {(alertGeofenceFilter || alertVehicleFilter || alertTypeFilter) && (
                    <button className="secondary-button" onClick={resetAlertFilter} style={{ padding: "7px 12px" }}>
                      Reset Filters
                    </button>
                  )}
                </div>

                {filteredAlerts.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon"><Bell size={21} /></div>
                    <p>No alerts match the criteria.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      textAlign: "left",
                      fontSize: 14,
                    }}>
                      <thead>
                        <tr style={{ background: "#f6f8fb", color: "#63738a" }}>
                          {["ID", "EVENT TYPE", "VEHICLE", "DRIVER", "GEOFENCE", "COORDINATES", "TIMESTAMP"].map((h) => (
                            <th key={h} style={{ padding: "15px 16px", fontWeight: 600, borderBottom: "1px solid #e8edf3" }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAlerts.map((a, idx) => (
                          <tr key={a.id || a.event_id || idx}>
                            <td style={{ padding: 16, borderBottom: "1px solid #edf0f4", color: "#8a98a9" }}>
                              #{a.id || a.event_id || idx + 1}
                            </td>
                            <td style={{ padding: 16, borderBottom: "1px solid #edf0f4" }}>
                              <span style={{
                                display: "inline-block",
                                padding: "4px 9px",
                                borderRadius: 16,
                                fontWeight: 700,
                                fontSize: 11,
                                letterSpacing: 0.5,
                                background: a.event_type === "entry" ? "#e7f6ee" : "#fee2e2",
                                color: a.event_type === "entry" ? "#12845b" : "#b91c1c",
                              }}>
                                {a.event_type?.toUpperCase()}
                              </span>
                            </td>
                            <td style={{ padding: 16, borderBottom: "1px solid #edf0f4" }}>
                              <strong>{a.vehicle?.vehicle_number || "—"}</strong>
                            </td>
                            <td style={{ padding: 16, borderBottom: "1px solid #edf0f4" }}>
                              {a.vehicle?.driver_name || "—"}
                            </td>
                            <td style={{ padding: 16, borderBottom: "1px solid #edf0f4" }}>
                              <span style={{ fontWeight: 600, color: "#1e3a8a" }}>
                                {a.geofence?.name || "Geofence"}
                              </span>
                              <span style={{ fontSize: 12, color: "#6b7280", marginLeft: 6 }}>
                                ({a.geofence?.category || "zone"})
                              </span>
                            </td>
                            <td style={{ padding: 16, borderBottom: "1px solid #edf0f4", fontSize: 13, color: "#475569" }}>
                              {a.location
                                ? `${Number(a.location.latitude).toFixed(4)}, ${Number(a.location.longitude).toFixed(4)}`
                                : a.latitude && a.longitude
                                ? `${Number(a.latitude).toFixed(4)}, ${Number(a.longitude).toFixed(4)}`
                                : "—"}
                            </td>
                            <td style={{ padding: 16, borderBottom: "1px solid #edf0f4", fontSize: 13, color: "#64748b" }}>
                              {a.timestamp || a.created_at
                                ? new Date(a.timestamp || a.created_at).toLocaleString()
                                : "Just now"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ===================== VIOLATIONS HISTORY VIEW ===================== */}
          {page === "Violations History" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">AUDIT & COMPLIANCE</p>
                  <h1>Violations History</h1>
                  <p className="page-description">
                    Audit log of boundary breaches and unauthorized zone activities.
                  </p>
                </div>
                <button className="secondary-button" onClick={loadDashboard}>
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>

              <div className="panel" style={{ marginTop: 20 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16, background: "#f8fafc", padding: "12px 14px", borderRadius: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Filter size={15} color="#64748b" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Filter Violations:</span>
                  </div>

                  <select
                    value={violationGeofenceFilter}
                    onChange={(e) => setViolationGeofenceFilter(e.target.value)}
                    style={{
                      padding: "7px 10px",
                      borderRadius: 6,
                      border: "1px solid #dce3ed",
                      fontSize: 13,
                      background: "white",
                    }}
                  >
                    <option value="">All Geofences</option>
                    {geofences.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={violationVehicleFilter}
                    onChange={(e) => setViolationVehicleFilter(e.target.value)}
                    style={{
                      padding: "7px 10px",
                      borderRadius: 6,
                      border: "1px solid #dce3ed",
                      fontSize: 13,
                      background: "white",
                    }}
                  >
                    <option value="">All Vehicles</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.vehicle_number} ({v.driver_name})
                      </option>
                    ))}
                  </select>

                  <select
                    value={violationTypeFilter}
                    onChange={(e) => setViolationTypeFilter(e.target.value)}
                    style={{
                      padding: "7px 10px",
                      borderRadius: 6,
                      border: "1px solid #dce3ed",
                      fontSize: 13,
                      background: "white",
                    }}
                  >
                    <option value="">All Event Types</option>
                    <option value="entry">Entry Events</option>
                    <option value="exit">Exit Events</option>
                  </select>

                  <button className="primary-button" onClick={applyViolationFilter} style={{ padding: "7px 13px" }}>
                    Apply Filter
                  </button>
                  <button className="secondary-button" onClick={resetViolationFilter} style={{ padding: "7px 13px" }}>
                    Reset
                  </button>
                </div>

                {loading ? (
                  <p style={{ padding: 20 }}>Loading violations history...</p>
                ) : violations.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon"><History size={21} /></div>
                    <p>No violation records match the selected criteria.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      textAlign: "left",
                      fontSize: 14,
                    }}>
                      <thead>
                        <tr style={{ background: "#f6f8fb", color: "#63738a" }}>
                          {["ID", "EVENT", "VEHICLE", "DRIVER", "GEOFENCE", "ZONE CATEGORY", "RECORDED AT"].map((h) => (
                            <th key={h} style={{ padding: "15px 16px", fontWeight: 600, borderBottom: "1px solid #e8edf3" }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {violations.map((v) => (
                          <tr key={v.id}>
                            <td style={{ padding: 16, borderBottom: "1px solid #edf0f4", color: "#8a98a9" }}>
                              #{v.id}
                            </td>
                            <td style={{ padding: 16, borderBottom: "1px solid #edf0f4" }}>
                              <span style={{
                                padding: "4px 8px",
                                borderRadius: 14,
                                fontSize: 11,
                                fontWeight: 700,
                                background: v.event_type === "entry" ? "#e7f6ee" : "#fee2e2",
                                color: v.event_type === "entry" ? "#12845b" : "#b91c1c",
                              }}>
                                {v.event_type?.toUpperCase()}
                              </span>
                            </td>
                            <td style={{ padding: 16, borderBottom: "1px solid #edf0f4" }}>
                              <strong>{v.vehicle?.vehicle_number}</strong>
                            </td>
                            <td style={{ padding: 16, borderBottom: "1px solid #edf0f4" }}>
                              {v.vehicle?.driver_name}
                            </td>
                            <td style={{ padding: 16, borderBottom: "1px solid #edf0f4", fontWeight: 600, color: "#1e3a8a" }}>
                              {v.geofence?.name}
                            </td>
                            <td style={{ padding: 16, borderBottom: "1px solid #edf0f4" }}>
                              <span style={{
                                padding: "3px 8px",
                                borderRadius: 6,
                                background: "#f0f4f9",
                                fontSize: 12,
                              }}>
                                {v.geofence?.category}
                              </span>
                            </td>
                            <td style={{ padding: 16, borderBottom: "1px solid #edf0f4", fontSize: 13, color: "#64748b" }}>
                              {v.timestamp || v.created_at ? new Date(v.timestamp || v.created_at).toLocaleString() : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ===================== SETTINGS VIEW ===================== */}
          {page === "Settings" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">SYSTEM CONFIGURATION</p>
                  <h1>Settings & Environment</h1>
                  <p className="page-description">
                    Runtime service endpoints, database topology, and platform diagnostics.
                  </p>
                </div>
                <button className="secondary-button" onClick={loadDashboard}>
                  <RefreshCw size={14} /> Run Diagnostics
                </button>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-heading">
                    <span>Backend Server</span>
                    <div className="stat-icon blue"><Server size={19} /></div>
                  </div>
                  <h2 style={{ fontSize: 20 }}>Online</h2>
                  <p>http://localhost:8080</p>
                </div>

                <div className="stat-card">
                  <div className="stat-heading">
                    <span>Spatial Database</span>
                    <div className="stat-icon green"><Database size={19} /></div>
                  </div>
                  <h2 style={{ fontSize: 20 }}>PostGIS 3.5</h2>
                  <p>PostgreSQL 16 (Port 5432)</p>
                </div>

                <div className="stat-card">
                  <div className="stat-heading">
                    <span>WebSocket Hub</span>
                    <div className="stat-icon amber"><Radio size={19} /></div>
                  </div>
                  <h2 style={{ fontSize: 20 }}>{wsConnected ? "Connected" : "Reconnecting"}</h2>
                  <p>/ws/alerts stream</p>
                </div>

                <div className="stat-card">
                  <div className="stat-heading">
                    <span>Frontend Client</span>
                    <div className="stat-icon teal"><Activity size={19} /></div>
                  </div>
                  <h2 style={{ fontSize: 20 }}>React 19 Vite</h2>
                  <p>Port 5173 (Nginx on Port 80 in Docker)</p>
                </div>
              </div>

              <div className="panel" style={{ marginTop: 20 }}>
                <div className="panel-heading">
                  <div>
                    <h3>Connection Parameters</h3>
                    <p>Active runtime configuration.</p>
                  </div>
                </div>
                <div style={{ marginTop: 16, fontSize: 13, lineHeight: 1.8, color: "#475569" }}>
                  <div><strong>Database Name:</strong> geofencing_db</div>
                  <div><strong>Spatial Extensions:</strong> postgis (SRID 4326)</div>
                  <div><strong>API Execution Nanosecond Tracking:</strong> Active (time_ns included in all responses)</div>
                  <div><strong>Real-Time Alert Mechanism:</strong> Gorilla WebSocket Broadcaster</div>
                </div>
              </div>
            </>
          )}

          <footer className="footer">
            <span>GeoTrack Fleet Intelligence · MapUp Geofencing Real-Time Alert System</span>
            <span><Clock3 size={13} /> Real-time monitoring platform</span>
          </footer>
        </section>
      </main>

      {/* ===================== MODAL: ADD GEOFENCE ===================== */}
      {showGeofenceModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowGeofenceModal(false);
              setFormError("");
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(13, 27, 42, 0.58)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
          }}
        >
          <div style={{
            width: "100%",
            maxWidth: 560,
            maxHeight: "90vh",
            overflowY: "auto",
            background: "#fff",
            borderRadius: 12,
            padding: 26,
            boxShadow: "0 20px 60px rgba(0,0,0,.2)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
              <div>
                <h2 style={{ margin: 0, color: "#172b45" }}>Add New Geofence</h2>
                <p style={{ margin: "6px 0 0", color: "#7b899b", fontSize: 13 }}>
                  Define a geographic monitoring boundary in PostGIS.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowGeofenceModal(false);
                  setFormError("");
                }}
                style={{ border: 0, background: "#f1f4f8", borderRadius: 7, padding: 8, cursor: "pointer" }}
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={handleCreateGeofence}>
              <label style={fieldLabel}>Geofence Name *</label>
              <input
                required
                maxLength={150}
                value={geoForm.name}
                onChange={(e) => setGeoForm({ ...geoForm, name: e.target.value })}
                placeholder="e.g. Hyderabad Delivery Zone"
                style={fieldStyle}
              />

              <label style={fieldLabel}>Description</label>
              <textarea
                value={geoForm.description}
                onChange={(e) => setGeoForm({ ...geoForm, description: e.target.value })}
                placeholder="Enter a short description"
                rows={2}
                style={{ ...fieldStyle, resize: "vertical" }}
              />

              <label style={fieldLabel}>Category *</label>
              <Select
                value={geoForm.category}
                onValueChange={(value) => setGeoForm({ ...geoForm, category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="delivery_zone">Delivery Zone</SelectItem>
                  <SelectItem value="restricted_zone">Restricted Zone</SelectItem>
                  <SelectItem value="toll_zone">Toll Zone</SelectItem>
                  <SelectItem value="customer_area">Customer Area</SelectItem>
                </SelectContent>
              </Select>

              <div style={{ fontSize: 13, fontWeight: 600, color: "#263d59", margin: "20px 0 10px" }}>
                Boundary Coordinates
              </div>
              <p style={{ fontSize: 12, color: "#7b899b", margin: "0 0 12px" }}>
                Enter latitude and longitude limits for a rectangular geofence.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  ["South Latitude", "south"],
                  ["West Longitude", "west"],
                  ["North Latitude", "north"],
                  ["East Longitude", "east"],
                ].map(([label, key]) => (
                  <div key={key}>
                    <label style={fieldLabel}>{label} *</label>
                    <input
                      required
                      type="number"
                      step="any"
                      value={geoForm[key]}
                      onChange={(e) => setGeoForm({ ...geoForm, [key]: e.target.value })}
                      style={fieldStyle}
                    />
                  </div>
                ))}
              </div>

              {formError && (
                <div style={{ color: "#ac1717", background: "#fff0f0", border: "1px solid #f4cccc", padding: 11, borderRadius: 7, fontSize: 13, marginTop: 14 }}>
                  {formError}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setShowGeofenceModal(false);
                    setFormError("");
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={saving}>
                  <Plus size={16} />
                  {saving ? "Saving..." : "Create Geofence"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: ADD VEHICLE ===================== */}
      {showVehicleModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowVehicleModal(false);
              setFormError("");
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(13, 27, 42, 0.58)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
          }}
        >
          <div style={{
            width: "100%",
            maxWidth: 500,
            maxHeight: "90vh",
            overflowY: "auto",
            background: "#fff",
            borderRadius: 12,
            padding: 26,
            boxShadow: "0 20px 60px rgba(0,0,0,.2)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
              <div>
                <h2 style={{ margin: 0, color: "#172b45" }}>Register Vehicle</h2>
                <p style={{ margin: "6px 0 0", color: "#7b899b", fontSize: 13 }}>
                  Add a new vehicle asset to the fleet tracking system.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowVehicleModal(false);
                  setFormError("");
                }}
                style={{ border: 0, background: "#f1f4f8", borderRadius: 7, padding: 8, cursor: "pointer" }}
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={handleCreateVehicle}>
              <label style={fieldLabel}>Vehicle Number *</label>
              <input
                required
                maxLength={50}
                value={vehicleForm.vehicle_number}
                onChange={(e) => setVehicleForm({ ...vehicleForm, vehicle_number: e.target.value })}
                placeholder="e.g. TS09AB9999"
                style={fieldStyle}
              />

              <label style={fieldLabel}>Driver Name *</label>
              <input
                required
                maxLength={100}
                value={vehicleForm.driver_name}
                onChange={(e) => setVehicleForm({ ...vehicleForm, driver_name: e.target.value })}
                placeholder="e.g. Amit Kumar"
                style={fieldStyle}
              />

              <label style={fieldLabel}>Vehicle Type *</label>
              <Select
                value={vehicleForm.vehicle_type}
                onValueChange={(val) => setVehicleForm({ ...vehicleForm, vehicle_type: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Truck">Truck</SelectItem>
                  <SelectItem value="Van">Van</SelectItem>
                  <SelectItem value="Car">Car</SelectItem>
                  <SelectItem value="Bike">Bike</SelectItem>
                  <SelectItem value="Trailer">Trailer</SelectItem>
                </SelectContent>
              </Select>

              <div style={{ marginTop: 16 }}>
                <label style={fieldLabel}>Driver Phone Number *</label>
                <input
                  required
                  maxLength={20}
                  value={vehicleForm.phone}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, phone: e.target.value })}
                  placeholder="e.g. 9876543210"
                  style={fieldStyle}
                />
              </div>

              {formError && (
                <div style={{ color: "#ac1717", background: "#fff0f0", border: "1px solid #f4cccc", padding: 11, borderRadius: 7, fontSize: 13, marginTop: 14 }}>
                  {formError}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setShowVehicleModal(false);
                    setFormError("");
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={saving}>
                  <Truck size={16} />
                  {saving ? "Registering..." : "Register Vehicle"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: UPDATE GPS LOCATION ===================== */}
      {showLocationModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowLocationModal(false);
              setFormError("");
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(13, 27, 42, 0.58)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
          }}
        >
          <div style={{
            width: "100%",
            maxWidth: 520,
            maxHeight: "90vh",
            overflowY: "auto",
            background: "#fff",
            borderRadius: 12,
            padding: 26,
            boxShadow: "0 20px 60px rgba(0,0,0,.2)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, color: "#172b45" }}>Update Vehicle GPS</h2>
                <p style={{ margin: "6px 0 0", color: "#7b899b", fontSize: 13 }}>
                  Post new GPS coordinates to trigger geofence entry/exit detection.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowLocationModal(false);
                  setFormError("");
                }}
                style={{ border: 0, background: "#f1f4f8", borderRadius: 7, padding: 8, cursor: "pointer" }}
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={handleUpdateLocation}>
              <label style={fieldLabel}>Select Vehicle *</label>
              <select
                required
                value={locationForm.vehicle_id}
                onChange={(e) => {
                  const selectedId = e.target.value;
                  const existing = vehicleLocations[selectedId];
                  setLocationForm({
                    vehicle_id: selectedId,
                    latitude: existing?.latitude != null ? String(existing.latitude) : locationForm.latitude,
                    longitude: existing?.longitude != null ? String(existing.longitude) : locationForm.longitude,
                  });
                }}
                style={fieldStyle}
              >
                <option value="">Select a vehicle</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    #{v.id} - {v.vehicle_number} ({v.driver_name})
                  </option>
                ))}
              </select>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={fieldLabel}>Latitude *</label>
                  <input
                    required
                    type="number"
                    step="any"
                    value={locationForm.latitude}
                    onChange={(e) => setLocationForm({ ...locationForm, latitude: e.target.value })}
                    style={fieldStyle}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>Longitude *</label>
                  <input
                    required
                    type="number"
                    step="any"
                    value={locationForm.longitude}
                    onChange={(e) => setLocationForm({ ...locationForm, longitude: e.target.value })}
                    style={fieldStyle}
                  />
                </div>
              </div>

              {/* Quick test coordinates */}
              <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8, border: "1px dashed #cbd5e1", marginBottom: 16 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 8 }}>
                  Quick Test Presets:
                </span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setLocationForm((prev) => ({ ...prev, latitude: "17.388", longitude: "78.489" }))}
                    style={{
                      background: "#e0f2fe",
                      border: "1px solid #bae6fd",
                      color: "#0369a1",
                      borderRadius: 5,
                      padding: "4px 8px",
                      fontSize: 11,
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    📍 Inside Hyderabad Zone (17.388, 78.489)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocationForm((prev) => ({ ...prev, latitude: "17.450", longitude: "78.550" }))}
                    style={{
                      background: "#fef3c7",
                      border: "1px solid #fde68a",
                      color: "#92400e",
                      borderRadius: 5,
                      padding: "4px 8px",
                      fontSize: 11,
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    🚀 Outside All Zones (17.450, 78.550)
                  </button>
                </div>
              </div>

              {formError && (
                <div style={{ color: "#ac1717", background: "#fff0f0", border: "1px solid #f4cccc", padding: 11, borderRadius: 7, fontSize: 13, marginTop: 14 }}>
                  {formError}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setShowLocationModal(false);
                    setFormError("");
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={saving}>
                  <Navigation size={16} />
                  {saving ? "Updating..." : "Send GPS Update"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: CONFIGURE ALERT RULE ===================== */}
      {showConfigAlertModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowConfigAlertModal(false);
              setFormError("");
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(13, 27, 42, 0.58)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
          }}
        >
          <div style={{
            width: "100%",
            maxWidth: 500,
            maxHeight: "90vh",
            overflowY: "auto",
            background: "#fff",
            borderRadius: 12,
            padding: 26,
            boxShadow: "0 20px 60px rgba(0,0,0,.2)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, color: "#172b45" }}>Configure Alert Rule</h2>
                <p style={{ margin: "6px 0 0", color: "#7b899b", fontSize: 13 }}>
                  Create an alert trigger for geofence entry and exit events.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowConfigAlertModal(false);
                  setFormError("");
                }}
                style={{ border: 0, background: "#f1f4f8", borderRadius: 7, padding: 8, cursor: "pointer" }}
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={handleConfigureAlert}>
              <label style={fieldLabel}>Target Geofence *</label>
              <select
                required
                value={alertConfigForm.geofence_id}
                onChange={(e) => setAlertConfigForm({ ...alertConfigForm, geofence_id: e.target.value })}
                style={fieldStyle}
              >
                <option value="">Select a geofence</option>
                {geofences.map((g) => (
                  <option key={g.id} value={g.id}>
                    #{g.id} - {g.name} ({g.category})
                  </option>
                ))}
              </select>

              <label style={fieldLabel}>Vehicle Filter (Optional)</label>
              <select
                value={alertConfigForm.vehicle_id}
                onChange={(e) => setAlertConfigForm({ ...alertConfigForm, vehicle_id: e.target.value })}
                style={fieldStyle}
              >
                <option value="">All Vehicles (Global Trigger)</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    #{v.id} - {v.vehicle_number} ({v.driver_name})
                  </option>
                ))}
              </select>

              <label style={fieldLabel}>Event Type *</label>
              <Select
                value={alertConfigForm.event_type}
                onValueChange={(val) => setAlertConfigForm({ ...alertConfigForm, event_type: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select event trigger" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Both (Entry and Exit)</SelectItem>
                  <SelectItem value="entry">Entry Only</SelectItem>
                  <SelectItem value="exit">Exit Only</SelectItem>
                </SelectContent>
              </Select>

              {formError && (
                <div style={{ color: "#ac1717", background: "#fff0f0", border: "1px solid #f4cccc", padding: 11, borderRadius: 7, fontSize: 13, marginTop: 14 }}>
                  {formError}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setShowConfigAlertModal(false);
                    setFormError("");
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={saving}>
                  <Bell size={16} />
                  {saving ? "Saving..." : "Save Rule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
