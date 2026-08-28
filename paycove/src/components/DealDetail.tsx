"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Link2, Truck } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { DEAL_TYPES } from "@/lib/constants";
import { DEAL_COLORS, DEAL_ICON_MAP } from "@/lib/deal-icons";
import { formatNaira } from "@/lib/utils";

type Deal = {
  publicId: string;
  title: string;
  description: string | null;
  amount: number;
  feeAmount: number;
  sellerAmount: number;
  status: string;
  type: string;
  buyerName: string | null;
  buyerEmail: string | null;
  trackingInfo: string | null;
  deliveryNote: string | null;
  proofs: Array<{ type: string; url: string; note: string | null }>;
  disputes: Array<{ reason: string; status: string }>;
};

export function DealActions({ deal }: { deal: Deal }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const payUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/pay/${deal.publicId}`
      : `/pay/${deal.publicId}`;

  async function handleShip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formData = new FormData(event.currentTarget);

    const response = await fetch(`/api/deals/${deal.publicId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ship",
        trackingInfo: formData.get("trackingInfo"),
        deliveryNote: formData.get("deliveryNote"),
        proofUrl: formData.get("proofUrl") || undefined,
      }),
    });

    setLoading(false);
    if (response.ok) {
      setMessage("Proof uploaded — waiting for buyer");
      router.refresh();
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(payUrl);
    setMessage("Link copied! Paste in WhatsApp or IG");
  }

  return (
    <div className="space-y-3">
      <div className="glass rounded-[var(--app-radius-lg)] p-4">
        <div className="flex items-center gap-2 text-white/40">
          <Link2 className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-widest">Payment link</span>
        </div>
        <p className="mt-2 break-all font-mono text-[12px] text-white/60">{payUrl}</p>
        <button type="button" onClick={copyLink} className="btn-primary mt-4 gap-2">
          <Copy className="h-4 w-4" />
          Copy for WhatsApp
        </button>
      </div>

      {["PAID", "IN_PROGRESS"].includes(deal.status) && (
        <form onSubmit={handleShip} className="glass rounded-[var(--app-radius-lg)] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-[#00e5b5]" />
            <p className="text-sm font-semibold">Upload delivery proof</p>
          </div>
          <input name="trackingInfo" placeholder="Tracking / rider phone" className="app-input" />
          <input name="proofUrl" placeholder="Proof image URL" className="app-input" />
          <textarea name="deliveryNote" placeholder="Notes" rows={2} className="app-input resize-none" />
          <button type="submit" disabled={loading} className="btn-ghost w-full">
            {loading ? "Uploading..." : "Mark as shipped"}
          </button>
        </form>
      )}

      {message && (
        <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-center text-sm text-emerald-400">
          {message}
        </p>
      )}
    </div>
  );
}

export function DealSummary({ deal }: { deal: Deal }) {
  const typeInfo = DEAL_TYPES[deal.type as keyof typeof DEAL_TYPES];
  const Icon = DEAL_ICON_MAP[deal.type as keyof typeof DEAL_ICON_MAP];

  return (
    <div className="glass rounded-[var(--app-radius-xl)] overflow-hidden">
      <div className={`bg-gradient-to-br p-5 ${DEAL_COLORS[deal.type as keyof typeof DEAL_COLORS]}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
            <Icon className="h-5 w-5 text-white/80" />
          </div>
          <StatusBadge status={deal.status} />
        </div>
        <h1 className="mt-4 text-xl font-bold leading-tight">{deal.title}</h1>
        {deal.description && (
          <p className="mt-2 text-[13px] text-white/50">{deal.description}</p>
        )}
        <p className="mt-3 text-[11px] uppercase tracking-widest text-white/35">
          {typeInfo?.label}
        </p>
      </div>

      <div className="grid grid-cols-3 divide-x divide-white/6 border-t border-white/6">
        {[
          ["Amount", formatNaira(deal.amount)],
          ["Fee", formatNaira(deal.feeAmount)],
          ["You get", formatNaira(deal.sellerAmount)],
        ].map(([label, value]) => (
          <div key={label} className="px-3 py-4 text-center">
            <p className="text-[10px] uppercase tracking-wider text-white/30">{label}</p>
            <p className="mt-1 text-[13px] font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {(deal.buyerName || deal.buyerEmail) && (
        <div className="border-t border-white/6 px-5 py-4">
          <p className="text-[10px] uppercase tracking-widest text-white/30">Buyer</p>
          <p className="mt-1 text-sm">{deal.buyerName}</p>
          <p className="text-[12px] text-white/40">{deal.buyerEmail}</p>
        </div>
      )}

      {deal.disputes.length > 0 && (
        <div className="border-t border-red-500/20 bg-red-500/5 px-5 py-4">
          <p className="text-sm font-medium text-red-400">Dispute open</p>
          <p className="mt-1 text-[12px] text-red-400/70">{deal.disputes[0].reason}</p>
        </div>
      )}
    </div>
  );
}
