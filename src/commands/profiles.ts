import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import type { RuntimeEnv } from "../runtime.js";
import { renderTable } from "../terminal/table.js";

const DEFAULT_GATEWAY_PORT = 18789;

export type ProfileInfo = {
  name: string;
  path: string;
  hasConfig: boolean;
  port?: number;
  status?: "running" | "stopped" | "unknown";
};

/**
 * Load config JSON from a profile path.
 */
function loadProfileConfig(profilePath: string): Record<string, unknown> | undefined {
  const configPath = path.join(profilePath, "moltbot.json");
  try {
    if (!fs.existsSync(configPath)) return undefined;
    const raw = fs.readFileSync(configPath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * Extract gateway port from config.
 */
function getGatewayPort(config: Record<string, unknown> | undefined): number | undefined {
  if (!config) return undefined;
  const gateway = config.gateway as Record<string, unknown> | undefined;
  if (!gateway) return undefined;
  const port = gateway.port;
  if (typeof port === "number" && port > 0) return port;
  return undefined;
}

/**
 * Check if a port is listening (quick TCP connect check).
 */
async function isPortListening(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 500; // 500ms timeout

    socket.setTimeout(timeout);

    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

/**
 * List all CLI profiles by scanning ~/.clawdbot* directories.
 */
export function listProfiles(): ProfileInfo[] {
  const homedir = os.homedir();
  const profiles: ProfileInfo[] = [];

  try {
    const entries = fs.readdirSync(homedir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Match .clawdbot or .clawdbot-<name>
      if (entry.name === ".clawdbot") {
        const profilePath = path.join(homedir, entry.name);
        const config = loadProfileConfig(profilePath);
        const port = getGatewayPort(config) ?? DEFAULT_GATEWAY_PORT;

        profiles.push({
          name: "default",
          path: profilePath,
          hasConfig: config !== undefined,
          port,
        });
      } else if (entry.name.startsWith(".clawdbot-")) {
        const profileName = entry.name.slice(".clawdbot-".length);
        if (!profileName) continue;

        const profilePath = path.join(homedir, entry.name);
        const config = loadProfileConfig(profilePath);
        const port = getGatewayPort(config);

        profiles.push({
          name: profileName,
          path: profilePath,
          hasConfig: config !== undefined,
          port,
        });
      }
    }
  } catch {
    // ignore errors reading home directory
  }

  // Sort: default first, then alphabetically
  profiles.sort((a, b) => {
    if (a.name === "default") return -1;
    if (b.name === "default") return 1;
    return a.name.localeCompare(b.name);
  });

  return profiles;
}

export async function profilesListCommand(
  opts: {
    json?: boolean;
    plain?: boolean;
  },
  runtime: RuntimeEnv,
) {
  const profiles = listProfiles();

  if (profiles.length === 0) {
    runtime.log("No profiles found.");
    return;
  }

  // Check running status for each profile
  await Promise.all(
    profiles.map(async (p) => {
      if (p.port) {
        const listening = await isPortListening(p.port);
        p.status = listening ? "running" : "stopped";
      } else {
        p.status = "unknown";
      }
    }),
  );

  if (opts.json) {
    runtime.log(JSON.stringify(profiles, null, 2));
    return;
  }

  if (opts.plain) {
    for (const profile of profiles) {
      const port = profile.port ?? "-";
      const status = profile.status ?? "unknown";
      runtime.log(`${profile.name}\t${port}\t${status}\t${profile.path}`);
    }
    return;
  }

  // Table output
  const tableRows = profiles.map((p) => ({
    name: p.name,
    port: p.port?.toString() ?? "-",
    status: p.status === "running" ? "🟢 running" : p.status === "stopped" ? "⚫ stopped" : "-",
    path: p.path,
  }));

  const table = renderTable({
    columns: [
      { key: "name", header: "Profile" },
      { key: "port", header: "Port" },
      { key: "status", header: "Status" },
      { key: "path", header: "Path" },
    ],
    rows: tableRows,
  });

  runtime.log(table);
}
