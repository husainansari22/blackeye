import { DEAL_STATUSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  PENDING_PAYMENT: "bg-amber-100 text-amber-800",
  PAID: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-indigo-100 text-indigo-800",
  SHIPPED: "bg-purple-100 text-purple-800",
  DELIVERED: "bg-cyan-100 text-cyan-800",
  RELEASED: "bg-emerald-100 text-emerald-800",
  DISPUTED: "bg-red-100 text-red-800",
  REFUNDED: "bg-slate-100 text-slate-800",
  CANCELLED: "bg-slate-100 text-slate-600",
};

export function StatusBadge({ status }: { status: string }) {
  const label =
    DEAL_STATUSES[status as keyof typeof DEAL_STATUSES] ?? status.replaceAll("_", " ");

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
        STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700"
      )}
    >
      {label}
    </span>
  );
}
