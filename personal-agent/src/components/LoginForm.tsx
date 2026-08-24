"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode }),
      });

      if (!res.ok) {
        setError("Invalid access code");
        return;
      }

      router.push("/chat");
      router.refresh();
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
      <div>
        <label htmlFor="accessCode" className="mb-2 block text-sm text-zinc-400">
          Access Code
        </label>
        <input
          id="accessCode"
          type="password"
          value={accessCode}
          onChange={(e) => setAccessCode(e.target.value)}
          placeholder="Enter your private access code"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          autoFocus
          required
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={loading || !accessCode}
        className="w-full rounded-lg bg-violet-600 px-4 py-3 font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Unlocking..." : "Enter"}
      </button>
    </form>
  );
}
