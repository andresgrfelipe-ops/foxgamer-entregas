const { createClient } = require("@libsql/client");
const crypto = require("crypto");

function db() {
  const url = process.env.LIBSQL_URL;
  const authToken = process.env.LIBSQL_AUTH_TOKEN;
  if (!url) throw new Error("Falta LIBSQL_URL");
  return createClient({ url, authToken });
}

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

function isAdmin(event) {
  const expected = process.env.ADMIN_TOKEN;
  return Boolean(expected) && event.headers["x-admin-token"] === expected;
}

async function getPublicShipment(client, guide) {
  const shipmentRs = await client.execute({
    sql: `SELECT id, guide, product, city, status, driver, delivery_window, created_at, updated_at
          FROM shipments WHERE UPPER(guide)=UPPER(?) LIMIT 1`,
    args: [guide]
  });
  if (!shipmentRs.rows.length) return null;
  const shipment = shipmentRs.rows[0];
  const eventsRs = await client.execute({
    sql: `SELECT status, note, responsible, created_at
          FROM shipment_events WHERE shipment_id=? ORDER BY created_at ASC`,
    args: [shipment.id]
  });
  return { ...shipment, events: eventsRs.rows };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  try {
    const client = db();
    const params = event.queryStringParameters || {};

    if (event.httpMethod === "GET" && params.guide) {
      const shipment = await getPublicShipment(client, params.guide.trim());
      return shipment ? json(200, shipment) : json(404, { error: "Guía no encontrada" });
    }

    if (!isAdmin(event)) return json(401, { error: "No autorizado" });

    if (event.httpMethod === "GET") {
      const rs = await client.execute(
        `SELECT id, guide, customer_name, customer_phone, product, address, city, driver,
                status, delivery_window, created_at, updated_at
         FROM shipments ORDER BY updated_at DESC LIMIT 200`
      );
      return json(200, { shipments: rs.rows });
    }

    const body = event.body ? JSON.parse(event.body) : {};

    if (event.httpMethod === "POST") {
      const required = ["guide","customer_name","customer_phone","product","address","city"];
      for (const key of required) {
        if (!String(body[key] || "").trim()) return json(400, { error: `Falta ${key}` });
      }
      const id = crypto.randomUUID();
      const now = Date.now();
      const status = String(body.status || "Guía creada");
      await client.batch([
        {
          sql: `INSERT INTO shipments
                (id, guide, customer_name, customer_phone, product, address, city, driver, status, delivery_window, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            id, String(body.guide).trim().toUpperCase(), body.customer_name, body.customer_phone,
            body.product, body.address, body.city, body.driver || null, status,
            body.delivery_window || null, now, now
          ]
        },
        {
          sql: `INSERT INTO shipment_events (shipment_id, status, note, responsible, created_at)
                VALUES (?, ?, ?, ?, ?)`,
          args: [id, status, body.note || null, body.responsible || "Administración FOX GAMER", now]
        }
      ], "write");
      return json(201, { ok: true, id });
    }

    if (event.httpMethod === "PATCH") {
      if (!body.id || !body.status) return json(400, { error: "Faltan id o status" });
      const now = Date.now();
      await client.batch([
        {
          sql: `UPDATE shipments
                SET status=?, driver=COALESCE(?, driver), delivery_window=COALESCE(?, delivery_window), updated_at=?
                WHERE id=?`,
          args: [body.status, body.driver || null, body.delivery_window || null, now, body.id]
        },
        {
          sql: `INSERT INTO shipment_events (shipment_id, status, note, responsible, created_at)
                VALUES (?, ?, ?, ?, ?)`,
          args: [body.id, body.status, body.note || null, body.responsible || "Administración FOX GAMER", now]
        }
      ], "write");
      return json(200, { ok: true });
    }

    if (event.httpMethod === "DELETE") {
      if (!body.id) return json(400, { error: "Falta id" });
      await client.execute({ sql: "DELETE FROM shipments WHERE id=?", args: [body.id] });
      return json(200, { ok: true });
    }

    return json(405, { error: "Método no permitido" });
  } catch (error) {
    console.error(error);
    const msg = String(error && error.message || error);
    if (msg.includes("UNIQUE")) return json(409, { error: "La guía ya existe" });
    return json(500, { error: "Error interno del sistema" });
  }
};
