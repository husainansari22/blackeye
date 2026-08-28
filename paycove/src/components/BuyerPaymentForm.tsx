"use client";

import { FormEvent, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
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
    <div className="animate-fade-up">
      {/* Amount hero */}
      <div className="relative overflow-hidden rounded-[var(--app-radius-xl)] p-6 text-center">
        <div className="absolute inset-0 bg-gradient-to-br from-[#00e5b5]/15 to-[#3b9eff]/10" />
        <div className="relative">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15">
            <ShieldCheck className="h-6 w-6 text-[#00e5b5]" />
          </div>
          <p className="mt-4 text-[11px] uppercase tracking-widest text-white/35">
            Protected payment
          </p>
          <p className="mt-1 text-[2.5rem] font-bold tracking-tight">
            {formatNaira(deal.amount)}
          </p>
          <p className="mt-2 text-sm text-white/45">{deal.title}</p>
          <p className="mt-1 text-[12px] text-white/30">Seller: {deal.seller.name}</p>
        </div>
      </div>

      {/* Trust note */}
      <div className="mt-4 flex items-center gap-3 glass rounded-[var(--app-radius)] px-4 py-3">
        <Lock className="h-4 w-4 shrink-0 text-[#00e5b5]" />
        <p className="text-[12px] leading-snug text-white/45">
          Funds held in escrow until you confirm delivery. Fee included in total.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        <input name="buyerName" required placeholder="Your full name" className="app-input" />
        <input name="buyerEmail" type="email" required placeholder="Email address" className="app-input" />
        <input name="buyerPhone" placeholder="Phone number" className="app-input" />

        {error && (
          <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || deal.status !== "PENDING_PAYMENT"}
          className="btn-primary mt-2"
        >
          {loading ? "Redirecting to Paystack..." : `Pay ${formatNaira(deal.amount)} safely`}
        </button>
      </form>
    </div>
  );
}
