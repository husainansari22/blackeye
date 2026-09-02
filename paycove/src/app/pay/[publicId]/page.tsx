import { notFound } from "next/navigation";
import { AppLogo, AppShell } from "@/components/AppShell";
import { BuyerDealActions } from "@/components/BuyerDealActions";
import { BuyerPaymentForm } from "@/components/BuyerPaymentForm";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ publicId: string }> };

export default async function PayPage({ params }: Params) {
  const { publicId } = await params;

  const deal = await prisma.deal.findUnique({
    where: { publicId },
    include: {
      seller: { select: { name: true, email: true } },
      proofs: true,
      disputes: true,
    },
  });

  if (!deal || deal.status === "CANCELLED") notFound();

  const showPaymentForm = deal.status === "PENDING_PAYMENT";

  return (
    <AppShell>
      <main className="relative px-5 pt-14 pb-8">
        <div className="mb-8 flex items-center justify-center gap-2 animate-fade-up">
          <AppLogo size="sm" />
          <span className="text-sm font-semibold">PayCove</span>
          <span className="live-dot" />
        </div>

        {showPaymentForm ? (
          <BuyerPaymentForm deal={deal} />
        ) : (
          <BuyerDealActions deal={deal} />
        )}
      </main>
    </AppShell>
  );
}
