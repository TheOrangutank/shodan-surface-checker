"use client";

import { FormEvent, useState } from "react";
import type { ShodanHostInfo, ScanSummary } from "@/types/shodan";
import { getApiErrorMessage, readJson } from "@/lib/api-client";
import { RISK_COLORS, getPortRisk } from "@/lib/port-risk";

interface HostScanResult {
  host: ShodanHostInfo;
  summary: ScanSummary;
}

export function HostScanner() {
  const [ip, setIp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HostScanResult | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const normalizedIp = ip.trim();
      const res = await fetch(`/api/shodan/host?ip=${encodeURIComponent(normalizedIp)}`);
      const data = await readJson<HostScanResult & { error?: string }>(res);
      if (!res.ok) {
        throw new Error(getApiErrorMessage(res, data, "Scan failed"));
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }

  const { host, summary } = result ?? {};

  return (
    <div className="grid gap-4">
      <form onSubmit={handleSubmit} className="terminal-panel px-4 py-3">
        <label htmlFor="ip" className="mb-2 block text-xs uppercase tracking-wide text-[var(--amber-dim)]">
          IP address
        </label>
        <p className="mb-3 text-xs text-[var(--amber-muted)]">
          Example: your home public IP or a server IP. Shows open ports Shodan has observed.
        </p>
        <div className="flex gap-3">
          <div className="flex flex-1 items-center border border-[var(--border)] bg-[var(--background)] px-3">
            <span className="text-[var(--amber-dim)]">&gt;</span>
            <input
              id="ip"
              type="text"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              placeholder="203.0.113.10"
              required
              className="w-full bg-transparent px-2 py-2 text-[var(--amber)] outline-none placeholder:text-[var(--amber-muted)]"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !ip.trim()}
            className="border border-[var(--amber)] bg-[var(--amber)] px-4 py-2 font-medium text-[#0a0805] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "[ SCANNING... ]" : "[ RUN ]"}
          </button>
        </div>
        {error && (
          <p className="mt-3 text-sm text-[var(--risk-high)]">[ ERROR ] {error}</p>
        )}
      </form>

      {host && summary && (
        <section className="grid gap-4">
          {summary.highRiskPorts.length > 0 && (
            <AlertBanner level="high">
              {summary.highRiskPorts.length} HIGH-RISK PORT
              {summary.highRiskPorts.length === 1 ? "" : "S"} EXPOSED:{" "}
              {summary.highRiskPorts.join(", ")}
            </AlertBanner>
          )}

          <div className="terminal-panel px-4 py-3">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide">
              HOST: <span className="terminal-glow">{host.ip_str}</span>
            </h2>

            <dl className="grid gap-1 text-sm sm:grid-cols-2">
              <InfoRow label="Organization" value={host.org ?? "Unknown"} />
              <InfoRow label="ISP" value={host.isp ?? "Unknown"} />
              <InfoRow
                label="Location"
                value={[host.city, host.country_name].filter(Boolean).join(", ") || "Unknown"}
              />
              <InfoRow label="Last seen" value={new Date(host.last_update).toLocaleString()} />
              <InfoRow
                label="Hostnames"
                value={host.hostnames.length ? host.hostnames.join(", ") : "None"}
              />
            </dl>

            <h3 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide">
              OPEN_PORTS = {summary.totalOpenPorts}
            </h3>

            {host.ports.length === 0 ? (
              <p className="text-sm text-[var(--amber-muted)]">
                No open ports found in Shodan for this IP.
              </p>
            ) : (
              <table className="terminal-table">
                <thead>
                  <tr>
                    <th>Port</th>
                    <th>Risk</th>
                    <th>Service</th>
                  </tr>
                </thead>
                <tbody>
                  {host.ports.sort((a, b) => a - b).map((port) => {
                    const risk = getPortRisk(port);
                    const banner = host.data.find((b) => b.port === port);
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
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-xs uppercase tracking-wide text-[var(--amber-dim)]">{label}:</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

function AlertBanner({
  level,
  children,
}: {
  level: "high" | "medium";
  children: React.ReactNode;
}) {
  const colorVar = level === "high" ? "var(--risk-high)" : "var(--risk-medium)";

  return (
    <div
      className="terminal-glow terminal-panel px-4 py-3 text-sm font-medium"
      style={{ color: colorVar, borderColor: colorVar }}
    >
      [!] {children}
    </div>
  );
}
