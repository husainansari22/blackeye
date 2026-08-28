"use client";

import { FormEvent, useState } from "react";
import { formatNaira } from "@/lib/utils";

type Deal = {
  publicId: string;
  title: string;
  amount: number;
  feeAmount: number;
  sellerAmount: number;
  status: string;
  type: string;
  seller: { name: string };
};

export function BuyerPaymentForm({ deal }: { deal: Deal }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/pay/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicId: deal.publicId,
        buyerName: formData.get("buyerName"),
        buyerEmail: formData.get("buyerEmail"),
        buyerPhone: formData.get("buyerPhone"),
      }),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.error ?? "Payment failed to start");
      return;
    }

    window.location.href = data.authorization_url;
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium uppercase tracking-wide text-teal-700">Secure payment</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">{deal.title}</h1>
      <p className="mt-2 text-sm text-slate-600">Seller: {deal.seller.name}</p>

      <div className="mt-6 rounded-2xl bg-slate-50 p-4">
        <div className="flex justify-between text-sm text-slate-600">
          <span>Amount</span>
          <span>{formatNaira(deal.amount)}</span>
        </div>
        <div className="mt-2 flex justify-between text-sm text-slate-600">
          <span>PayCove protection fee (included)</span>
          <span>{formatNaira(deal.feeAmount)}</span>
        </div>
        <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-lg font-semibold text-slate-900">
          <span>Total to pay</span>
          <span>{formatNaira(deal.amount)}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <input
          name="buyerName"
          required
          placeholder="Your full name"
          className="w-full rounded-xl border border-slate-200 px-4 py-3"
        />
        <input
          name="buyerEmail"
          type="email"
          required
          placeholder="Your email"
          className="w-full rounded-xl border border-slate-200 px-4 py-3"
        />
        <input
          name="buyerPhone"
          placeholder="Phone number"
          className="w-full rounded-xl border border-slate-200 px-4 py-3"
        />

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={loading || deal.status !== "PENDING_PAYMENT"}
          className="w-full rounded-xl bg-teal-600 py-3 font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
        >
          {loading ? "Redirecting to Paystack..." : `Pay ${formatNaira(deal.amount)} safely`}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-slate-500">
        Funds are held until delivery is confirmed or dispute is resolved.
      </p>
    </div>
  );
}
