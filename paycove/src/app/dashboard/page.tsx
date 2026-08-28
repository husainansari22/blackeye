import Link from "next/link";
import { redirect } from "next/navigation";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { StatusBadge } from "@/components/StatusBadge";
import { getSession } from "@/lib/auth";
import { DEAL_TYPES } from "@/lib/constants";
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

  return (
    <>
      <Navbar user={session} />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
            <p className="mt-2 text-slate-600">Welcome back, {session.name}</p>
          </div>
          <Link
            href="/dashboard/deals/new"
            className="rounded-xl bg-teal-600 px-5 py-3 font-semibold text-white hover:bg-teal-700"
          >
            + New deal
          </Link>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-600">Total deals</p>
            <p className="mt-2 text-3xl font-bold">{deals.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-600">Total volume</p>
            <p className="mt-2 text-3xl font-bold">{formatNaira(totalVolume)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-600">Released earnings</p>
            <p className="mt-2 text-3xl font-bold">{formatNaira(totalEarnings)}</p>
          </div>
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold">Your deals</h2>
          </div>
          {deals.length === 0 ? (
            <div className="px-5 py-12 text-center text-slate-600">
              No deals yet. Create your first payment link.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {deals.map((deal) => (
                <Link
                  key={deal.id}
                  href={`/dashboard/deals/${deal.publicId}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium text-slate-900">{deal.title}</p>
                    <p className="text-sm text-slate-600">
                      {DEAL_TYPES[deal.type as keyof typeof DEAL_TYPES]?.label ?? deal.type} ·{" "}
                      {formatNaira(deal.amount)}
                    </p>
                  </div>
                  <StatusBadge status={deal.status} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
