"use client";

import { Fragment, FormEvent, useEffect, useState } from "react";
import type {
  AssetSnapshot,
  AssetSummary,
  AssetType,
  HostScanSnapshot,
  MonitoredAsset,
} from "@/types/assets";
import type { ShodanDomainInfo } from "@/types/shodan";
import { getApiErrorMessage, readJson } from "@/lib/api-client";
import { formatLastQueried } from "@/lib/format-date";
import { getPortRisk, RISK_COLORS } from "@/lib/port-risk";

type AssetResponse = { asset: MonitoredAsset; error?: string };
type AssetListResponse = { assets: MonitoredAsset[]; error?: string };

export function AssetDashboard({ csrfToken }: { csrfToken: string | null }) {
  const [assets, setAssets] = useState<MonitoredAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<AssetType>("domain");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editType, setEditType] = useState<AssetType>("domain");
  const [editValue, setEditValue] = useState("");
  const [editLabel, setEditLabel] = useState("");

  useEffect(() => {
    loadAssets();
  }, []);

  async function loadAssets() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/assets");
      const data = await readJson<AssetListResponse>(res);
      if (!res.ok) {
        throw new Error(getApiErrorMessage(res, data, "Unable to load dashboard"));
      }
      setAssets(data.assets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);

    try {
      const asset = await sendAssetRequest("/api/assets", "POST", {
        type,
        value: value.trim(),
        label: label.trim() || null,
      }, csrfToken);
      setAssets((current) => [asset, ...current]);
      setValue("");
      setLabel("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add monitored asset");
    } finally {
      setAdding(false);
    }
  }

  async function handleRefresh(id: string) {
    setRefreshingIds((current) => new Set(current).add(id));
    setError(null);

    try {
      const asset = await sendAssetRequest(`/api/assets/${id}/refresh`, "POST", undefined, csrfToken);
      replaceAsset(asset);
      setExpandedIds((current) => new Set(current).add(asset.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh monitored asset");
    } finally {
      setRefreshingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remove this monitored asset?")) return;

    setError(null);
    try {
      const res = await fetch(`/api/assets/${id}`, {
        method: "DELETE",
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
      });
      const data = await readJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) {
        throw new Error(getApiErrorMessage(res, data, "Unable to remove monitored asset"));
      }
      setAssets((current) => current.filter((asset) => asset.id !== id));
      setExpandedIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove monitored asset");
    }
  }

  async function handleEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;

    setError(null);
    try {
      const asset = await sendAssetRequest(`/api/assets/${editingId}`, "PATCH", {
        type: editType,
        value: editValue.trim(),
        label: editLabel.trim() || null,
      }, csrfToken);
      replaceAsset(asset);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update monitored asset");
    }
  }

  function beginEdit(asset: MonitoredAsset) {
    setEditingId(asset.id);
    setEditType(asset.type);
    setEditValue(asset.value);
    setEditLabel(asset.label ?? "");
  }

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function replaceAsset(asset: MonitoredAsset) {
    setAssets((current) => current.map((item) => (item.id === asset.id ? asset : item)));
  }

  return (
    <section className="grid gap-4">
      <form onSubmit={handleAdd} className="terminal-panel px-4 py-3">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--amber-dim)]">
          [ ADD ASSET ]
        </h2>
        <div className="grid gap-3 sm:grid-cols-[auto_1fr_1fr_auto]">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AssetType)}
            className="border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--amber)] outline-none"
          >
            <option value="domain">DOMAIN</option>
            <option value="ip">IP</option>
          </select>
          <PromptInput
            value={value}
            onChange={setValue}
            placeholder={type === "domain" ? "example.com" : "203.0.113.10"}
          />
          <PromptInput value={label} onChange={setLabel} placeholder="optional label" />
          <TerminalButton disabled={adding || !value.trim()}>
            {adding ? "[ ADDING... ]" : "[ ADD ]"}
          </TerminalButton>
        </div>
        {error && <p className="mt-3 text-sm text-[var(--risk-high)]">[ ERROR ] {error}</p>}
      </form>

      <div className="terminal-panel px-4 py-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--amber-dim)]">
            [ MONITORED ASSETS ]
          </h2>
          <button
            type="button"
            onClick={loadAssets}
            className="border border-[var(--border)] px-3 py-1 text-xs text-[var(--amber-dim)] hover:text-[var(--amber)]"
          >
            [ RELOAD CACHE ]
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--amber-muted)]">Loading monitored assets…</p>
        ) : assets.length === 0 ? (
          <p className="text-sm text-[var(--amber-muted)]">
            No monitored assets yet. Add a domain or IP, then refresh it when you want to
            spend a Shodan lookup.
          </p>
        ) : (
          <table className="terminal-table">
            <thead>
              <tr>
                <th>Target</th>
                <th>Type</th>
                <th>Summary</th>
                <th>Last queried</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <Fragment key={asset.id}>
                  <tr>
                    <td>
                      <span className="terminal-glow font-bold">
                        {asset.label || asset.value}
                      </span>
                      {asset.label && (
                        <span className="block text-xs text-[var(--amber-muted)]">
                          {asset.value}
                        </span>
                      )}
                      {asset.last_error && (
                        <span className="block text-xs text-[var(--risk-high)]">
                          [ ERROR ] {asset.last_error}
                        </span>
                      )}
                    </td>
                    <td className="uppercase">{asset.type}</td>
                    <td>{summarizeAsset(asset.last_summary)}</td>
                    <td>{formatLastQueried(asset.last_queried_at)}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <RowButton onClick={() => toggleExpanded(asset.id)}>
                          {expandedIds.has(asset.id) ? "HIDE" : "DETAILS"}
                        </RowButton>
                        <RowButton
                          onClick={() => handleRefresh(asset.id)}
                          disabled={refreshingIds.has(asset.id)}
                        >
                          {refreshingIds.has(asset.id) ? "REFRESHING..." : "REFRESH"}
                        </RowButton>
                        <RowButton onClick={() => beginEdit(asset)}>EDIT</RowButton>
                        <RowButton onClick={() => handleDelete(asset.id)}>REMOVE</RowButton>
                      </div>
                    </td>
                  </tr>
                  {editingId === asset.id && (
                    <tr>
                      <td colSpan={5}>
                        <form onSubmit={handleEdit} className="grid gap-2 sm:grid-cols-[auto_1fr_1fr_auto_auto]">
                          <select
                            value={editType}
                            onChange={(e) => setEditType(e.target.value as AssetType)}
                            className="border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--amber)] outline-none"
                          >
                            <option value="domain">DOMAIN</option>
                            <option value="ip">IP</option>
                          </select>
                          <PromptInput
                            value={editValue}
                            onChange={setEditValue}
                            placeholder={editType === "domain" ? "example.com" : "203.0.113.10"}
                          />
                          <PromptInput
                            value={editLabel}
                            onChange={setEditLabel}
                            placeholder="optional label"
                          />
                          <TerminalButton disabled={!editValue.trim()}>[ SAVE ]</TerminalButton>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="border border-[var(--border)] px-3 py-2 text-[var(--amber-dim)] hover:text-[var(--amber)]"
                          >
                            [ CANCEL ]
                          </button>
                        </form>
                        <p className="mt-2 text-xs text-[var(--amber-muted)]">
                          Editing the target resets cached results. Renaming the label keeps
                          the existing cache.
                        </p>
                      </td>
                    </tr>
                  )}
                  {expandedIds.has(asset.id) && (
                    <tr>
                      <td colSpan={5}>{renderAssetDetails(asset)}</td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

async function sendAssetRequest(
  url: string,
  method: "POST" | "PATCH",
  body?: Record<string, unknown>,
  csrfToken?: string | null,
) {
  const res = await fetch(url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await readJson<AssetResponse>(res);
  if (!res.ok) {
    throw new Error(getApiErrorMessage(res, data, "Asset request failed"));
  }
  return data.asset;
}

function summarizeAsset(summary: AssetSummary | null) {
  if (!summary) return "No cached result";

  if (summary.type === "domain") {
    return `${summary.subdomainCount} subdomains`;
  }

  return `${summary.totalOpenPorts} ports (${summary.highRiskPorts.length} high)`;
}

function renderAssetDetails(asset: MonitoredAsset) {
  if (!asset.last_result) {
    return (
      <p className="py-2 text-sm text-[var(--amber-muted)]">
        No cached Shodan result. Use [ REFRESH ] to query this asset.
      </p>
    );
  }

  return asset.type === "domain"
    ? renderDomainDetails(asset.last_result)
    : renderHostDetails(asset.last_result);
}

function renderDomainDetails(snapshot: AssetSnapshot) {
  const result = snapshot as ShodanDomainInfo;

  if (!result.subdomains.length) {
    return <p className="py-2 text-sm text-[var(--amber-muted)]">No subdomains cached.</p>;
  }

  return (
    <ul className="max-h-56 space-y-1 overflow-y-auto py-2 text-sm">
      {result.subdomains.map((subdomain) => (
        <li key={subdomain} className="border-b border-[var(--border)] py-1">
          <span className="text-[var(--amber-dim)]">&gt;</span> {subdomain}.{result.domain}
        </li>
      ))}
    </ul>
  );
}

function renderHostDetails(snapshot: AssetSnapshot) {
  const result = snapshot as HostScanSnapshot;

  if (!result.host.ports.length) {
    return <p className="py-2 text-sm text-[var(--amber-muted)]">No open ports cached.</p>;
  }

  return (
    <table className="terminal-table my-2">
      <thead>
        <tr>
          <th>Port</th>
          <th>Risk</th>
          <th>Service</th>
        </tr>
      </thead>
      <tbody>
        {result.host.ports.sort((a, b) => a - b).map((port) => {
          const risk = getPortRisk(port);
          const banner = result.host.data.find((item) => item.port === port);
          return (
            <tr key={port} className={RISK_COLORS[risk.level]}>
              <td className="font-bold">{port}</td>
              <td className="uppercase">{risk.level}</td>
              <td>
                {risk.label}
                {banner?.product && (
                  <span className="ml-1 text-[var(--amber-muted)]">
                    ({banner.product}
                    {banner.version ? ` ${banner.version}` : ""})
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PromptInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center border border-[var(--border)] bg-[var(--background)] px-3">
      <span className="text-[var(--amber-dim)]">&gt;</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent px-2 py-2 text-[var(--amber)] outline-none placeholder:text-[var(--amber-muted)]"
      />
    </div>
  );
}

function TerminalButton({
  disabled,
  children,
}: {
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="border border-[var(--amber)] bg-[var(--amber)] px-4 py-2 font-medium text-[#0a0805] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function RowButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="border border-[var(--border)] px-2 py-1 text-xs text-[var(--amber-dim)] hover:text-[var(--amber)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      [ {children} ]
    </button>
  );
}
