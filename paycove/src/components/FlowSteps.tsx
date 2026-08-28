"use client";

import { useEffect, useRef, useState } from "react";

const STEPS = [
  { title: "Create deal", sub: "Payment link in seconds" },
  { title: "Buyer pays", sub: "Held via Paystack" },
  { title: "Confirm & release", sub: "Everyone wins" },
];

export function FlowSteps() {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % STEPS.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div ref={ref} className="flow-steps glass-strong relative overflow-hidden rounded-[24px] p-1">
      <div
        className="flow-steps-highlight absolute left-1 right-1 rounded-[20px] bg-gradient-to-r from-[#00e5b5]/10 to-[#3b9eff]/10 transition-all duration-700 ease-out"
        style={{
          top: `${4 + active * 56}px`,
          height: "52px",
        }}
      />

      {STEPS.map((step, i) => (
        <div
          key={step.title}
          className={`relative flex items-center gap-4 rounded-[20px] px-4 py-3.5 transition-opacity duration-500 ${
            active === i ? "opacity-100" : "opacity-40"
          }`}
        >
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-500 ${
              active === i
                ? "bg-gradient-to-br from-[#00e5b5] to-[#3b9eff] text-[#060608] scale-110"
                : "bg-white/8 text-white/40"
            }`}
          >
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{step.title}</p>
            <p className="text-[11px] text-white/40">{step.sub}</p>
          </div>
          {active === i && <span className="step-pulse h-2 w-2 rounded-full bg-[#00e5b5]" />}
        </div>
      ))}
    </div>
  );
}
