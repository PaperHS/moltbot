import {
  ensureAuthProfileStore,
  resolveAuthProfileDisplayLabel,
} from "../../agents/auth-profiles.js";
import { loadConfig } from "../../config/config.js";
import type { RuntimeEnv } from "../../runtime.js";
import { renderTable } from "../../terminal/table.js";

export type ProfileRow = {
  id: string;
  provider: string;
  type: string;
  email?: string;
  expires?: string;
};

function formatExpires(profile: { expires?: number }): string | undefined {
  if (typeof profile.expires !== "number") return undefined;
  const expiresDate = new Date(profile.expires);
  const now = Date.now();
  if (profile.expires < now) {
    return `expired (${expiresDate.toLocaleDateString()})`;
  }
  const daysLeft = Math.ceil((profile.expires - now) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 7) {
    return `${daysLeft}d left`;
  }
  return expiresDate.toLocaleDateString();
}

export async function modelsAuthListCommand(
  opts: {
    provider?: string;
    json?: boolean;
    plain?: boolean;
  },
  runtime: RuntimeEnv,
) {
  const cfg = loadConfig();
  const store = ensureAuthProfileStore();

  const profiles = Object.entries(store.profiles);

  if (profiles.length === 0) {
    runtime.log("No auth profiles found.");
    return;
  }

  const providerFilter = opts.provider?.toLowerCase();

  const rows: ProfileRow[] = [];
  for (const [profileId, profile] of profiles) {
    if (providerFilter && profile.provider.toLowerCase() !== providerFilter) {
      continue;
    }

    const displayLabel = resolveAuthProfileDisplayLabel({ cfg, store, profileId });
    const email =
      "email" in profile && typeof profile.email === "string" ? profile.email : undefined;

    rows.push({
      id: profileId,
      provider: profile.provider,
      type: profile.type,
      email,
      expires: formatExpires(profile as { expires?: number }),
    });
  }

  if (rows.length === 0) {
    runtime.log(
      providerFilter
        ? `No profiles found for provider: ${providerFilter}`
        : "No auth profiles found.",
    );
    return;
  }

  // Sort by provider, then by id
  rows.sort((a, b) => {
    const p = a.provider.localeCompare(b.provider);
    if (p !== 0) return p;
    return a.id.localeCompare(b.id);
  });

  if (opts.json) {
    runtime.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (opts.plain) {
    for (const row of rows) {
      const parts = [row.id, row.provider, row.type];
      if (row.email) parts.push(row.email);
      if (row.expires) parts.push(row.expires);
      runtime.log(parts.join("\t"));
    }
    return;
  }

  // Table output
  const tableRows = rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    type: row.type,
    email: row.email ?? "-",
    expires: row.expires ?? "-",
  }));

  const table = renderTable({
    columns: [
      { key: "id", header: "ID" },
      { key: "provider", header: "Provider" },
      { key: "type", header: "Type" },
      { key: "email", header: "Email" },
      { key: "expires", header: "Expires" },
    ],
    rows: tableRows,
  });

  runtime.log(table);
}
