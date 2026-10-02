const TOKEN_KEY = "foxgamer_admin_token";
const COLOMBIA_TIME_ZONE = "America/Bogota";

function token() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function fmt(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: COLOMBIA_TIME_ZONE,
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function guideFromPath() {
  const parts = location.pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts[parts.length - 1] || "").toUpperCase();
}

function renderGuide(g) {
  const updated = g.updated_at || g.created_at;
  return `
    <div class="guide-doc-head">
      <div>
        <span class="guide-doc-kicker">DOCUMENTO DE ENVÍO</span>
        <h1>Guía de transporte</h1>
        <p>FOX GAMER Entregas · Colombia</p>
      </div>
      <div class="guide-doc-number">
        <span>Número de guía</span>
        <strong>${esc(g.guide)}</strong>
        <small>${esc(g.status || "Guía creada")}</small>
      </div>
    </div>

    <div class="guide-doc-meta">
      <div><span>Fecha de creación</span><strong>${fmt(g.created_at)}</strong></div>
      <div><span>Última actualización</span><strong>${fmt(updated)}</strong></div>
      <div><span>Zona horaria</span><strong>Colombia · America/Bogota</strong></div>
    </div>

    <div class="guide-doc-section">
      <h2>Destinatario</h2>
      <div class="guide-doc-grid">
        <div><span>Cliente</span><strong>${esc(g.customer_name || "—")}</strong></div>
        <div><span>Teléfono</span><strong>${esc(g.customer_phone || "—")}</strong></div>
        <div class="wide"><span>Dirección</span><strong>${esc(g.address || "—")}</strong></div>
        <div><span>Ciudad</span><strong>${esc(g.city || "—")}</strong></div>
        <div><span>Mensajero</span><strong>${esc(g.driver || "Por asignar")}</strong></div>
      </div>
    </div>

    <div class="guide-doc-section">
      <h2>Información del envío</h2>
      <div class="guide-doc-grid">
        <div class="wide"><span>Artículo / pedido</span><strong>${esc(g.product || "—")}</strong></div>
        <div><span>Estado</span><strong>${esc(g.status || "Guía creada")}</strong></div>
        <div><span>Ventana de entrega</span><strong>${esc(g.delivery_window || "Por confirmar")}</strong></div>
      </div>
    </div>

    <div class="guide-doc-footer">
      <div>
        <strong>FOX GAMER Entregas</strong>
        <span>Documento generado desde el panel administrativo.</span>
      </div>
      <div class="guide-doc-stamp">FG</div>
    </div>
  `;
}

async function loadGuide() {
  const container = document.getElementById("guide-document");
  if (!token()) {
    container.innerHTML = '<div class="guide-document-error"><h2>Configura el acceso</h2><p>Abre primero el panel administrativo e ingresa el token.</p><a class="primary-btn" href="/admin">Ir al panel</a></div>';
    return;
  }
  try {
    const response = await fetch("/api/shipments", {
      headers: {"x-admin-token": token()},
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "No se pudo cargar");
    const code = guideFromPath();
    const shipment = (data.shipments || []).find(item => String(item.guide || "").toUpperCase() === code);
    if (!shipment) throw new Error("Guía no encontrada");
    container.innerHTML = renderGuide(shipment);
    document.title = shipment.guide + " | FOX GAMER Entregas";
  } catch (error) {
    container.innerHTML = '<div class="guide-document-error"><h2>No pudimos abrir esta guía</h2><p>' + esc(error.message) + '</p><a class="secondary-btn" href="/admin">Volver al panel</a></div>';
  }
}

document.getElementById("print-guide").addEventListener("click", () => window.print());
loadGuide();