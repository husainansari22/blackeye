"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DEAL_TYPES, DealTypeId, FEE_PERCENT } from "@/lib/constants";
import { DEAL_COLORS, DEAL_ICON_MAP } from "@/lib/deal-icons";

type Milestone = { title: string; amount: string };

export function CreateDealForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [type, setType] = useState<DealTypeId>("GOODS");
  const [milestones, setMilestones] = useState<Milestone[]>([
    { title: "Deposit", amount: "" },
    { title: "Final payment", amount: "" },
  ]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const showMilestones = ["SERVICE", "EVENT"].includes(type);
  const dealTypes = Object.values(DEAL_TYPES);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 2) {
      setStep(step + 1);
      return;
    }

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
    <form onSubmit={handleSubmit} className="flex flex-col">
      {/* Step indicator */}
      <div className="mb-6 flex gap-2">
        {[0, 1, 2].map((s) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full transition-all ${
              s <= step ? "bg-gradient-to-r from-[#00e5b5] to-[#3b9eff]" : "bg-white/10"
            }`}
          />
        ))}
      </div>

      {step === 0 && (
        <div className="animate-fade-up">
          <p className="text-sm font-semibold">What type of deal?</p>
          <p className="mt-1 text-[12px] text-white/40">Swipe to browse all types</p>
          <div className="scroll-strip mt-4 -mx-1">
            {dealTypes.map((dealType) => {
              const Icon = DEAL_ICON_MAP[dealType.id];
              const selected = type === dealType.id;
              return (
                <button
                  key={dealType.id}
                  type="button"
                  onClick={() => setType(dealType.id)}
                  className={`w-[130px] rounded-[var(--app-radius)] p-4 text-left transition ${
                    selected
                      ? "glass-strong ring-1 ring-[#00e5b5]/40"
                      : "glass opacity-70"
                  } bg-gradient-to-br ${DEAL_COLORS[dealType.id]}`}
                >
                  <Icon className={`h-5 w-5 ${selected ? "text-[#00e5b5]" : "text-white/50"}`} />
                  <p className="mt-3 text-[13px] font-semibold leading-tight">{dealType.label}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="animate-fade-up space-y-3">
          <p className="text-sm font-semibold">Deal details</p>
          <input
            name="title"
            required
            placeholder="e.g. iPhone 15 Pro Max — 256GB"
            className="app-input"
          />
          <textarea
            name="description"
            rows={2}
            placeholder="Delivery terms, warranty, etc. (optional)"
            className="app-input resize-none"
          />
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/35">₦</span>
            <input
              name="amount"
              type="number"
              min="1000"
              required
              placeholder="Amount"
              className="app-input pl-9 text-lg font-semibold"
            />
          </div>
          <div className="glass rounded-[var(--app-radius)] px-4 py-3 text-[12px] text-white/45">
            PayCove takes <span className="font-semibold text-[#00e5b5]">{FEE_PERCENT}%</span> when
            funds are released to you
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="animate-fade-up space-y-3">
          <p className="text-sm font-semibold">Buyer info <span className="text-white/30">(optional)</span></p>
          <input name="buyerName" placeholder="Buyer name" className="app-input" />
          <input name="buyerEmail" type="email" placeholder="Buyer email" className="app-input" />
          <input name="buyerPhone" placeholder="Buyer phone" className="app-input" />

          {showMilestones && (
            <div className="glass rounded-[var(--app-radius-lg)] p-4 space-y-3">
              <p className="text-[13px] font-medium">Payment milestones</p>
              {milestones.map((milestone, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    value={milestone.title}
                    onChange={(e) => {
                      const next = [...milestones];
                      next[index] = { ...next[index], title: e.target.value };
                      setMilestones(next);
                    }}
                    placeholder="Title"
                    className="app-input flex-1"
                  />
                  <input
                    value={milestone.amount}
                    onChange={(e) => {
                      const next = [...milestones];
                      next[index] = { ...next[index], amount: e.target.value };
                      setMilestones(next);
                    }}
                    type="number"
                    placeholder="₦"
                    className="app-input w-28"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
      )}

      <div className="mt-8 flex gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="btn-ghost flex-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
        )}
        <button type="submit" disabled={loading} className="btn-primary flex-[2]">
          {loading ? "Creating..." : step < 2 ? "Continue" : "Create & get link"}
          {!loading && step < 2 && <ChevronRight className="h-4 w-4" />}
        </button>
      </div>
    </form>
  );
}
