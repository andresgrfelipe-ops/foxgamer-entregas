const STORAGE_KEY = "foxgamer_entregas_guides_v1";

const defaultGuide = {
  guide: "FG-2026-052756",
  customer: "Cliente FOX GAMER",
  city: "Cubarral, Meta",
  item: "PlayStation 5 Pro",
  status: "Guía creada",
  carrier: "FOX GAMER Entregas",
  updatedAt: "2026-09-27T12:00:00",
  events: [{ label: "Guía creada", date: "27/09/2026 12:00" }]
};

function loadGuides() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([defaultGuide]));
      return [defaultGuide];
    }
    return JSON.parse(raw);
  } catch {
    return [defaultGuide];
  }
}

function saveGuides(guides) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(guides));
}

function esc(v = "") {
  return String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nowLabel() {
  return new Date().toLocaleString("es-CO");
}

function notify(text) {
  const toast = document.getElementById("toast");
  toast.textContent = text;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

function render() {
  const guides = loadGuides();
  const list = document.getElementById("guide-list");

  if (!guides.length) {
    list.innerHTML = '<div class="empty">No hay guías registradas todavía.</div>';
    return;
  }

  list.innerHTML = guides.slice().reverse().map((g, reverseIndex) => {
    const index = guides.length - 1 - reverseIndex;
    return `
      <article class="guide-row">
        <div>
          <h3>${esc(g.guide)}</h3>
          <p>${esc(g.item || "Pedido FOX GAMER")} · ${esc(g.city || "Sin destino")}</p>
          <p><strong>${esc(g.status || "En proceso")}</strong></p>
        </div>
        <div class="row-actions">
          <button class="icon-btn" data-action="advance" data-index="${index}" title="Avanzar estado">↻</button>
          <button class="icon-btn" data-action="copy" data-index="${index}" title="Copiar guía">⧉</button>
          <button class="icon-btn" data-action="delete" data-index="${index}" title="Eliminar">⌫</button>
        </div>
      </article>`;
  }).join("");
}

function nextStatus(current) {
  const flow = ["Guía creada","Recogido","En centro logístico","En tránsito","En reparto","Entregado"];
  const i = flow.indexOf(current);
  return i === -1 || i === flow.length - 1 ? flow[0] : flow[i + 1];
}

document.getElementById("generate-btn").addEventListener("click", () => {
  const y = new Date().getFullYear();
  const n = Math.floor(100000 + Math.random() * 900000);
  document.getElementById("guide").value = `FG-${y}-${n}`;
});

document.getElementById("guide-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const guide = String(data.get("guide") || "").trim().toUpperCase();
  if (!guide) return;

  const guides = loadGuides();
  if (guides.some(g => String(g.guide).toUpperCase() === guide)) {
    notify("Ese número de guía ya existe");
    return;
  }

  const status = String(data.get("status") || "Guía creada");
  guides.push({
    guide,
    customer: String(data.get("customer") || "").trim(),
    city: String(data.get("city") || "").trim(),
    item: String(data.get("item") || "").trim(),
    note: String(data.get("note") || "").trim(),
    status,
    carrier: "FOX GAMER Entregas",
    updatedAt: new Date().toISOString(),
    events: [{ label: status, date: nowLabel() }]
  });

  saveGuides(guides);
  event.currentTarget.reset();
  render();
  notify("Guía guardada");
});

document.getElementById("guide-list").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const index = Number(button.dataset.index);
  const guides = loadGuides();
  const guide = guides[index];
  if (!guide) return;

  if (button.dataset.action === "advance") {
    guide.status = nextStatus(guide.status);
    guide.updatedAt = new Date().toISOString();
    guide.events = Array.isArray(guide.events) ? guide.events : [];
    guide.events.push({ label: guide.status, date: nowLabel() });
    saveGuides(guides);
    render();
    notify(`Estado: ${guide.status}`);
  }

  if (button.dataset.action === "copy") {
    await navigator.clipboard.writeText(guide.guide);
    notify("Número de guía copiado");
  }

  if (button.dataset.action === "delete") {
    if (!confirm(`¿Eliminar la guía ${guide.guide}?`)) return;
    guides.splice(index, 1);
    saveGuides(guides);
    render();
    notify("Guía eliminada");
  }
});

document.getElementById("export-btn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(loadGuides(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `foxgamer-entregas-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

render();