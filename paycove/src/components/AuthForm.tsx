"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
    <form onSubmit={handleSubmit} className="space-y-4">
      {mode === "register" && (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Full name</label>
            <input
              name="name"
              required
              className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none ring-teal-600 focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Phone (optional)</label>
            <input
              name="phone"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none ring-teal-600 focus:ring-2"
              placeholder="+234..."
            />
          </div>
        </>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
        <input
          name="email"
          type="email"
          required
          className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none ring-teal-600 focus:ring-2"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none ring-teal-600 focus:ring-2"
        />
      </div>

      {mode === "register" && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">I am a</label>
          <select
            name="role"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none ring-teal-600 focus:ring-2"
            defaultValue="SELLER"
          >
            <option value="SELLER">Seller / Service provider</option>
            <option value="AGENT">Agent / Broker</option>
          </select>
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-teal-600 py-3 font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
      >
        {loading ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}
      </button>

      <p className="text-center text-sm text-slate-600">
        {mode === "login" ? (
          <>
            New to PayCove?{" "}
            <Link href="/register" className="font-medium text-teal-700">
              Create account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-teal-700">
              Log in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
