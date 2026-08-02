import { applyStatusToSvg, normalizeState, stateStyles } from "./viewer-engine.js";
import type { StatusDocument, StatusItem } from "./types.js";

const svgPath = "./sample/homelab.svg";
const statusPath = "./sample/status.json";
const refreshIntervalMs = 10_000;

const diagramEl = requireElement<HTMLDivElement>("#diagram");
const statusListEl = requireElement<HTMLUListElement>("#status-list");
const lastUpdatedEl = requireElement<HTMLDivElement>("#last-updated");
const refreshButton = requireElement<HTMLButtonElement>("#refresh-button");
const autoRefresh = requireElement<HTMLInputElement>("#auto-refresh");

let refreshTimer: ReturnType<typeof setInterval> | null = null;

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Required element was not found: ${selector}`);
  }
  return element;
}

async function fetchText(path: string): Promise<string> {
  const response = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return response.text();
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function statusItems(status: StatusDocument): StatusItem[] {
  return status.items || status.components || [];
}

function updateStatusList(items: StatusItem[]): void {
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

async function refresh(): Promise<void> {
  try {
    const [svgText, status] = await Promise.all([fetchText(svgPath), fetchJson<StatusDocument>(statusPath)]);
    diagramEl.innerHTML = svgText;
    const svg = diagramEl.querySelector("svg");

    if (!(svg instanceof SVGElement)) {
      throw new Error("SVG root element was not found");
    }

    const items = statusItems(status);
    const result = applyStatusToSvg(svg, items);
    updateStatusList(items);
    lastUpdatedEl.textContent = `Updated: ${new Date().toLocaleString()}`;

    if (result.missing.length > 0) {
      console.warn("Missing SVG cells:", result.missing);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    lastUpdatedEl.textContent = `Load failed: ${message}`;
    console.error(error);
  }
}

function updateAutoRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }

  if (autoRefresh.checked) {
    refreshTimer = setInterval(() => {
      void refresh();
    }, refreshIntervalMs);
  }
}

refreshButton.addEventListener("click", () => {
  void refresh();
});
autoRefresh.addEventListener("change", updateAutoRefresh);

await refresh();
updateAutoRefresh();
