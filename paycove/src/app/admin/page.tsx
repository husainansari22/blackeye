import Link from "next/link";
import { redirect } from "next/navigation";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { StatusBadge } from "@/components/StatusBadge";
import { getSession } from "@/lib/auth";
import { DEAL_TYPES } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { formatNaira } from "@/lib/utils";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const [deals, users, stats] = await Promise.all([
    prisma.deal.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { seller: { select: { name: true, email: true } }, disputes: true },
    }),
    prisma.user.count(),
    prisma.deal.aggregate({
      _sum: { amount: true, feeAmount: true },
      _count: true,
    }),
  ]);

  return (
    <>
      <Navbar user={session} />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold text-slate-900">Admin</h1>
        <p className="mt-2 text-slate-600">Platform overview for PayCove</p>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-600">Users</p>
            <p className="mt-2 text-3xl font-bold">{users}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-600">Total deals</p>
            <p className="mt-2 text-3xl font-bold">{stats._count}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-600">GMV</p>
            <p className="mt-2 text-3xl font-bold">{formatNaira(stats._sum.amount ?? 0)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-600">Fees earned</p>
            <p className="mt-2 text-3xl font-bold">{formatNaira(stats._sum.feeAmount ?? 0)}</p>
          </div>
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold">Recent deals</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {deals.map((deal) => (
              <div key={deal.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-medium text-slate-900">{deal.title}</p>
                  <p className="text-sm text-slate-600">
                    {deal.seller.name} · {DEAL_TYPES[deal.type as keyof typeof DEAL_TYPES]?.label} ·{" "}
                    {formatNaira(deal.amount)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={deal.status} />
                  <Link href={`/dashboard/deals/${deal.publicId}`} className="text-sm text-teal-700">
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
