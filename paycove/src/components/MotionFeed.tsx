const SELLERS = [
  { name: "iPhone sellers", tag: "Active", type: "paid" },
  { name: "Gadget sellers", tag: "Protected", type: "hold" },
  { name: "Fashion vendors", tag: "Active", type: "paid" },
  { name: "Wig sellers", tag: "Protected", type: "hold" },
  { name: "Sneaker resellers", tag: "Active", type: "done" },
  { name: "Car dealers", tag: "Protected", type: "hold" },
  { name: "Rent agents", tag: "Active", type: "paid" },
  { name: "Import sellers", tag: "Protected", type: "hold" },
  { name: "Wedding vendors", tag: "Active", type: "done" },
  { name: "Tailors & services", tag: "Protected", type: "hold" },
  { name: "Skincare vendors", tag: "Active", type: "paid" },
  { name: "Electronics shops", tag: "Protected", type: "done" },
];

const TYPE_STYLES = {
  paid: "border-[#3b9eff]/30 bg-[#3b9eff]/10",
  hold: "border-[#00e5b5]/30 bg-[#00e5b5]/10",
  done: "border-white/10 bg-white/5",
};

export function MotionFeed() {
  const items = [...SELLERS, ...SELLERS];

  return (
    <div className="motion-feed -mx-5 overflow-hidden py-1">
      <div className="motion-feed-track flex gap-3 px-5">
        {items.map((item, i) => (
          <div
            key={i}
            className={`motion-pill flex shrink-0 items-center gap-2.5 rounded-full border px-3.5 py-2 ${TYPE_STYLES[item.type as keyof typeof TYPE_STYLES]}`}
          >
            <span className="pill-dot" />
            <span className="text-[12px] font-medium text-white/80">{item.name}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#00e5b5]/80">
              {item.tag}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
