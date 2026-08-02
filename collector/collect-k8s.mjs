import { execFile } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const args = new Set(process.argv.slice(2));
const watch = args.has("--watch");
const intervalMs = Number(process.env.COLLECT_INTERVAL_MS || 60_000);
const configPath = resolve(projectRoot, process.env.K8S_COLLECTOR_CONFIG || "collector/k8s-config.json");

async function readConfig() {
  return JSON.parse(await readFile(configPath, "utf8"));
}

async function getNodes(config) {
  const kubectl = config.kubectl || {};
  const command = kubectl.command || "kubectl";
  const commandArgs = [];

  if (kubectl.context) {
    commandArgs.push("--context", kubectl.context);
  }

  commandArgs.push("get", "nodes", "-o", "json");

  const { stdout } = await execFileAsync(command, commandArgs, {
    maxBuffer: 10 * 1024 * 1024
  });

  return JSON.parse(stdout);
}

function getCondition(node, conditionType) {
  return node.status?.conditions?.find((condition) => condition.type === conditionType);
}

function summarizeNode(item, node) {
  if (!node) {
    return {
      state: "unknown",
      message: `Node ${item.resource.name} was not found`,
      details: {
        found: false
      }
    };
  }

  const ready = getCondition(node, "Ready");
  const readyStatus = ready?.status || "Unknown";
  const unschedulable = Boolean(node.spec?.unschedulable);

  if (readyStatus === "True" && unschedulable) {
    return {
      state: "warning",
      message: "Node Ready but scheduling disabled",
      details: {
        found: true,
        ready: true,
        readyStatus,
        unschedulable,
        kubeletVersion: node.status?.nodeInfo?.kubeletVersion
      }
    };
  }

  if (readyStatus === "True") {
    return {
      state: "ok",
      message: "Node Ready",
      details: {
        found: true,
        ready: true,
        readyStatus,
        unschedulable,
        kubeletVersion: node.status?.nodeInfo?.kubeletVersion
      }
    };
  }

  if (readyStatus === "False") {
    return {
      state: "alert",
      message: ready?.message || "Node NotReady",
      details: {
        found: true,
        ready: false,
        readyStatus,
        unschedulable,
        reason: ready?.reason,
        kubeletVersion: node.status?.nodeInfo?.kubeletVersion
      }
    };
  }

  return {
    state: "unknown",
    message: ready?.message || "Node Ready status unknown",
    details: {
      found: true,
      ready: null,
      readyStatus,
      unschedulable,
      reason: ready?.reason,
      kubeletVersion: node.status?.nodeInfo?.kubeletVersion
    }
  };
}

function appearancePreset(item, state) {
  return item.appearance?.[state] || state;
}

function buildStatus(config, nodesResponse) {
  const observedAt = new Date().toISOString();
  const nodesByName = new Map((nodesResponse.items || []).map((node) => [node.metadata.name, node]));
  const items = (config.items || []).map((item) => {
    if (item.source !== "kubernetes" || item.resource?.kind !== "Node") {
      return {
        ...item,
        state: "unknown",
        message: "Unsupported collector item",
        observedAt,
        appearance: {
          preset: "unknown"
        }
      };
    }

    const result = summarizeNode(item, nodesByName.get(item.resource.name));

    return {
      id: item.id,
      kind: item.kind || "component",
      state: result.state,
      message: result.message,
      source: "kubernetes",
      observedAt,
      appearance: {
        preset: appearancePreset(item, result.state)
      },
      resource: item.resource,
      details: result.details
    };
  });

  return {
    generatedAt: observedAt,
    items
  };
}

function buildCollectorErrorStatus(config, error) {
  const observedAt = new Date().toISOString();
  const message = error.stderr?.trim().split("\n").at(-1) || error.message || "kubectl get nodes failed";
  const items = (config.items || []).map((item) => ({
    id: item.id,
    kind: item.kind || "component",
    state: "unknown",
    reason: "collector-error",
    message,
    source: "kubernetes",
    observedAt,
    appearance: {
      preset: item.appearance?.unknown || "unknown"
    },
    resource: item.resource,
    details: {
      collectorError: true,
      command: error.cmd || "kubectl get nodes -o json",
      stderr: error.stderr || "",
      exitCode: error.code ?? null
    }
  }));

  return {
    generatedAt: observedAt,
    collector: {
      source: "kubernetes",
      state: "unknown",
      message
    },
    items
  };
}

async function writeStatus(config, status) {
  const outputPath = resolve(projectRoot, config.output || "sample/status.json");
  const tempPath = `${outputPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(status, null, 2)}\n`);
  await rename(tempPath, outputPath);
}

async function collectOnce() {
  const config = await readConfig();
  let status;

  try {
    const nodes = await getNodes(config);
    status = buildStatus(config, nodes);
  } catch (error) {
    status = buildCollectorErrorStatus(config, error);
    console.error(status.collector.message);
  }

  await writeStatus(config, status);
  console.log(`Wrote ${config.output || "sample/status.json"} at ${status.generatedAt}`);
}

await collectOnce();

if (watch) {
  setInterval(() => {
    collectOnce().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  }, intervalMs);
}
