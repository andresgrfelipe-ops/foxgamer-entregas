const TOKEN_KEY = "foxgamer_admin_token";
const COLOMBIA_TIME_ZONE = "America/Bogota";

function colombiaYear() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: COLOMBIA_TIME_ZONE,
    year: "numeric"
  }).format(new Date());
}

function token() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function notify(text) {
  const toast = document.getElementById("toast");
  toast.textContent = text;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

function headers() {
  return {
    "content-type": "application/json",
    "x-admin-token": token()
  };
}

async function api(method = "GET", body) {
  const response = await fetch("/api/shipments", {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Error");
  return data;
}

async function render() {
  const list = document.getElementById("guide-list");
  try {
    const data = await api();
    const shipments = data.shipments || [];
    if (!shipments.length) {
      list.innerHTML = '<div class="empty">No hay guías registradas todavía.</div>';
      return;
    }
    list.innerHTML = shipments.map(g => `
      <article class="guide-row">
        <div>
          <h3>${g.guide}</h3>
          <p>${g.product} · ${g.city}</p>
          <p><strong>${g.status}</strong>${g.driver ? " · " + g.driver : ""}</p>
        </div>
        <div class="row-actions">
          <button class="icon-btn" data-action="advance" data-id="${g.id}" data-status="${g.status}" title="Avanzar estado">↻</button>
          <button class="icon-btn" data-action="copy" data-guide="${g.guide}" title="Copiar guía">⧉</button>
          <button class="icon-btn" data-action="delete" data-id="${g.id}" title="Eliminar">⌫</button>
        </div>
      </article>`).join("");
  } catch (error) {
    list.innerHTML = '<div class="empty">Configura el acceso de administrador para cargar las guías.</div>';
  }
}

function nextStatus(current) {
  const flow = ["Guía creada","Recogido","En centro logístico","En tránsito","En reparto","Entregado"];
  const i = flow.indexOf(current);
  if (i === -1) return "Guía creada";
  return flow[Math.min(i + 1, flow.length - 1)];
}

document.getElementById("login-btn").addEventListener("click", () => {
  const value = prompt("Token de administrador:", token());
  if (value === null) return;
  localStorage.setItem(TOKEN_KEY, value.trim());
  render();
});

document.getElementById("generate-btn").addEventListener("click", () => {
  const y = colombiaYear();
  const n = Math.floor(100000 + Math.random() * 900000);
  document.getElementById("guide").value = `FG-${y}-${n}`;
});

document.getElementById("guide-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
  values.guide = String(values.guide || "").trim().toUpperCase();
  values.responsible = "Administración FOX GAMER";

  try {
    await api("POST", values);
    event.currentTarget.reset();
    notify("Guía guardada");
    render();
  } catch (error) {
    notify(error.message);
  }
});

document.getElementById("guide-list").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  try {
    if (button.dataset.action === "advance") {
      await api("PATCH", {
        id: button.dataset.id,
        status: nextStatus(button.dataset.status),
        responsible: "Administración FOX GAMER"
      });
      notify("Estado actualizado");
      render();
    }
    if (button.dataset.action === "copy") {
      await navigator.clipboard.writeText(button.dataset.guide);
      notify("Número de guía copiado");
    }
    if (button.dataset.action === "delete") {
      if (!confirm("¿Eliminar esta guía?")) return;
      await api("DELETE", { id: button.dataset.id });
      notify("Guía eliminada");
      render();
    }
  } catch (error) {
    notify(error.message);
  }
});

render();