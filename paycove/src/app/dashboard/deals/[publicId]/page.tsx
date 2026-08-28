import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DealActions, DealSummary } from "@/components/DealDetail";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
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
    include: {
      proofs: true,
      disputes: true,
    },
  });

  if (!deal) notFound();

  return (
    <>
      <Navbar user={session} />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <Link href="/dashboard" className="text-sm text-teal-700 hover:underline">
          ← Back to dashboard
        </Link>
        <div className="mt-6 grid gap-6">
          <DealSummary deal={deal} />
          <DealActions deal={deal} />
        </div>
      </main>
      <Footer />
    </>
  );
}
