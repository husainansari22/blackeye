const ACTIVITY = [
  "Ada paid ₦85,000 for iPhone 15",
  "Lagos Fashion Hub — deal secured",
  "Rent deposit held — Surulere",
  "Wedding vendor paid in milestones",
  "Import shipment released — ₦420k",
  "Car escrow completed — Abuja",
  "IG wig order confirmed ✓",
  "Service payment released — tailor",
];

export function LiveTicker() {
  const items = [...ACTIVITY, ...ACTIVITY];

  return (
    <div className="glass overflow-hidden rounded-[var(--app-radius)] py-3">
      <div className="mb-2 flex items-center gap-2 px-4">
        <span className="live-dot" />
        <span className="text-[11px] font-medium uppercase tracking-widest text-white/35">
          Live activity
        </span>
      </div>
      <div className="overflow-hidden">
        <div className="ticker-track px-4">
          {items.map((item, i) => (
            <span
              key={i}
              className="whitespace-nowrap text-[13px] text-white/55"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
