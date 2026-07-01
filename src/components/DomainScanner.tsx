"use client";

import { FormEvent, useState } from "react";
import type { ShodanDomainInfo } from "@/types/shodan";
import { getApiErrorMessage, readJson } from "@/lib/api-client";

export function DomainScanner() {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShodanDomainInfo | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const normalizedDomain = domain.trim();
      const res = await fetch(
        `/api/shodan/domain?domain=${encodeURIComponent(normalizedDomain)}`,
      );
      const data = await readJson<ShodanDomainInfo & { error?: string }>(res);
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

  return (
    <div className="grid gap-4">
      <form onSubmit={handleSubmit} className="terminal-panel px-4 py-3">
        <label htmlFor="domain" className="mb-2 block text-xs uppercase tracking-wide text-[var(--amber-dim)]">
          Domain name
        </label>
        <p className="mb-3 text-xs text-[var(--amber-muted)]">
          Example: <code className="text-[var(--amber)]">example.com</code> — finds subdomains
          Shodan has seen.
        </p>
        <div className="flex gap-3">
          <div className="flex flex-1 items-center border border-[var(--border)] bg-[var(--background)] px-3">
            <span className="text-[var(--amber-dim)]">&gt;</span>
            <input
              id="domain"
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="yourdomain.com"
              required
              className="w-full bg-transparent px-2 py-2 text-[var(--amber)] outline-none placeholder:text-[var(--amber-muted)]"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !domain.trim()}
            className="border border-[var(--amber)] bg-[var(--amber)] px-4 py-2 font-medium text-[#0a0805] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "[ SCANNING... ]" : "[ RUN ]"}
          </button>
        </div>
        {error && (
          <p className="mt-3 text-sm text-[var(--risk-high)]">[ ERROR ] {error}</p>
        )}
      </form>

      {result && (
        <section className="terminal-panel px-4 py-3">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide">
            RESULT: {result.domain}
          </h2>

          <p className="mb-3 text-xs text-[var(--amber-dim)]">
            SUBDOMAINS_FOUND = <span className="terminal-glow font-bold">{result.subdomains.length}</span>
          </p>

          {result.subdomains.length > 0 ? (
            <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
              {result.subdomains.map((sub) => (
                <li key={sub} className="border-b border-[var(--border)] py-1">
                  <span className="text-[var(--amber-dim)]">&gt;</span> {sub}.{result.domain}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--amber-muted)]">
              No subdomains found. Shodan may not have indexed this domain yet.
            </p>
          )}

          <p className="mt-4 text-xs text-[var(--amber-muted)]">
            Tip: pick a subdomain, resolve it to an IP, then use the HOST tab to see open ports.
          </p>
        </section>
      )}
    </div>
  );
}
