import { notFound } from "next/navigation";
import { BuyerPaymentForm } from "@/components/BuyerPaymentForm";
import { BuyerDealActions } from "@/components/BuyerDealActions";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { StatusBadge } from "@/components/StatusBadge";
import { PLATFORM_NAME } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ publicId: string }>;
};

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
    <>
      <Navbar />
      <main className="mx-auto max-w-lg px-4 py-10 sm:px-6">
        <p className="mb-4 text-center text-sm text-slate-600">
          Protected by {PLATFORM_NAME}
        </p>

        {showPaymentForm ? (
          <BuyerPaymentForm deal={deal} />
        ) : (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h1 className="text-2xl font-bold text-slate-900">{deal.title}</h1>
                <StatusBadge status={deal.status} />
              </div>
              <p className="mt-2 text-sm text-slate-600">Seller: {deal.seller.name}</p>
            </div>
            <BuyerDealActions deal={deal} />
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
