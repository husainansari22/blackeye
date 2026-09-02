"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, MessageCircle } from "lucide-react";
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
      setMessage(action === "confirm" ? "Delivery confirmed ✓" : "Dispute opened");
      router.refresh();
    }
  }

  return (
    <div className="animate-fade-up glass rounded-[var(--app-radius-xl)] p-5">
      <div className="flex items-center justify-between">
        <p className="text-2xl font-bold">{formatNaira(deal.amount)}</p>
        <StatusBadge status={deal.status} />
      </div>
      <p className="mt-1 text-sm text-white/45">{deal.title}</p>

      {deal.proofs.length > 0 && (
        <div className="mt-4 rounded-[var(--app-radius)] bg-white/4 p-3">
          <p className="text-[11px] uppercase tracking-widest text-white/30">Seller proof</p>
          {deal.proofs.map((proof, i) => (
            <a
              key={i}
              href={proof.url}
              target="_blank"
              className="mt-2 block text-sm text-[#00e5b5]"
            >
              View delivery proof →
            </a>
          ))}
        </div>
      )}

      {["SHIPPED", "PAID", "DELIVERED"].includes(deal.status) && (
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => handleAction("confirm")}
            className="btn-primary gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            Confirm delivery
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleAction("dispute")}
            className="btn-ghost text-red-400"
          >
            <MessageCircle className="h-4 w-4" />
            Open dispute
          </button>
        </div>
      )}

      {message && (
        <p className="mt-4 text-center text-sm text-emerald-400">{message}</p>
      )}
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
  const [status, setStatus] = useState("Securing your payment...");

  useEffect(() => {
    async function verify() {
      const response = await fetch("/api/pay/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });

      if (response.ok) {
        setStatus("Payment secured in escrow ✓");
        setTimeout(() => {
          router.replace(`/pay/${publicId}`);
          router.refresh();
        }, 1200);
      } else {
        setStatus("Verification failed — contact support");
      }
    }

    verify();
  }, [publicId, reference, router]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#00e5b5]/30 border-t-[#00e5b5]" />
      <p className="text-sm text-white/50">{status}</p>
    </div>
  );
}
