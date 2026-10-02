function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type,x-admin-token",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

const SUPABASE_URL = process.env.SUPABASE_URL || "https://bsnbazyinaagjbuwqsce.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function legacyDb() {
  const url = process.env.LIBSQL_URL;
  const authToken = process.env.LIBSQL_AUTH_TOKEN;
  if (!url) return null;
  const { createClient } = require("@libsql/client");
  return createClient({ url, authToken });
}

function toIso(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const n = Number(value);
    const date = new Date(n);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function recoverLegacyIfNeeded() {
  const existing = await sb("shipments?select=id&limit=1");
  if (existing?.length) return { recovered: 0, source: "supabase" };

  const client = legacyDb();
  if (!client) return { recovered: 0, source: "none" };

  const legacyShipments = await client.execute(
    `SELECT id, guide, customer_name, customer_phone, product, address, city, driver,
            status, delivery_window, created_at, updated_at
     FROM shipments ORDER BY updated_at DESC LIMIT 500`
  );

  const rows = legacyShipments.rows || [];
  if (!rows.length) return { recovered: 0, source: "legacy-empty" };

  const normalized = rows.map(row => ({
    id: String(row.id),
    guide: String(row.guide || "").trim().toUpperCase(),
    customer_name: String(row.customer_name || ""),
    customer_phone: String(row.customer_phone || ""),
    product: String(row.product || ""),
    address: String(row.address || ""),
    city: String(row.city || ""),
    driver: row.driver || null,
    status: row.status || "Guía creada",
    delivery_window: row.delivery_window || null,
    created_at: toIso(row.created_at) || new Date().toISOString(),
    updated_at: toIso(row.updated_at) || toIso(row.created_at) || new Date().toISOString()
  }));

  await sb("shipments?on_conflict=id", {
    method: "POST",
    headers: { "prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(normalized)
  });

  const ids = normalized.map(row => row.id);
  let recoveredEvents = 0;
  if (ids.length) {
    const legacyEvents = await client.execute(
      `SELECT shipment_id, status, note, responsible, created_at
       FROM shipment_events ORDER BY created_at ASC`
    );
    const events = (legacyEvents.rows || [])
      .filter(row => ids.includes(String(row.shipment_id)))
      .map(row => ({
        shipment_id: String(row.shipment_id),
        status: row.status || "Guía creada",
        note: row.note || null,
        responsible: row.responsible || "Administración FOX GAMER",
        created_at: toIso(row.created_at) || new Date().toISOString()
      }));
    if (events.length) {
      await sb("shipment_events", {
        method: "POST",
        body: JSON.stringify(events)
      });
      recoveredEvents = events.length;
    }
  }

  return { recovered: normalized.length, recoveredEvents, source: "legacy-libsql" };
}


function adminAuthStatus(event) {
  const expected = process.env.ADMIN_TOKEN;
  const received = event.headers["x-admin-token"] || "";
  if (!expected) return { ok: false, reason: "ADMIN_TOKEN no está configurado en Production" };
  if (!received) return { ok: false, reason: "El navegador no está enviando el token" };
  if (received !== expected) return { ok: false, reason: "El token no coincide con ADMIN_TOKEN de Production" };
  return { ok: true };
}

function isAdmin(event) {
  return adminAuthStatus(event).ok;
}

async function sb(path, options = {}) {
  if (!SERVICE_KEY) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      "apikey": SERVICE_KEY,
      "authorization": `Bearer ${SERVICE_KEY}`,
      "prefer": "return=representation",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.message || data?.details || data?.hint || response.statusText;
    throw new Error(message);
  }
  return data;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  try {
    const auth = adminAuthStatus(event);
    if (!auth.ok) return json(401, { error: auth.reason });

    if (event.httpMethod === "GET") {
      let recovery = { recovered: 0, source: "supabase" };
      try {
        recovery = await recoverLegacyIfNeeded();
      } catch (recoveryError) {
        console.error("Legacy recovery skipped:", recoveryError);
      }

      const rows = await sb("shipments?select=id,guide,customer_name,customer_phone,product,address,city,driver,status,delivery_window,created_at,updated_at&order=updated_at.desc&limit=200");
      return json(200, { shipments: rows || [], recovery });
    }

    const body = event.body ? JSON.parse(event.body) : {};

    if (event.httpMethod === "POST") {
      const required = ["guide","customer_name","customer_phone","product","address","city"];
      for (const key of required) {
        if (!String(body[key] || "").trim()) return json(400, { error: `Falta ${key}` });
      }

      const shipmentRows = await sb("shipments", {
        method: "POST",
        body: JSON.stringify([{
          guide: String(body.guide).trim().toUpperCase(),
          customer_name: String(body.customer_name).trim(),
          customer_phone: String(body.customer_phone).trim(),
          product: String(body.product).trim(),
          address: String(body.address).trim(),
          city: String(body.city).trim(),
          driver: body.driver || null,
          status: body.status || "Guía creada",
          delivery_window: body.delivery_window || null
        }])
      });

      const shipment = shipmentRows?.[0];
      if (!shipment) throw new Error("No se pudo crear la guía");

      await sb("shipment_events", {
        method: "POST",
        body: JSON.stringify([{
          shipment_id: shipment.id,
          status: shipment.status,
          note: body.note || null,
          responsible: body.responsible || "Administración FOX GAMER"
        }])
      });

      return json(201, { ok: true, id: shipment.id });
    }

    if (event.httpMethod === "PATCH") {
      if (!body.id || !body.status) return json(400, { error: "Faltan id o status" });

      const patch = {
        status: body.status,
        updated_at: new Date().toISOString()
      };
      if (body.driver !== undefined) patch.driver = body.driver || null;
      if (body.delivery_window !== undefined) patch.delivery_window = body.delivery_window || null;

      await sb(`shipments?id=eq.${encodeURIComponent(body.id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });

      await sb("shipment_events", {
        method: "POST",
        body: JSON.stringify([{
          shipment_id: body.id,
          status: body.status,
          note: body.note || null,
          responsible: body.responsible || "Administración FOX GAMER"
        }])
      });

      return json(200, { ok: true });
    }

    if (event.httpMethod === "DELETE") {
      if (!body.id) return json(400, { error: "Falta id" });
      await sb(`shipments?id=eq.${encodeURIComponent(body.id)}`, { method: "DELETE" });
      return json(200, { ok: true });
    }

    return json(405, { error: "Método no permitido" });
  } catch (error) {
    console.error(error);
    const msg = String(error?.message || error);
    if (/duplicate|unique/i.test(msg)) return json(409, { error: "La guía ya existe" });
    return json(500, { error: "Error interno del sistema" });
  }
};