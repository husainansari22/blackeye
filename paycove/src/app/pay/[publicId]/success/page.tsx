import { AppLogo, AppShell } from "@/components/AppShell";
import { PaymentSuccessVerifier } from "@/components/BuyerDealActions";

type Params = {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ reference?: string }>;
};

export default async function PaymentSuccessPage({ params, searchParams }: Params) {
  const { publicId } = await params;
  const { reference } = await searchParams;

  return (
    <AppShell>
      <main className="relative flex min-h-[100dvh] flex-col items-center justify-center px-5">
        <AppLogo size="lg" />
        <h1 className="mt-6 text-xl font-bold">Processing payment</h1>
        <p className="mt-2 text-sm text-white/40">PayCove is securing your transaction</p>
        {reference && (
          <div className="mt-8">
            <PaymentSuccessVerifier publicId={publicId} reference={reference} />
          </div>
        )}
      </main>
    </AppShell>
  );
}
