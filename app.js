const STORAGE_KEY = "foxgamer_entregas_guides_v1";

const seedGuides = [
  {
    guide: "FG-2026-052756",
    customer: "Cliente FOX GAMER",
    city: "Cubarral, Meta",
    item: "PlayStation 5 Pro",
    status: "Guía creada",
    carrier: "FOX GAMER Entregas",
    updatedAt: "2026-09-27T12:00:00",
    events: [
      { label: "Guía creada", date: "27/09/2026 12:00" }
    ]
  }
];

function loadGuides() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seedGuides));
      return seedGuides;
    }
    return JSON.parse(raw);
  } catch {
    return seedGuides;
  }
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
        <strong>${escapeHtml(e.label)}</strong>
        <small>${escapeHtml(e.date || "")}</small>
      </div>`).join("")
    : '<div class="timeline-item"><strong>Guía registrada</strong></div>';

  return `
    <article class="result-card">
      <span class="status-badge">${escapeHtml(record.status || "En proceso")}</span>
      <h3>${escapeHtml(record.guide)}</h3>
      <div class="result-grid">
        <div class="result-item"><span>Pedido</span><strong>${escapeHtml(record.item || "Pedido FOX GAMER")}</strong></div>
        <div class="result-item"><span>Destino</span><strong>${escapeHtml(record.city || "Por confirmar")}</strong></div>
        <div class="result-item"><span>Transportadora</span><strong>${escapeHtml(record.carrier || "FOX GAMER Entregas")}</strong></div>
        <div class="result-item"><span>Última actualización</span><strong>${new Date(record.updatedAt || Date.now()).toLocaleString("es-CO")}</strong></div>
      </div>
      <div class="timeline">${eventHtml}</div>
    </article>`;
}

document.getElementById("year").textContent = new Date().getFullYear();

const form = document.getElementById("tracking-form");
const input = document.getElementById("guide");
const result = document.getElementById("tracking-result");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = input.value.trim().toUpperCase();
  const guides = loadGuides();
  const record = guides.find(g => String(g.guide || "").toUpperCase() === query);

  if (!record) {
    result.innerHTML = `
      <article class="result-card">
        <h3>No encontramos esa guía</h3>
        <p style="font-size:15px;color:#7f899e;margin:0">
          Verifica el número ingresado o comunícate con FOX GAMER por WhatsApp.
        </p>
      </article>`;
    return;
  }

  result.innerHTML = renderGuide(record);
});