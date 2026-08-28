"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { formatNaira } from "@/lib/utils";

type Deal = {
  publicId: string;
  title: string;
  amount: number;
  status: string;
  proofs: Array<{ type: string; url: string }>;
};

export function BuyerDealActions({ deal }: { deal: Deal }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAction(action: "confirm" | "dispute") {
    setLoading(true);
    const reason =
      action === "dispute"
        ? window.prompt("Why are you opening a dispute?") ?? "Buyer dispute"
        : undefined;

    const response = await fetch(`/api/deals/${deal.publicId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });

    setLoading(false);
    if (response.ok) {
      setMessage(action === "confirm" ? "Thanks for confirming delivery." : "Dispute opened.");
      router.refresh();
    }
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-600">Deal amount</p>
      <p className="text-2xl font-bold">{formatNaira(deal.amount)}</p>
      <div className="mt-4">
        <StatusBadge status={deal.status} />
      </div>

      {deal.proofs.length > 0 && (
        <div className="mt-6">
          <p className="font-medium text-slate-900">Seller proof</p>
          <ul className="mt-2 space-y-2 text-sm">
            {deal.proofs.map((proof, index) => (
              <li key={index}>
                <a href={proof.url} target="_blank" className="text-teal-700 hover:underline">
                  View {proof.type.toLowerCase()} proof
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {["SHIPPED", "PAID", "DELIVERED"].includes(deal.status) && (
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={() => handleAction("confirm")}
            className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Confirm delivery
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleAction("dispute")}
            className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700"
          >
            Open dispute
          </button>
        </div>
      )}

      {message && <p className="mt-4 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">{message}</p>}
    </div>
  );
}

export function PaymentSuccessVerifier({
  publicId,
  reference,
}: {
  publicId: string;
  reference: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState("Verifying payment...");

  useEffect(() => {
    async function verify() {
      const response = await fetch("/api/pay/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });

      if (response.ok) {
        setStatus("Payment successful. Funds are now held in escrow.");
        router.replace(`/pay/${publicId}`);
        router.refresh();
      } else {
        setStatus("Payment verification failed. Contact support.");
      }
    }

    verify();
  }, [publicId, reference, router]);

  return <p className="text-center text-slate-600">{status}</p>;
}
