"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ShodanProfile } from "@/types/shodan";
import { AssetDashboard } from "@/components/AssetDashboard";
import { DomainScanner } from "@/components/DomainScanner";
import { HostScanner } from "@/components/HostScanner";
import { getApiErrorMessage, readJson } from "@/lib/api-client";

export default function HomePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ShodanProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [tab, setTab] = useState<"dashboard" | "domain" | "ip">("dashboard");
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then(async (res) => {
        const data = await readJson<{
          authenticated: boolean;
          csrfToken?: string | null;
          error?: string;
        }>(res);
        if (!res.ok || !data.authenticated) {
          throw new Error(data.error ?? "Authentication required");
        }
        setCsrfToken(data.csrfToken ?? null);
      })
      .catch(() => router.push("/login"));

    fetch("/api/shodan/profile")
      .then(async (res) => {
        const data = await readJson<ShodanProfile & { error?: string }>(res);
        if (!res.ok) {
          throw new Error(getApiErrorMessage(res, data, "Failed to load profile"));
        }
        setProfile(data);
      })
      .catch((err: Error) => setProfileError(err.message));
  }, [router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
    });
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="mx-auto grid max-w-3xl gap-4 px-4 py-10">
      <header className="terminal-panel px-4 py-3">
        <p className="mb-1 text-xs uppercase tracking-widest text-[var(--amber-dim)]">
          // personal security tool
        </p>
        <h1 className="terminal-glow text-2xl font-bold tracking-tight">
          [ ATTACK SURFACE CHECKER ]
        </h1>
        <p className="mt-2 max-w-xl text-xs text-[var(--amber-muted)]">
          Look up what Shodan knows about your domain or IP address. Your API key stays on
          the server — it is never sent to the browser.
        </p>
      </header>

      <section className="terminal-panel px-4 py-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--amber-dim)]">
          [ STATUS ]
        </h2>
        {profileError ? (
          <p className="text-sm text-[var(--risk-high)]">[ ERROR ] {profileError}</p>
        ) : profile ? (
          <dl className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-4">
            <dt className="text-[var(--amber-dim)]">PLAN:</dt>
            <dd className="terminal-glow font-bold">
              {profile.member ? "MEMBER" : "FREE"}
            </dd>
            <dt className="text-[var(--amber-dim)]">CREDITS:</dt>
            <dd className="terminal-glow font-bold">{profile.credits}</dd>
            <dt className="text-[var(--amber-dim)]">SESSION:</dt>
            <dd>
              <button
                type="button"
                onClick={handleLogout}
                className="border border-[var(--border)] px-2 py-1 text-xs text-[var(--amber-dim)] hover:text-[var(--amber)]"
              >
                [ LOGOUT ]
              </button>
            </dd>
          </dl>
        ) : (
          <p className="text-sm text-[var(--amber-muted)]">Loading account info…</p>
        )}
      </section>

      <div className="flex gap-2">
        <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")}>
          DASHBOARD
        </TabButton>
        <TabButton active={tab === "domain"} onClick={() => setTab("domain")}>
          QUICK DOMAIN
        </TabButton>
        <TabButton active={tab === "ip"} onClick={() => setTab("ip")}>
          QUICK HOST
        </TabButton>
      </div>

      {tab === "dashboard" ? (
        <AssetDashboard csrfToken={csrfToken} />
      ) : tab === "domain" ? (
        <DomainScanner />
      ) : (
        <HostScanner />
      )}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border px-4 py-2 text-sm font-medium transition ${
        active
          ? "border-[var(--amber)] bg-[var(--amber)] text-[#0a0805]"
          : "border-[var(--border)] bg-[var(--panel)] text-[var(--amber-dim)] hover:text-[var(--amber)]"
      }`}
    >
      [ {children} ]
    </button>
  );
}
