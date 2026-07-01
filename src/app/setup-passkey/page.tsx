"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { registerPasskey } from "@/lib/passkey-client";

export default function SetupPasskeyPage() {
  const router = useRouter();
  const [setupToken, setSetupToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      await registerPasskey(setupToken.trim());
      setMessage("Passkey registered. Redirecting to login...");
      setTimeout(() => router.push("/login"), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passkey setup failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-xl place-items-center px-4">
      <form onSubmit={handleSubmit} className="terminal-panel w-full px-4 py-4">
        <p className="mb-1 text-xs uppercase tracking-widest text-[var(--amber-dim)]">
          // one-time setup
        </p>
        <h1 className="terminal-glow mb-4 text-2xl font-bold">[ SETUP PASSKEY ]</h1>
        <p className="mb-4 text-sm text-[var(--amber-muted)]">
          Enter your server-side setup token, then create your single admin passkey.
        </p>
        <div className="mb-4 flex items-center border border-[var(--border)] bg-[var(--background)] px-3">
          <span className="text-[var(--amber-dim)]">&gt;</span>
          <input
            type="password"
            value={setupToken}
            onChange={(e) => setSetupToken(e.target.value)}
            placeholder="PASSKEY_SETUP_TOKEN"
            className="w-full bg-transparent px-2 py-2 text-[var(--amber)] outline-none placeholder:text-[var(--amber-muted)]"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !setupToken.trim()}
          className="border border-[var(--amber)] bg-[var(--amber)] px-4 py-2 font-medium text-[#0a0805] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "[ WAITING FOR PASSKEY... ]" : "[ REGISTER PASSKEY ]"}
        </button>
        {message && <p className="mt-3 text-sm text-[var(--risk-low)]">[ OK ] {message}</p>}
        {error && <p className="mt-3 text-sm text-[var(--risk-high)]">[ ERROR ] {error}</p>}
      </form>
    </main>
  );
}
