import "server-only";
import type {
  AssetPatchPayload,
  AssetPayload,
  AssetSummary,
  AssetType,
  MonitoredAsset,
} from "@/types/assets";
import { getDb } from "@/lib/db";
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
  const { data, error } = await getDb()
    .from("monitored_assets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new AssetServiceError("Unable to load monitored assets.");
  }

  return data;
}

export async function createAsset(payload: AssetPayload) {
  const { data, error } = await getDb()
    .from("monitored_assets")
    .insert({
      type: payload.type,
      value: payload.value,
      label: sanitizeAssetLabel(payload.label),
      last_queried_at: null,
      last_result: null,
      last_summary: null,
      last_error: null,
    })
    .select("*")
    .single();

  if (error) {
    throw mapDbError(error.message);
  }

  return data;
}

export async function updateAsset(id: string, payload: AssetPatchPayload) {
  const current = await getAsset(id);
  const nextType = payload.type ?? current.type;
  const nextValue = payload.value ?? current.value;
  const targetChanged = nextType !== current.type || nextValue !== current.value;

  const update: Partial<MonitoredAsset> = {
    type: nextType,
    value: nextValue,
  };

  if ("label" in payload) {
    update.label = sanitizeAssetLabel(payload.label);
  }

  if (targetChanged) {
    update.last_queried_at = null;
    update.last_result = null;
    update.last_summary = null;
    update.last_error = null;
  }

  const { data, error } = await getDb()
    .from("monitored_assets")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw mapDbError(error.message);
  }

  return data;
}

export async function deleteAsset(id: string) {
  const { error } = await getDb().from("monitored_assets").delete().eq("id", id);

  if (error) {
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
  const { data, error } = await getDb()
    .from("monitored_assets")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    throw new AssetServiceError("Monitored asset was not found.", 404);
  }

  return data;
}

async function updateRefreshState(id: string, update: Partial<MonitoredAsset>) {
  const { data, error } = await getDb()
    .from("monitored_assets")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new AssetServiceError("Unable to update monitored asset.");
  }

  return data;
}

function mapDbError(message: string) {
  if (message.includes("duplicate key")) {
    return new AssetServiceError("That target is already being monitored.", 409);
  }

  return new AssetServiceError("Unable to save monitored asset.");
}
