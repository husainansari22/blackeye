"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { DEAL_TYPES } from "@/lib/constants";
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
      setMessage("Delivery proof uploaded. Waiting for buyer confirmation.");
      router.refresh();
    }
  }

  async function copyLink() {
    const url = `${window.location.origin}/pay/${deal.publicId}`;
    await navigator.clipboard.writeText(url);
    setMessage("Payment link copied to clipboard.");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-600">Payment link</p>
        <p className="mt-2 break-all font-mono text-sm text-slate-900">
          {typeof window !== "undefined" ? `${window.location.origin}/pay/${deal.publicId}` : `/pay/${deal.publicId}`}
        </p>
        <button
          type="button"
          onClick={copyLink}
          className="mt-4 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
        >
          Copy link for WhatsApp / IG
        </button>
      </div>

      {["PAID", "IN_PROGRESS"].includes(deal.status) && (
        <form onSubmit={handleShip} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h3 className="font-semibold text-slate-900">Upload delivery proof</h3>
          <input
            name="trackingInfo"
            placeholder="Tracking number or rider phone"
            className="w-full rounded-xl border border-slate-200 px-4 py-3"
          />
          <input
            name="proofUrl"
            placeholder="Proof image URL"
            className="w-full rounded-xl border border-slate-200 px-4 py-3"
          />
          <textarea
            name="deliveryNote"
            placeholder="Delivery notes"
            className="w-full rounded-xl border border-slate-200 px-4 py-3"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Mark as shipped
          </button>
        </form>
      )}

      {message && <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">{message}</p>}
    </div>
  );
}

export function DealSummary({ deal }: { deal: Deal }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-600">
            {DEAL_TYPES[deal.type as keyof typeof DEAL_TYPES]?.icon}{" "}
            {DEAL_TYPES[deal.type as keyof typeof DEAL_TYPES]?.label ?? deal.type}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{deal.title}</h1>
          {deal.description && <p className="mt-2 text-slate-600">{deal.description}</p>}
        </div>
        <StatusBadge status={deal.status} />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-sm text-slate-600">Deal amount</p>
          <p className="mt-1 font-semibold">{formatNaira(deal.amount)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-sm text-slate-600">PayCove fee (4%)</p>
          <p className="mt-1 font-semibold">{formatNaira(deal.feeAmount)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-sm text-slate-600">You receive</p>
          <p className="mt-1 font-semibold">{formatNaira(deal.sellerAmount)}</p>
        </div>
      </div>

      {(deal.buyerName || deal.buyerEmail) && (
        <div className="mt-6 rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
          <p className="font-medium text-slate-900">Buyer</p>
          <p>{deal.buyerName}</p>
          <p>{deal.buyerEmail}</p>
        </div>
      )}

      {deal.proofs.length > 0 && (
        <div className="mt-6">
          <p className="font-medium text-slate-900">Proofs</p>
          <ul className="mt-2 space-y-2 text-sm">
            {deal.proofs.map((proof, index) => (
              <li key={index}>
                <a href={proof.url} className="text-teal-700 hover:underline" target="_blank">
                  {proof.type}: {proof.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {deal.disputes.length > 0 && (
        <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Open dispute</p>
          <p>{deal.disputes[0].reason}</p>
        </div>
      )}
    </div>
  );
}
