import { DEAL_STATUSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, { bg: string; text: string; dot?: boolean }> = {
  PENDING_PAYMENT: { bg: "bg-amber-500/15", text: "text-amber-300", dot: true },
  PAID: { bg: "bg-blue-500/15", text: "text-blue-300", dot: true },
  IN_PROGRESS: { bg: "bg-indigo-500/15", text: "text-indigo-300" },
  SHIPPED: { bg: "bg-purple-500/15", text: "text-purple-300" },
  DELIVERED: { bg: "bg-cyan-500/15", text: "text-cyan-300" },
  RELEASED: { bg: "bg-emerald-500/15", text: "text-emerald-300" },
  DISPUTED: { bg: "bg-red-500/15", text: "text-red-300", dot: true },
  REFUNDED: { bg: "bg-white/8", text: "text-white/50" },
  CANCELLED: { bg: "bg-white/6", text: "text-white/35" },
};

export function StatusBadge({ status, size = "sm" }: { status: string; size?: "sm" | "xs" }) {
  const label =
    DEAL_STATUSES[status as keyof typeof DEAL_STATUSES] ?? status.replaceAll("_", " ");
  const style = STATUS_STYLES[status] ?? { bg: "bg-white/8", text: "text-white/50" };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium capitalize",
        style.bg,
        style.text,
        size === "xs" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
      )}
    >
      {style.dot && <span className="live-dot scale-75" />}
      {label}
    </span>
  );
}
