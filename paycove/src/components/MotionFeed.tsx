const FEED = [
  { text: "Ada · iPhone 15", amount: "₦85,000", type: "paid" },
  { text: "Lagos Fashion Hub", amount: "Secured", type: "hold" },
  { text: "Surulere rent", amount: "₦500k", type: "hold" },
  { text: "Wedding caterer", amount: "Released", type: "done" },
  { text: "Import batch", amount: "₦420k", type: "done" },
  { text: "Abuja car deal", amount: "₦2.1M", type: "paid" },
  { text: "IG wig order", amount: "Confirmed", type: "done" },
  { text: "Tailor — Milestone", amount: "₦45k", type: "hold" },
];

const TYPE_STYLES = {
  paid: "border-[#3b9eff]/30 bg-[#3b9eff]/10",
  hold: "border-[#00e5b5]/30 bg-[#00e5b5]/10",
  done: "border-white/10 bg-white/5",
};

export function MotionFeed() {
  const items = [...FEED, ...FEED];

  return (
    <div className="motion-feed -mx-5 overflow-hidden py-1">
      <div className="motion-feed-track flex gap-3 px-5">
        {items.map((item, i) => (
          <div
            key={i}
            className={`motion-pill flex shrink-0 items-center gap-2.5 rounded-full border px-3.5 py-2 ${TYPE_STYLES[item.type as keyof typeof TYPE_STYLES]}`}
          >
            <span className="pill-dot" />
            <span className="text-[12px] font-medium text-white/70">{item.text}</span>
            <span className="text-[11px] font-semibold text-[#00e5b5]">{item.amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
