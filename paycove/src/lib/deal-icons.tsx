import {
  Car,
  Home,
  Package,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { DealTypeId } from "./constants";

export const DEAL_ICON_MAP: Record<DealTypeId, LucideIcon> = {
  GOODS: ShoppingBag,
  VERIFY: ShieldCheck,
  SERVICE: Wrench,
  HIGH_TICKET: Car,
  RENT: Home,
  EVENT: Sparkles,
  IMPORT: Package,
  B2B: Store,
};

export const DEAL_COLORS: Record<DealTypeId, string> = {
  GOODS: "from-violet-500/30 to-purple-600/20",
  VERIFY: "from-emerald-500/30 to-teal-600/20",
  SERVICE: "from-orange-500/30 to-amber-600/20",
  HIGH_TICKET: "from-blue-500/30 to-indigo-600/20",
  RENT: "from-cyan-500/30 to-sky-600/20",
  EVENT: "from-pink-500/30 to-rose-600/20",
  IMPORT: "from-yellow-500/30 to-orange-600/20",
  B2B: "from-slate-400/30 to-zinc-600/20",
};
