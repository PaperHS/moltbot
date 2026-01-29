import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { RuntimeEnv } from "../runtime.js";
import { renderTable } from "../terminal/table.js";

export type ProfileInfo = {
  name: string;
  path: string;
  hasConfig: boolean;
  configSize?: number;
};

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
        const configPath = path.join(profilePath, "moltbot.json");
        const hasConfig = fs.existsSync(configPath);
        let configSize: number | undefined;
        if (hasConfig) {
          try {
            const stat = fs.statSync(configPath);
            configSize = stat.size;
          } catch {
            // ignore
          }
        }
        profiles.push({
          name: "default",
          path: profilePath,
          hasConfig,
          configSize,
        });
      } else if (entry.name.startsWith(".clawdbot-")) {
        const profileName = entry.name.slice(".clawdbot-".length);
        if (!profileName) continue;

        const profilePath = path.join(homedir, entry.name);
        const configPath = path.join(profilePath, "moltbot.json");
        const hasConfig = fs.existsSync(configPath);
        let configSize: number | undefined;
        if (hasConfig) {
          try {
            const stat = fs.statSync(configPath);
            configSize = stat.size;
          } catch {
            // ignore
          }
        }
        profiles.push({
          name: profileName,
          path: profilePath,
          hasConfig,
          configSize,
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

  if (opts.json) {
    runtime.log(JSON.stringify(profiles, null, 2));
    return;
  }

  if (opts.plain) {
    for (const profile of profiles) {
      runtime.log(`${profile.name}\t${profile.path}\t${profile.hasConfig ? "yes" : "no"}`);
    }
    return;
  }

  // Table output
  const tableRows = profiles.map((p) => ({
    name: p.name,
    path: p.path,
    hasConfig: p.hasConfig ? "✓" : "-",
    configSize: p.configSize ? `${Math.round(p.configSize / 1024)}KB` : "-",
  }));

  const table = renderTable({
    columns: [
      { key: "name", header: "Profile" },
      { key: "path", header: "Path" },
      { key: "hasConfig", header: "Config" },
      { key: "configSize", header: "Size" },
    ],
    rows: tableRows,
  });

  runtime.log(table);
}
