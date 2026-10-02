const SUPABASE_URL = "https://bsnbazyinaagjbuwqsce.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_LtWTS47B0PkF2-axs5p4gw_IotLxbUJ";
const COLOMBIA_TIME_ZONE = "America/Bogota";

function formatColombiaDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: COLOMBIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(date);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderGuide(record) {
  const events = Array.isArray(record.events) ? record.events : [];
  const eventHtml = events.length
    ? events.slice().reverse().map(e => `
      <div class="timeline-item">
        <strong>${escapeHtml(e.status)}</strong>
        <small>${escapeHtml(e.note || "")}${e.created_at ? " · " + formatColombiaDateTime(e.created_at) : ""}</small>
      </div>`).join("")
    : '<div class="timeline-item"><strong>Guía registrada</strong></div>';

  return `
    <article class="result-card">
      <span class="status-badge">${escapeHtml(record.status || "En proceso")}</span>
      <h3>${escapeHtml(record.guide)}</h3>
      <div class="result-grid">
        <div class="result-item"><span>Cliente</span><strong>${escapeHtml(record.customer_name || "Cliente FOX GAMER")}</strong></div>
        <div class="result-item"><span>Cédula</span><strong>${escapeHtml(record.customer_document || "No registrada")}</strong></div>
        <div class="result-item"><span>Teléfono</span><strong>${escapeHtml(record.customer_phone || "No registrado")}</strong></div>
        <div class="result-item"><span>Pedido</span><strong>${escapeHtml(record.product || "Pedido FOX GAMER")}</strong></div>
        <div class="result-item"><span>Ciudad de entrega</span><strong>${escapeHtml(record.city || "Por confirmar")}</strong></div>
        <div class="result-item"><span>Dirección de entrega</span><strong>${escapeHtml(record.address || "Registrada en el sistema")}</strong></div>
        <div class="result-item"><span>Mensajero</span><strong>${escapeHtml(record.driver || "Por asignar")}</strong></div>
        <div class="result-item"><span>Ventana de entrega</span><strong>${escapeHtml(record.delivery_window || "Por confirmar")}</strong></div>
        <div class="result-item"><span>Última actualización</span><strong>${record.updated_at ? formatColombiaDateTime(record.updated_at) : "Sin dato"}</strong></div>
      </div>
      <div class="timeline">${eventHtml}</div>
    </article>`;
}

document.getElementById("year").textContent = new Date().getFullYear();

const form = document.getElementById("tracking-form");
const input = document.getElementById("guide");
const result = document.getElementById("tracking-result");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = input.value.trim().toUpperCase();
  if (!query) return;

  result.innerHTML = `<article class="result-card"><h3>Consultando guía…</h3></article>`;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/track_shipment`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "apikey": SUPABASE_PUBLISHABLE_KEY,
        "authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
      },
      body: JSON.stringify({ p_guide: query }),
      cache: "no-store"
    });

    if (!response.ok) throw new Error("No se pudo consultar la guía");
    const data = await response.json();
    if (!data) throw new Error("Guía no encontrada");
    result.innerHTML = renderGuide(data);
  } catch (error) {
    result.innerHTML = `
      <article class="result-card">
        <h3>No encontramos esa guía</h3>
        <p style="font-size:15px;color:#7f899e;margin:0">
          Verifica el número ingresado o comunícate con FOX GAMER por WhatsApp.
        </p>
      </article>`;
  }
});