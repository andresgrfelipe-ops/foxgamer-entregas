const SUPABASE_URL = "https://bsnbazyinaagjbuwqsce.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_LtWTS47B0PkF2-axs5p4gw_IotLxbUJ";
const TOKEN_KEY = "foxgamer_admin_token";
const ADMIN_USERNAME = "foxgamer";
const COLOMBIA_TIME_ZONE = "America/Bogota";
let allShipments = [];
let activeFilter = "all";
let searchQuery = "";
let recoveryAttempted = false;

function colombiaYear() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: COLOMBIA_TIME_ZONE,
    year: "numeric"
  }).format(new Date());
}

function formatColombiaDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: COLOMBIA_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

function updateColombiaClock() {
  const el = document.getElementById("colombia-clock");
  if (!el) return;
  el.textContent = new Intl.DateTimeFormat("es-CO", {
    timeZone: COLOMBIA_TIME_ZONE,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(new Date());
}

function updateStats(shipments) {
  const delivered = shipments.filter(g => g.status === "Entregado").length;
  const routeStatuses = new Set(["Recogido","En centro logístico","En tránsito","En reparto"]);
  const inRoute = shipments.filter(g => routeStatuses.has(g.status)).length;
  document.getElementById("stat-total").textContent = shipments.length;
  document.getElementById("stat-route").textContent = inRoute;
  document.getElementById("stat-delivered").textContent = delivered;
  document.getElementById("stat-pending").textContent = Math.max(0, shipments.length - delivered);
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
  const action = method === "GET" ? "list" :
    method === "POST" ? "create" :
    method === "PATCH" ? "patch" :
    method === "DELETE" ? "delete" : "list";

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_shipments`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "apikey": SUPABASE_PUBLISHABLE_KEY,
      "authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
    },
    body: JSON.stringify({
      p_token: token(),
      p_action: action,
      p_payload: body || {}
    }),
    cache: "no-store"
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.message === "not_authorized"
      ? "El token no coincide con el acceso administrador"
      : (data?.message || data?.error || "Error al conectar con la base de datos");
    throw new Error(message);
  }
  return data;
}

function shipmentGroup(status) {
  if (status === "Entregado") return "delivered";
  if (["Recogido","En centro logístico","En tránsito","En reparto"].includes(status)) return "route";
  return "pending";
}

function statusClass(status) {
  if (status === "Entregado") return "status-delivered";
  if (["Recogido","En centro logístico","En tránsito","En reparto"].includes(status)) return "status-route";
  if (status === "Novedad") return "status-alert";
  return "status-pending";
}

function filteredShipments() {
  const byStatus = activeFilter === "all"
    ? allShipments
    : allShipments.filter(g => shipmentGroup(g.status) === activeFilter);

  const q = searchQuery.trim().toLowerCase();
  if (!q) return byStatus;
  return byStatus.filter(g => [
    g.guide,
    g.customer_name,
    g.customer_phone,
    g.product,
    g.address,
    g.city,
    g.driver,
    g.status
  ].some(value => String(value || "").toLowerCase().includes(q)));
}

function renderList() {
  const list = document.getElementById("guide-list");
  const shipments = filteredShipments();
  if (!shipments.length) {
    list.innerHTML = '<div class="empty">No hay guías para este filtro.</div>';
    return;
  }

  list.innerHTML = shipments.map(g => `
    <article class="guide-row guide-row-pro">
      <div class="guide-main">
        <div class="guide-topline">
          <h3>${g.guide}</h3>
          <span class="shipment-status ${statusClass(g.status)}">${g.status || "Guía creada"}</span>
        </div>
        <p class="guide-date">${formatColombiaDateTime(g.created_at || g.updated_at)}</p>
        <p class="guide-customer"><strong>${g.customer_name || "Cliente"}</strong> · ${g.product || "Pedido FOX GAMER"}</p>
        <p class="guide-location">${g.city || "Ciudad por confirmar"}${g.driver ? " · Mensajero: " + g.driver : ""}</p>
      </div>
      <div class="row-actions">
        <a class="guide-view-btn" href="/admin/documento/${encodeURIComponent(g.guide)}" title="Abrir guía">Ver guía</a>
        <button class="icon-btn" data-action="advance" data-id="${g.id}" data-status="${g.status}" title="Avanzar estado">↻</button>
        <button class="icon-btn" data-action="copy" data-guide="${g.guide}" title="Copiar guía">⧉</button>
        <button class="icon-btn danger-icon" data-action="delete" data-id="${g.id}" title="Eliminar">⌫</button>
      </div>
    </article>`).join("");
}

async function recoverLegacyGuides() {
  if (recoveryAttempted) return false;
  recoveryAttempted = true;
  try {
    notify("Buscando guías antiguas…");
    const response = await fetch("/api/shipments?recover=legacy", {
      method: "POST",
      headers: headers(),
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.reason || "No se pudieron recuperar");
    notify(`Recuperadas ${data.shipments_imported ?? data.found ?? 0} guías`);
    return true;
  } catch (error) {
    notify(error.message);
    return false;
  }
}

async function render() {
  const list = document.getElementById("guide-list");
  try {
    const data = await api();
    allShipments = data.shipments || [];
    if (!allShipments.length && !recoveryAttempted) {
      const recovered = await recoverLegacyGuides();
      if (recovered) {
        const refreshed = await api();
        allShipments = refreshed.shipments || [];
      }
    }
    updateStats(allShipments);
    renderList();
  } catch (error) {
    const message = String(error?.message || "Error");
    const isAuth = /No autorizado|401/i.test(message);
    list.innerHTML = '<div class="empty">' + (isAuth
      ? 'Acceso rechazado (401). Configura nuevamente el acceso del panel.'
      : 'No se pudieron cargar las guías: ' + message.replace(/[<>]/g, '')) + '</div>';
    document.getElementById("stat-total").textContent = "!";
    document.getElementById("stat-route").textContent = "!";
    document.getElementById("stat-delivered").textContent = "!";
    document.getElementById("stat-pending").textContent = "!";
  }
}

function nextStatus(current) {
  const flow = ["Guía creada","Recogido","En centro logístico","En tránsito","En reparto","Entregado"];
  const i = flow.indexOf(current);
  if (i === -1) return "Guía creada";
  return flow[Math.min(i + 1, flow.length - 1)];
}

function showLogin(message = "") {
  const gate = document.getElementById("admin-login-gate");
  const error = document.getElementById("admin-login-error");
  gate.classList.add("show");
  gate.setAttribute("aria-hidden", "false");
  document.body.classList.add("admin-locked");
  error.textContent = message;
  document.getElementById("admin-password").value = "";
}

function hideLogin() {
  const gate = document.getElementById("admin-login-gate");
  gate.classList.remove("show");
  gate.setAttribute("aria-hidden", "true");
  document.body.classList.remove("admin-locked");
  document.getElementById("admin-login-error").textContent = "";
}

async function validateStoredAccess() {
  if (!token()) {
    showLogin();
    return false;
  }
  try {
    await api("GET");
    hideLogin();
    return true;
  } catch (error) {
    localStorage.removeItem(TOKEN_KEY);
    showLogin("La sesión no es válida. Inicia sesión nuevamente.");
    return false;
  }
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  showLogin();
}

document.getElementById("logout-btn").addEventListener("click", logout);
document.getElementById("logout-secondary-btn").addEventListener("click", logout);

document.getElementById("recover-guides-btn").addEventListener("click", async () => {
  const button = document.getElementById("recover-guides-btn");
  const status = document.getElementById("recovery-status");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Recuperando…";
  status.className = "recovery-status working";
  status.textContent = "Buscando la base histórica y preparando la importación…";
  try {
    const response = await fetch("/api/shipments?recover=legacy", {
      method: "POST",
      headers: headers(),
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.reason || "No se pudieron recuperar las guías");
    const amount = data.shipments_imported ?? data.found ?? 0;
    status.className = "recovery-status success";
    status.textContent = `Recuperación completada: ${amount} guías recuperadas.`;
    notify(`Recuperadas ${amount} guías`);
    await render();
  } catch (error) {
    status.className = "recovery-status error";
    status.textContent = "No se pudo completar la recuperación: " + String(error.message || error);
    notify(error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});

document.getElementById("admin-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = document.getElementById("admin-username").value.trim().toLowerCase();
  const password = document.getElementById("admin-password").value;

  if (username !== ADMIN_USERNAME) {
    showLogin("Usuario o contraseña incorrectos.");
    return;
  }

  localStorage.setItem(TOKEN_KEY, password);
  try {
    await api("GET");
    hideLogin();
    await render();
  } catch (error) {
    localStorage.removeItem(TOKEN_KEY);
    showLogin("Usuario o contraseña incorrectos.");
  }
});

document.getElementById("new-guide-btn").addEventListener("click", () => {
  document.getElementById("new-guide-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("customer_name").focus({ preventScroll: true });
});

document.getElementById("guide-search").addEventListener("input", (event) => {
  searchQuery = event.target.value || "";
  renderList();
});

document.querySelectorAll(".filter-chip").forEach(button => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll(".filter-chip").forEach(item => item.classList.toggle("active", item === button));
    renderList();
  });
});

document.getElementById("generate-btn").addEventListener("click", () => {
  const y = colombiaYear();
  const n = Math.floor(100000 + Math.random() * 900000);
  document.getElementById("guide").value = `FG-${y}-${n}`;
});

document.getElementById("guide-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  values.guide = String(values.guide || "").trim().toUpperCase();
  values.responsible = "Administración FOX GAMER";

  try {
    await api("POST", values);
    form.reset();
    notify("Guía guardada");
    await render();
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

updateColombiaClock();
setInterval(updateColombiaClock, 1000);
validateStoredAccess().then((ok) => {
  if (ok) render();
});