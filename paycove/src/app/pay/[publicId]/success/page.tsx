import Link from "next/link";
import { PaymentSuccessVerifier } from "@/components/BuyerDealActions";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { PLATFORM_NAME } from "@/lib/constants";

type Params = {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ reference?: string }>;
};

export default async function PaymentSuccessPage({ params, searchParams }: Params) {
  const { publicId } = await params;
  const { reference } = await searchParams;

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-lg px-4 py-20 sm:px-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-4xl">✅</p>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Processing payment</h1>
          <p className="mt-2 text-slate-600">{PLATFORM_NAME} is securing your transaction.</p>
          {reference ? (
            <div className="mt-6">
              <PaymentSuccessVerifier publicId={publicId} reference={reference} />
            </div>
          ) : (
            <Link href={`/pay/${publicId}`} className="mt-6 inline-block text-teal-700 hover:underline">
              Back to deal
            </Link>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
