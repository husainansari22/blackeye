"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { DEAL_TYPES, DealTypeId } from "@/lib/constants";

type Milestone = { title: string; amount: string };

export function CreateDealForm() {
  const router = useRouter();
  const [type, setType] = useState<DealTypeId>("GOODS");
  const [milestones, setMilestones] = useState<Milestone[]>([
    { title: "Deposit", amount: "" },
    { title: "Final payment", amount: "" },
  ]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const showMilestones = ["SERVICE", "EVENT"].includes(type);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const amount = Number(formData.get("amount"));

    const payload = {
      type,
      title: String(formData.get("title")),
      description: String(formData.get("description") || ""),
      amount,
      buyerName: String(formData.get("buyerName") || ""),
      buyerEmail: String(formData.get("buyerEmail") || ""),
      buyerPhone: String(formData.get("buyerPhone") || ""),
      milestones: showMilestones
        ? milestones
            .filter((m) => m.title && m.amount)
            .map((m) => ({ title: m.title, amount: Number(m.amount) }))
        : undefined,
    };

    const response = await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.error ?? "Failed to create deal");
      return;
    }

    router.push(`/dashboard/deals/${data.deal.publicId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">Deal type</label>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.values(DEAL_TYPES).map((dealType) => (
            <button
              key={dealType.id}
              type="button"
              onClick={() => setType(dealType.id)}
              className={`rounded-2xl border p-4 text-left transition ${
                type === dealType.id
                  ? "border-teal-600 bg-teal-50 ring-2 ring-teal-600"
                  : "border-slate-200 hover:border-teal-300"
              }`}
            >
              <p className="text-lg">{dealType.icon}</p>
              <p className="mt-2 font-semibold text-slate-900">{dealType.label}</p>
              <p className="mt-1 text-sm text-slate-600">{dealType.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">Deal title</label>
          <input
            name="title"
            required
            placeholder="e.g. iPhone 15 Pro Max — 256GB"
            className="w-full rounded-xl border border-slate-200 px-4 py-3"
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
          <textarea
            name="description"
            rows={3}
            placeholder="Details, delivery terms, warranty, etc."
            className="w-full rounded-xl border border-slate-200 px-4 py-3"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Amount (₦)</label>
          <input
            name="amount"
            type="number"
            min="1000"
            required
            className="w-full rounded-xl border border-slate-200 px-4 py-3"
          />
        </div>
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          PayCove fee: <strong>4%</strong> deducted when funds are released to you.
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 p-4">
        <p className="font-medium text-slate-900">Buyer details (optional)</p>
        <p className="mt-1 text-sm text-slate-600">
          Pre-fill if you already know who will pay. They can also enter details on the payment page.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <input name="buyerName" placeholder="Buyer name" className="rounded-xl border border-slate-200 px-4 py-3" />
          <input name="buyerEmail" type="email" placeholder="Buyer email" className="rounded-xl border border-slate-200 px-4 py-3" />
          <input name="buyerPhone" placeholder="Buyer phone" className="rounded-xl border border-slate-200 px-4 py-3" />
        </div>
      </div>

      {showMilestones && (
        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="font-medium text-slate-900">Milestones</p>
          <div className="mt-4 space-y-3">
            {milestones.map((milestone, index) => (
              <div key={index} className="grid gap-3 md:grid-cols-2">
                <input
                  value={milestone.title}
                  onChange={(e) => {
                    const next = [...milestones];
                    next[index] = { ...next[index], title: e.target.value };
                    setMilestones(next);
                  }}
                  placeholder="Milestone title"
                  className="rounded-xl border border-slate-200 px-4 py-3"
                />
                <input
                  value={milestone.amount}
                  onChange={(e) => {
                    const next = [...milestones];
                    next[index] = { ...next[index], amount: e.target.value };
                    setMilestones(next);
                  }}
                  type="number"
                  placeholder="Amount in ₦"
                  className="rounded-xl border border-slate-200 px-4 py-3"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-teal-600 px-6 py-3 font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
      >
        {loading ? "Creating..." : "Create deal & get payment link"}
      </button>
    </form>
  );
}
