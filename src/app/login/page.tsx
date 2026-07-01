"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginWithPasskey } from "@/lib/passkey-client";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setLoading(true);
    setError(null);

    try {
      await loginWithPasskey();
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passkey login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-xl place-items-center px-4">
      <section className="terminal-panel w-full px-4 py-4">
        <p className="mb-1 text-xs uppercase tracking-widest text-[var(--amber-dim)]">
          // authentication required
        </p>
        <h1 className="terminal-glow mb-4 text-2xl font-bold">[ PASSKEY LOGIN ]</h1>
        <p className="mb-4 text-sm text-[var(--amber-muted)]">
          Use your passkey (for example, from a synced password manager) to unlock the
          dashboard.
        </p>
        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          className="border border-[var(--amber)] bg-[var(--amber)] px-4 py-2 font-medium text-[#0a0805] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "[ WAITING FOR PASSKEY... ]" : "[ LOGIN WITH PASSKEY ]"}
        </button>
        <p className="mt-4 text-xs text-[var(--amber-muted)]">
          First time? Visit <code className="text-[var(--amber)]">/setup-passkey</code>.
        </p>
        {error && <p className="mt-3 text-sm text-[var(--risk-high)]">[ ERROR ] {error}</p>}
      </section>
    </main>
  );
}
