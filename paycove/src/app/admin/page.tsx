import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { AppHeader, AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatNaira } from "@/lib/utils";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const [deals, users, stats] = await Promise.all([
    prisma.deal.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { seller: { select: { name: true } } },
    }),
    prisma.user.count(),
    prisma.deal.aggregate({
      _sum: { amount: true, feeAmount: true },
      _count: true,
    }),
  ]);

  return (
    <AppShell showNav user={session}>
      <AppHeader title="Admin" subtitle="Platform overview" backHref="/dashboard" />
      <main className="relative px-5 pb-8">
        <div className="grid grid-cols-2 gap-3">
          {[
            ["Users", users.toString()],
            ["Deals", stats._count.toString()],
            ["GMV", formatNaira(stats._sum.amount ?? 0)],
            ["Fees", formatNaira(stats._sum.feeAmount ?? 0)],
          ].map(([label, value]) => (
            <div key={label} className="glass rounded-[var(--app-radius)] p-4">
              <p className="text-[10px] uppercase tracking-widest text-white/30">{label}</p>
              <p className="mt-1 text-lg font-bold">{value}</p>
            </div>
          ))}
        </div>

        <section className="mt-6">
          <p className="mb-3 text-sm font-semibold">Recent deals</p>
          <div className="space-y-2">
            {deals.map((deal) => (
              <Link
                key={deal.id}
                href={`/dashboard/deals/${deal.publicId}`}
                className="flex items-center gap-3 glass rounded-[var(--app-radius)] p-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{deal.title}</p>
                  <p className="text-[11px] text-white/40">
                    {deal.seller.name} · {formatNaira(deal.amount)}
                  </p>
                </div>
                <StatusBadge status={deal.status} size="xs" />
                <ChevronRight className="h-4 w-4 text-white/20" />
              </Link>
            ))}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
