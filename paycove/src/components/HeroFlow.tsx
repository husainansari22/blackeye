"use client";

import { useEffect, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";

const FLOW_STEPS = [
  { label: "Buyer pays", amount: "₦85,000", color: "from-[#3b9eff]/40 to-[#3b9eff]/10" },
  { label: "Held safe", amount: "Escrow", color: "from-[#00e5b5]/40 to-[#00e5b5]/10" },
  { label: "Released", amount: "₦81,600", color: "from-[#00e5b5]/30 to-[#3b9eff]/10" },
];

export function HeroFlow() {
  const [active, setActive] = useState(0);
  const [counter, setCounter] = useState(1840000);

  useEffect(() => {
    const stepTimer = setInterval(() => {
      setActive((prev) => (prev + 1) % 3);
    }, 2800);
    return () => clearInterval(stepTimer);
  }, []);

  useEffect(() => {
    const counterTimer = setInterval(() => {
      setCounter((prev) => prev + Math.floor(Math.random() * 8000) + 2000);
    }, 3200);
    return () => clearInterval(counterTimer);
  }, []);

  return (
    <div className="hero-flow relative overflow-hidden rounded-[28px] p-5">
      {/* Animated border glow */}
      <div className="hero-flow-glow" aria-hidden />

      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#00e5b5]/70">
              Money in motion
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tracking-tight text-white">
              ₦{(counter / 1000000).toFixed(1)}M+
            </p>
            <p className="text-[11px] text-white/40">protected on PayCove</p>
          </div>

          <div className="shield-orbit relative flex h-16 w-16 items-center justify-center">
            <span className="orbit-ring orbit-ring-1" />
            <span className="orbit-ring orbit-ring-2" />
            <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#00e5b5] to-[#3b9eff] shadow-lg shadow-emerald-500/30">
              <ShieldCheck className="h-6 w-6 text-[#060608]" strokeWidth={2.5} />
            </div>
          </div>
        </div>

        {/* Flow pipeline */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          {FLOW_STEPS.map((step, i) => (
            <div
              key={step.label}
              className={`flow-node rounded-2xl bg-gradient-to-br px-2 py-3 text-center transition-all duration-700 ${step.color} ${
                active === i ? "flow-node-active scale-105 opacity-100" : "scale-95 opacity-45"
              }`}
            >
              <p className="text-[9px] uppercase tracking-wider text-white/50">{step.label}</p>
              <p className="mt-0.5 text-[12px] font-bold">{step.amount}</p>
            </div>
          ))}
        </div>

        {/* Animated connector line */}
        <div className="relative mt-1 h-1 overflow-hidden rounded-full bg-white/5">
          <div
            className="flow-progress absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#00e5b5] to-[#3b9eff]"
            style={{ width: `${((active + 1) / 3) * 100}%` }}
          />
          <div className="flow-shimmer absolute inset-0" aria-hidden />
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white/[0.04] px-3 py-2.5">
          <Lock className="h-3.5 w-3.5 shrink-0 text-[#3b9eff]" />
          <p className="text-[11px] leading-snug text-white/45">
            Funds move only when both sides agree — no stories, no scams
          </p>
        </div>
      </div>

      {/* Floating particles */}
      <span className="particle particle-1" aria-hidden />
      <span className="particle particle-2" aria-hidden />
      <span className="particle particle-3" aria-hidden />
    </div>
  );
}
