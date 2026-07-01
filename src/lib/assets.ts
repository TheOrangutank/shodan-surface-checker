import "server-only";
import type {
  AssetPatchPayload,
  AssetPayload,
  AssetSummary,
  AssetSnapshot,
  AssetType,
  MonitoredAsset,
} from "@/types/assets";
import { query, queryOne } from "@/lib/db";
import { getPublicShodanErrorMessage } from "@/lib/api-errors";
import { ShodanError, shodanGetDomain, shodanGetHost, summarizePorts } from "@/lib/shodan";

const MAX_LABEL_LENGTH = 80;
const MAX_CACHED_SUBDOMAINS = 500;
const MAX_CACHED_PORTS = 200;

export class AssetServiceError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
    this.name = "AssetServiceError";
  }
}

export function sanitizeAssetType(value: unknown): AssetType | null {
  return value === "domain" || value === "ip" ? value : null;
}

export function sanitizeAssetLabel(value: unknown) {
  if (typeof value !== "string") return null;

  const label = value.trim();
  if (!label) return null;

  return label.slice(0, MAX_LABEL_LENGTH);
}

export async function listAssets() {
  try {
    const rows = await query<MonitoredAssetRow>(
      "select * from monitored_assets order by created_at desc",
    );
    return rows.map(toMonitoredAsset);
  } catch {
    throw new AssetServiceError("Unable to load monitored assets.");
  }
}

export async function createAsset(payload: AssetPayload) {
  try {
    const row = await queryOne<MonitoredAssetRow>(
      `
        insert into monitored_assets (
          type, value, label, last_queried_at, last_result, last_summary, last_error
        )
        values ($1, $2, $3, null, null, null, null)
        returning *
      `,
      [payload.type, payload.value, sanitizeAssetLabel(payload.label)],
    );

    if (!row) {
      throw new Error("insert returned no rows");
    }

    return toMonitoredAsset(row);
  } catch (err) {
    throw mapDbError(err);
  }
}

export async function updateAsset(id: string, payload: AssetPatchPayload) {
  const current = await getAsset(id);
  const nextType = payload.type ?? current.type;
  const nextValue = payload.value ?? current.value;
  const nextLabel = "label" in payload ? sanitizeAssetLabel(payload.label) : current.label;
  const targetChanged = nextType !== current.type || nextValue !== current.value;

  try {
    const row = await queryOne<MonitoredAssetRow>(
      `
        update monitored_assets
        set
          type = $2,
          value = $3,
          label = $4,
          last_queried_at = $5,
          last_result = $6::jsonb,
          last_summary = $7::jsonb,
          last_error = $8
        where id = $1
        returning *
      `,
      [
        id,
        nextType,
        nextValue,
        nextLabel,
        targetChanged ? null : current.last_queried_at,
        targetChanged ? null : toJsonParam(current.last_result),
        targetChanged ? null : toJsonParam(current.last_summary),
        targetChanged ? null : current.last_error,
      ],
    );

    if (!row) {
      throw new AssetServiceError("Monitored asset was not found.", 404);
    }

    return toMonitoredAsset(row);
  } catch (err) {
    if (err instanceof AssetServiceError) throw err;
    throw mapDbError(err);
  }
}

export async function deleteAsset(id: string) {
  try {
    await query("delete from monitored_assets where id = $1", [id]);
  } catch {
    throw new AssetServiceError("Unable to remove monitored asset.");
  }
}

export async function refreshAsset(id: string) {
  const asset = await getAsset(id);

  try {
    if (asset.type === "domain") {
      const result = await shodanGetDomain(asset.value);
      const cachedResult = {
        ...result,
        subdomains: result.subdomains.slice(0, MAX_CACHED_SUBDOMAINS),
        data: result.data.slice(0, MAX_CACHED_SUBDOMAINS),
      };
      return updateRefreshState(asset.id, {
        last_queried_at: new Date().toISOString(),
        last_result: cachedResult,
        last_summary: {
          type: "domain",
          subdomainCount: result.subdomains.length,
        },
        last_error: null,
      });
    }

    const host = await shodanGetHost(asset.value);
    const summary = summarizePorts(host.ports ?? []);
    const cachedHost = {
      ...host,
      ports: (host.ports ?? []).slice(0, MAX_CACHED_PORTS),
      data: (host.data ?? []).slice(0, MAX_CACHED_PORTS).map((banner) => ({
        port: banner.port,
        transport: banner.transport,
        product: banner.product,
        version: banner.version,
        module: banner.module,
        _shodan: banner._shodan ? { module: banner._shodan.module } : undefined,
      })),
    };
    return updateRefreshState(asset.id, {
      last_queried_at: new Date().toISOString(),
      last_result: { host: cachedHost, summary },
      last_summary: {
        type: "ip",
        ...summary,
      },
      last_error: null,
    });
  } catch (err) {
    if (err instanceof ShodanError) {
      return updateRefreshState(asset.id, {
        last_error: getPublicShodanErrorMessage(err),
      });
    }

    return updateRefreshState(asset.id, {
      last_error: "Unable to complete the refresh right now.",
    });
  }
}

async function getAsset(id: string) {
  const row = await queryOne<MonitoredAssetRow>(
    "select * from monitored_assets where id = $1",
    [id],
  );

  if (!row) {
    throw new AssetServiceError("Monitored asset was not found.", 404);
  }

  return toMonitoredAsset(row);
}

async function updateRefreshState(id: string, update: Partial<MonitoredAsset>) {
  const current = await getAsset(id);

  try {
    const row = await queryOne<MonitoredAssetRow>(
      `
        update monitored_assets
        set
          last_queried_at = $2,
          last_result = $3::jsonb,
          last_summary = $4::jsonb,
          last_error = $5
        where id = $1
        returning *
      `,
      [
        id,
        "last_queried_at" in update ? update.last_queried_at : current.last_queried_at,
        "last_result" in update ? toJsonParam(update.last_result) : toJsonParam(current.last_result),
        "last_summary" in update
          ? toJsonParam(update.last_summary)
          : toJsonParam(current.last_summary),
        "last_error" in update ? update.last_error : current.last_error,
      ],
    );

    if (!row) {
      throw new Error("update returned no rows");
    }

    return toMonitoredAsset(row);
  } catch {
    throw new AssetServiceError("Unable to update monitored asset.");
  }
}

interface MonitoredAssetRow extends Omit<MonitoredAsset, "last_queried_at" | "created_at" | "updated_at"> {
  last_queried_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function toMonitoredAsset(row: MonitoredAssetRow): MonitoredAsset {
  return {
    ...row,
    last_queried_at: toIsoString(row.last_queried_at),
    created_at: toIsoString(row.created_at) ?? new Date().toISOString(),
    updated_at: toIsoString(row.updated_at) ?? new Date().toISOString(),
  };
}

function toIsoString(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function toJsonParam(value: AssetSnapshot | AssetSummary | null | undefined) {
  return value === null || typeof value === "undefined" ? null : JSON.stringify(value);
}

function mapDbError(err: unknown) {
  if (isPostgresError(err, "23505")) {
    return new AssetServiceError("That target is already being monitored.", 409);
  }

  return new AssetServiceError("Unable to save monitored asset.");
}

function isPostgresError(err: unknown, code: string) {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === code
  );
}
