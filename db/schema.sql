PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY NOT NULL,
  guide TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  product TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  driver TEXT,
  status TEXT NOT NULL DEFAULT 'Guía creada',
  delivery_window TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shipments_updated_at ON shipments(updated_at);
CREATE INDEX IF NOT EXISTS idx_shipments_customer_name ON shipments(customer_name);

CREATE TABLE IF NOT EXISTS shipment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  shipment_id TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT,
  responsible TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment_id ON shipment_events(shipment_id);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  shipment_id TEXT,
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
