import { notFound, redirect } from "next/navigation";
import { AppHeader, AppShell } from "@/components/AppShell";
import { DealActions, DealSummary } from "@/components/DealDetail";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ publicId: string }> };

export default async function DealDetailPage({ params }: Params) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { publicId } = await params;
  const deal = await prisma.deal.findFirst({
    where: {
      publicId,
      OR: [{ sellerId: session.id }, { agentId: session.id }],
    },
    include: { proofs: true, disputes: true },
  });

  if (!deal) notFound();

  return (
    <AppShell showNav user={session}>
      <AppHeader title="Deal" backHref="/dashboard" />
      <main className="relative space-y-4 px-5 pb-8">
        <DealSummary deal={deal} />
        <DealActions deal={deal} />
      </main>
    </AppShell>
  );
}
