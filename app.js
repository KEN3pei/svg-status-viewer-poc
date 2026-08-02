const svgPath = "./sample/homelab.svg";
const statusPath = "./sample/status.json";
const refreshIntervalMs = 10_000;

const stateStyles = {
  ok: { color: "#1f9d55", label: "OK" },
  warning: { color: "#d9822b", label: "Warning" },
  alert: { color: "#d64545", label: "Alert" },
  unknown: { color: "#6b7280", label: "Unknown" }
};

const diagramEl = document.querySelector("#diagram");
const statusListEl = document.querySelector("#status-list");
const lastUpdatedEl = document.querySelector("#last-updated");
const refreshButton = document.querySelector("#refresh-button");
const autoRefresh = document.querySelector("#auto-refresh");

let refreshTimer = null;

async function fetchText(path) {
  const response = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return response.text();
}

async function fetchJson(path) {
  const response = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return response.json();
}

function normalizeState(state) {
  return stateStyles[state] ? state : "unknown";
}

function findSvgCell(svg, componentId) {
  return (
    svg.querySelector(`#${CSS.escape(componentId)}`) ||
    svg.querySelector(`#${CSS.escape(`cell-${componentId}`)}`) ||
    svg.querySelector(`[data-cell-id="${CSS.escape(componentId)}"]`)
  );
}

function ensureSvgAnimationStyles(svg) {
  if (svg.querySelector("#status-viewer-animation-styles")) {
    return;
  }

  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.id = "status-viewer-animation-styles";
  style.textContent = `
    @keyframes statusViewerOkStroke {
      0% { stroke: #1f9d55; filter: drop-shadow(0 0 1px rgba(31, 157, 85, 0.55)); }
      35% { stroke: #22c55e; filter: drop-shadow(0 0 4px rgba(34, 197, 94, 0.7)); }
      70% { stroke: #14b8a6; filter: drop-shadow(0 0 4px rgba(20, 184, 166, 0.55)); }
      100% { stroke: #1f9d55; filter: drop-shadow(0 0 1px rgba(31, 157, 85, 0.55)); }
    }

    .status-viewer-ok {
      animation: statusViewerOkStroke 2.4s linear infinite;
    }
  `;
  svg.prepend(style);
}

function paintCell(cell, state, message, appearance = {}) {
  const style = stateStyles[stateStyles[state] ? state : "unknown"];
  const preset = appearance.preset || state;
  const shapeSelector = "rect,path,ellipse,circle,polygon,polyline,line";
  const shapes = cell.matches(shapeSelector) ? [cell] : [...cell.querySelectorAll(shapeSelector)];
  const targets = shapes.length > 0 ? shapes : [cell];

  for (const target of targets) {
    target.classList.toggle("status-viewer-ok", preset === "running");
    target.style.stroke = style.color;
  }

  cell.dataset.state = state;
  cell.setAttribute("data-status-message", message || style.label);
  cell.querySelector("title")?.remove();

  const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
  title.textContent = `${style.label}${message ? `: ${message}` : ""}`;
  cell.prepend(title);
}

function updateStatusList(items) {
  statusListEl.replaceChildren(
    ...items.map((item) => {
      const state = normalizeState(item.state);
      const style = stateStyles[state];
      const li = document.createElement("li");
      li.className = "status-item";
      const summary = document.createElement("button");
      summary.className = "status-summary";
      summary.type = "button";
      summary.setAttribute("aria-expanded", "false");
      summary.innerHTML = `
        <span class="status-dot" style="background: ${style.color}"></span>
        <span class="status-name" title="${item.message || item.id}">${item.id}</span>
        <span class="status-value">${style.label}</span>
      `;

      const body = document.createElement("pre");
      body.className = "status-json";
      body.hidden = true;
      body.textContent = JSON.stringify(item, null, 2);

      summary.addEventListener("click", () => {
        body.hidden = !body.hidden;
        summary.setAttribute("aria-expanded", String(!body.hidden));
      });

      li.append(summary, body);
      return li;
    })
  );
}

function applyStatus(svg, status) {
  const items = status.items || status.components || [];
  const missing = [];

  for (const item of items) {
    const cell = findSvgCell(svg, item.id);
    if (!cell) {
      missing.push(item.id);
      continue;
    }

    ensureSvgAnimationStyles(svg);
    paintCell(cell, normalizeState(item.state), item.message, item.appearance);
  }

  updateStatusList(items);
  lastUpdatedEl.textContent = `Updated: ${new Date().toLocaleString()}`;

  if (missing.length > 0) {
    console.warn("Missing SVG cells:", missing);
  }
}

async function refresh() {
  try {
    const [svgText, status] = await Promise.all([fetchText(svgPath), fetchJson(statusPath)]);
    diagramEl.innerHTML = svgText;
    const svg = diagramEl.querySelector("svg");

    if (!svg) {
      throw new Error("SVG root element was not found");
    }

    applyStatus(svg, status);
  } catch (error) {
    lastUpdatedEl.textContent = `Load failed: ${error.message}`;
    console.error(error);
  }
}

function updateAutoRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = null;

  if (autoRefresh.checked) {
    refreshTimer = setInterval(refresh, refreshIntervalMs);
  }
}

refreshButton.addEventListener("click", refresh);
autoRefresh.addEventListener("change", updateAutoRefresh);

await refresh();
updateAutoRefresh();
