CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Geofences
CREATE TABLE IF NOT EXISTS geofences (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    category VARCHAR(30) NOT NULL CHECK (
        category IN (
            'delivery_zone',
            'restricted_zone',
            'toll_zone',
            'customer_area'
        )
    ),
    boundary GEOMETRY(Polygon, 4326) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Vehicles
CREATE TABLE IF NOT EXISTS vehicles (
    id BIGSERIAL PRIMARY KEY,
    vehicle_number VARCHAR(50) UNIQUE NOT NULL,
    driver_name VARCHAR(100) NOT NULL,
    vehicle_type VARCHAR(50) NOT NULL,
    phone VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Vehicle location history
CREATE TABLE IF NOT EXISTS vehicle_locations (
    id BIGSERIAL PRIMARY KEY,
    vehicle_id BIGINT NOT NULL REFERENCES vehicles(id),
    location GEOMETRY(Point, 4326) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL
);

-- 4. Alert configurations
CREATE TABLE IF NOT EXISTS alert_configs (
    id BIGSERIAL PRIMARY KEY,
    geofence_id BIGINT NOT NULL REFERENCES geofences(id),
    vehicle_id BIGINT REFERENCES vehicles(id),
    event_type VARCHAR(10) NOT NULL CHECK (
        event_type IN ('entry', 'exit', 'both')
    ),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Alerts
CREATE TABLE IF NOT EXISTS alerts (
    id BIGSERIAL PRIMARY KEY,
    vehicle_id BIGINT NOT NULL REFERENCES vehicles(id),
    geofence_id BIGINT NOT NULL REFERENCES geofences(id),
    event_type VARCHAR(10) NOT NULL CHECK (
        event_type IN ('entry', 'exit')
    ),
    location GEOMETRY(Point, 4326) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for faster location and geofence searches
CREATE INDEX IF NOT EXISTS idx_geofence_boundary
ON geofences USING GIST(boundary);

CREATE INDEX IF NOT EXISTS idx_vehicle_location
ON vehicle_locations USING GIST(location);

CREATE INDEX IF NOT EXISTS idx_location_vehicle_time
ON vehicle_locations(vehicle_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_vehicle
ON alerts(vehicle_id);

CREATE INDEX IF NOT EXISTS idx_alerts_geofence
ON alerts(geofence_id);