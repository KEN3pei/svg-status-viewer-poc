import type { ApplyStatusResult, StateStyle, StatusItem, StatusState } from "./types.js";

export const stateStyles: Record<StatusState, StateStyle> = {
  ok: { color: "#1f9d55", label: "OK" },
  warning: { color: "#d9822b", label: "Warning" },
  alert: { color: "#d64545", label: "Alert" },
  unknown: { color: "#6b7280", label: "Unknown" }
};

const shapeSelector = "rect,path,ellipse,circle,polygon,polyline,line";

export function normalizeState(state: string): StatusState {
  return state in stateStyles ? (state as StatusState) : "unknown";
}

export function findSvgCell(svg: SVGElement, itemId: string): Element | null {
  return (
    svg.querySelector(`#${CSS.escape(itemId)}`) ||
    svg.querySelector(`#${CSS.escape(`cell-${itemId}`)}`) ||
    svg.querySelector(`[data-cell-id="${CSS.escape(itemId)}"]`)
  );
}

function ensureSvgAnimationStyles(svg: SVGElement): void {
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

function getShapeTargets(cell: Element): Element[] {
  const shapes = cell.matches(shapeSelector) ? [cell] : [...cell.querySelectorAll(shapeSelector)];
  return shapes.length > 0 ? shapes : [cell];
}

function applyAppearance(cell: Element, item: StatusItem): void {
  const state = normalizeState(item.state);
  const style = stateStyles[state];
  const preset = item.appearance?.preset || state;

  for (const target of getShapeTargets(cell)) {
    if (target instanceof SVGElement) {
      target.classList.toggle("status-viewer-ok", preset === "running");
      target.style.stroke = style.color;
    }
  }

  if (cell instanceof SVGElement) {
    cell.dataset.state = state;
  }

  cell.setAttribute("data-status-message", item.message || style.label);
  cell.querySelector("title")?.remove();

  const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
  title.textContent = `${style.label}${item.message ? `: ${item.message}` : ""}`;
  cell.prepend(title);
}

export function applyStatusToSvg(svg: SVGElement, items: StatusItem[]): ApplyStatusResult {
  const applied: string[] = [];
  const missing: string[] = [];

  ensureSvgAnimationStyles(svg);

  for (const item of items) {
    const cell = findSvgCell(svg, item.id);
    if (!cell) {
      missing.push(item.id);
      continue;
    }

    applyAppearance(cell, item);
    applied.push(item.id);
  }

  return { applied, missing };
}
