# 0001. Use Browser JavaScript for SVG Status Rendering

## Status

Accepted

## Context

This PoC renders a draw.io exported SVG and changes component visuals based on external status data.

The core requirements are:

- Keep diagram layout, shapes, line style, line width, and labels managed in draw.io.
- Use stable SVG identifiers such as `data-cell-id` to map status data to diagram components.
- Change visual state in the browser without regenerating the diagram file.
- Support lightweight refresh from a JSON endpoint or a future monitoring API adapter.

## Decision

Use browser JavaScript to load the SVG, load status data, find SVG elements by stable identifiers, and apply state-specific styles.

The viewer updates only runtime state presentation:

- stroke color
- state-specific CSS class
- animation for running/healthy state
- tooltip text

The viewer does not own the diagram design itself. Shape selection, placement, line width, dashed/solid lines, and base visual style remain draw.io responsibilities.

The viewer also should not own resource-specific status interpretation. It should avoid branching deeply on Kubernetes, Datadog, Cloud Monitoring, CloudWatch, node, pod, deployment, or edge semantics.

`status.json` is the viewer contract. It should explicitly describe the current display state for each target SVG element.

Use an `items` array as the general shape for status output. Each item can represent a component, edge, connector, group, or other SVG element.

Example:

```json
{
  "generatedAt": "2026-08-01T04:45:00Z",
  "items": [
    {
      "id": "worker01",
      "kind": "component",
      "state": "ok",
      "message": "Node Ready",
      "appearance": {
        "preset": "running"
      },
      "resource": {
        "source": "kubernetes",
        "kind": "Node",
        "name": "worker-01"
      }
    },
    {
      "id": "api-to-db",
      "kind": "edge",
      "state": "warning",
      "message": "Latency elevated",
      "appearance": {
        "preset": "warning"
      },
      "resource": {
        "source": "datadog",
        "kind": "Monitor",
        "id": "1234567"
      }
    }
  ]
}
```

`kind` is a project-level classification, not an external provider term. It describes the diagram item category, such as `component` or `edge`.

`appearance` carries explicit rendering intent. The viewer may support a small set of presets such as:

- `running`
- `ok`
- `warning`
- `alert`
- `unknown`
- `flow`

Each SVG item should resolve to exactly one rendered state in the viewer.

This is a viewer contract principle:

- One SVG item has one `state`.
- One SVG item has one rendered `appearance`.
- One SVG item may still be backed by multiple checks.
- Multiple checks must be aggregated before reaching the viewer rendering path.

This keeps rendering deterministic while still allowing a single diagram item to represent combined health.

Example:

```json
{
  "id": "api-service",
  "kind": "component",
  "state": "alert",
  "message": "2 checks failed",
  "appearance": {
    "preset": "alert"
  },
  "checks": [
    {
      "id": "api-deployment",
      "state": "ok",
      "message": "Deployment available replicas 3/3",
      "source": "kubernetes"
    },
    {
      "id": "api-error-rate",
      "state": "alert",
      "message": "Error rate 8.2%",
      "source": "otel-service-graph"
    },
    {
      "id": "api-latency",
      "state": "warning",
      "message": "p95 latency 780ms",
      "source": "otel-service-graph"
    }
  ],
  "aggregation": {
    "rule": "worst-state",
    "summary": {
      "ok": 1,
      "warning": 1,
      "alert": 1,
      "unknown": 0
    }
  }
}
```

`worst-state` is a project-level rule name, not an external provider term. It means the collector chooses the most severe state from the item's checks.

The viewer may display `checks` and `aggregation` as explanatory metadata, but it should render only the item-level `state` and `appearance`.

The collector or future backend adapter is responsible for:

- Reading Datadog Monitor, Cloud Monitoring Alert Policy, CloudWatch Alarm, Kubernetes API, or kube-state-metrics data.
- Applying resource-specific interpretation.
- Mapping resources to draw.io `data-cell-id` values.
- Producing `state`, `message`, `resource`, and `appearance`.

The collector should be configuration-driven where practical. Adding another monitored resource of an already-supported kind should require adding configuration, not changing collector code.

Example collector configuration:

```json
{
  "items": [
    {
      "id": "worker01",
      "kind": "component",
      "source": "kubernetes",
      "resource": {
        "kind": "Node",
        "name": "worker-01"
      },
      "rule": {
        "preset": "kubernetes-node-ready"
      },
      "appearance": {
        "ok": "running",
        "warning": "warning",
        "alert": "alert",
        "unknown": "unknown"
      }
    },
    {
      "id": "payment-api",
      "kind": "component",
      "source": "datadog",
      "resource": {
        "kind": "Monitor",
        "id": "1234567"
      },
      "rule": {
        "preset": "external-monitor-status"
      }
    }
  ]
}
```

Expected extension model:

- Adding another resource of an already-supported kind should require only configuration.
- Adding a new monitoring source, such as a new provider API, requires a new adapter.
- Adding a new status interpretation pattern requires a new rule preset.
- The viewer should remain unchanged as long as the status contract is preserved.

The viewer is responsible for:

- Fetching the SVG.
- Fetching the status contract.
- Finding SVG elements by stable identifiers.
- Applying the explicit `appearance` preset.
- Showing `message` and optional metadata.

## Alternatives Considered

### Server-side SVG rewriting

A backend process could read monitoring data and rewrite the SVG file before serving it.

This was not chosen for the PoC because it makes each state update a file or server-rendering concern. It also couples rendering more tightly to the status collection process.

### Grafana Flow panel

Grafana Flow panel can bind data source values to draw.io-style diagrams.

This was not chosen for this PoC because it requires running Grafana and installing a community plugin. The current goal is to validate the minimal rendering model without adding dashboard platform dependencies.

### React Flow or a custom graph editor

A custom graph tool would provide more control over nodes, edges, layout, and interactions.

This was not chosen because draw.io already provides the desired manual diagram editing experience. Rebuilding that editing surface is outside the PoC scope.

## Consequences

Positive:

- Simple static frontend architecture.
- Direct use of SVG as browser DOM.
- No build step or frontend framework required.
- Easy to replace `status.json` with a future API endpoint.
- draw.io remains the source of truth for diagram design.

Negative:

- Exported SVG must preserve stable identifiers such as `data-cell-id`.
- Browser-side rendering rules need to be tested against draw.io export variations.
- Complex status aggregation should eventually move behind a dedicated API instead of living in frontend code.

## Current Implementation

`app.js` currently:

1. Fetches `sample/homelab.svg`.
2. Fetches `sample/status.json`.
3. Looks up elements by `id`, `cell-{id}`, or `data-cell-id`.
4. Applies state color and healthy-state animation.
5. Refreshes periodically when auto refresh is enabled.
