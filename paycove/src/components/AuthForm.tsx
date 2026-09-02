"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppLogo, AppShell } from "@/components/AppShell";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <AppShell>
      <main className="relative flex min-h-[100dvh] flex-col px-5">
        <div className="pt-16 animate-fade-up">
          <AppLogo size="lg" />
          <h1 className="mt-8 text-2xl font-bold tracking-tight">
            {mode === "login" ? "Welcome back" : "Create account"}
          </h1>
          <p className="mt-2 text-sm text-white/45">
            {mode === "login"
              ? "Sign in to manage your deals"
              : "Start protecting deals in minutes"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-1 flex-col animate-fade-up animate-fade-up-delay-1">
          <div className="space-y-3">
            {mode === "register" && (
              <>
                <input name="name" required placeholder="Full name" className="app-input" />
                <input name="phone" placeholder="Phone (optional)" className="app-input" />
              </>
            )}
            <input name="email" type="email" required placeholder="Email address" className="app-input" />
            <input
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="Password (min 8 chars)"
              className="app-input"
            />
            {mode === "register" && (
              <select name="role" defaultValue="SELLER" className="app-input">
                <option value="SELLER">Seller / Service provider</option>
                <option value="AGENT">Agent / Broker</option>
              </select>
            )}
          </div>

          {error && (
            <p className="mt-3 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
          )}

          <div className="mt-auto pb-[calc(24px+env(safe-area-inset-bottom))] pt-8">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
            </button>
            <p className="mt-4 text-center text-sm text-white/40">
              {mode === "login" ? (
                <>
                  New here?{" "}
                  <Link href="/register" className="font-medium text-[#00e5b5]">
                    Sign up
                  </Link>
                </>
              ) : (
                <>
                  Have an account?{" "}
                  <Link href="/login" className="font-medium text-[#00e5b5]">
                    Sign in
                  </Link>
                </>
              )}
            </p>
            <Link href="/" className="mt-3 block text-center text-[11px] text-white/25">
              ← Back to home
            </Link>
          </div>
        </form>
      </main>
    </AppShell>
  );
}
