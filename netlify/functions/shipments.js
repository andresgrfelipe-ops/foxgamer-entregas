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

function isAdmin(event) {
  const expected = process.env.ADMIN_TOKEN;
  return Boolean(expected) && event.headers["x-admin-token"] === expected;
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
    if (!isAdmin(event)) return json(401, { error: "No autorizado" });

    if (event.httpMethod === "GET") {
      const rows = await sb("shipments?select=id,guide,customer_name,customer_phone,product,address,city,driver,status,delivery_window,created_at,updated_at&order=updated_at.desc&limit=200");
      return json(200, { shipments: rows || [] });
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