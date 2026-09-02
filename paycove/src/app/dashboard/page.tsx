import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, TrendingUp, Wallet } from "lucide-react";
import { AppHeader, AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { getSession } from "@/lib/auth";
import { DEAL_TYPES } from "@/lib/constants";
import { DEAL_COLORS, DEAL_ICON_MAP } from "@/lib/deal-icons";
import { prisma } from "@/lib/prisma";
import { formatNaira } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const deals = await prisma.deal.findMany({
    where: {
      OR: [{ sellerId: session.id }, { agentId: session.id }],
    },
    orderBy: { createdAt: "desc" },
  });

  const totalVolume = deals.reduce((sum, deal) => sum + deal.amount, 0);
  const totalEarnings = deals
    .filter((deal) => deal.status === "RELEASED")
    .reduce((sum, deal) => sum + deal.sellerAmount, 0);
  const activeDeals = deals.filter((d) =>
    ["PAID", "IN_PROGRESS", "SHIPPED", "DELIVERED"].includes(d.status)
  ).length;

  const firstName = session.name.split(" ")[0];

  return (
    <AppShell showNav user={session}>
      <AppHeader
        subtitle={`Hey, ${firstName} 👋`}
        title="Overview"
      />

      <main className="relative px-5">
        {/* Balance card */}
        <div className="animate-fade-up relative overflow-hidden rounded-[var(--app-radius-xl)] p-6">
          <div className="absolute inset-0 bg-gradient-to-br from-[#00e5b5]/20 via-[#3b9eff]/10 to-[#7c5cff]/10" />
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#00e5b5]/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-white/45">
              <Wallet className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-widest">
                Released earnings
              </span>
            </div>
            <p className="mt-2 text-[2.2rem] font-bold tracking-tight">
              {formatNaira(totalEarnings)}
            </p>
            <div className="mt-4 flex gap-4">
              <div>
                <p className="text-[11px] text-white/35">Volume</p>
                <p className="text-sm font-semibold">{formatNaira(totalVolume)}</p>
              </div>
              <div>
                <p className="text-[11px] text-white/35">Active</p>
                <p className="text-sm font-semibold">{activeDeals} deals</p>
              </div>
              <div>
                <p className="text-[11px] text-white/35">Total</p>
                <p className="text-sm font-semibold">{deals.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick action */}
        <Link
          href="/dashboard/deals/new"
          className="animate-fade-up animate-fade-up-delay-1 mt-4 flex items-center justify-between glass rounded-[var(--app-radius-lg)] p-4 transition active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#00e5b5] to-[#3b9eff]">
              <TrendingUp className="h-5 w-5 text-[#060608]" />
            </div>
            <div>
              <p className="text-sm font-semibold">Create new deal</p>
              <p className="text-[11px] text-white/40">Get a payment link instantly</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-white/25" />
        </Link>

        {/* Deals list */}
        <section className="mt-8 animate-fade-up animate-fade-up-delay-2">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Recent deals</p>
            {deals.length > 0 && (
              <span className="text-[11px] text-white/35">{deals.length} total</span>
            )}
          </div>

          {deals.length === 0 ? (
            <div className="glass flex flex-col items-center rounded-[var(--app-radius-lg)] px-6 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5">
                <Wallet className="h-6 w-6 text-white/30" />
              </div>
              <p className="mt-4 text-sm font-medium">No deals yet</p>
              <p className="mt-1 text-[12px] text-white/40">
                Create your first payment link and share on WhatsApp
              </p>
              <Link href="/dashboard/deals/new" className="btn-primary mt-6 max-w-[200px]">
                Create deal
              </Link>
            </div>
          ) : (
            <div className="space-y-2.5">
              {deals.map((deal) => {
                const typeInfo = DEAL_TYPES[deal.type as keyof typeof DEAL_TYPES];
                const Icon = DEAL_ICON_MAP[deal.type as keyof typeof DEAL_ICON_MAP];
                return (
                  <Link
                    key={deal.id}
                    href={`/dashboard/deals/${deal.publicId}`}
                    className="flex items-center gap-3 glass rounded-[var(--app-radius)] p-3.5 transition active:scale-[0.99]"
                  >
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${DEAL_COLORS[deal.type as keyof typeof DEAL_COLORS]}`}
                    >
                      <Icon className="h-5 w-5 text-white/70" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{deal.title}</p>
                      <p className="text-[11px] text-white/40">
                        {typeInfo?.label} · {formatNaira(deal.amount)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <StatusBadge status={deal.status} size="xs" />
                      <ChevronRight className="h-4 w-4 text-white/20" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
