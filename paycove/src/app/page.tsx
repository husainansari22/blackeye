import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AppLogo, AppShell } from "@/components/AppShell";
import { DealTypeMarquee } from "@/components/DealTypeMarquee";
import { FlowSteps } from "@/components/FlowSteps";
import { HeroFlow } from "@/components/HeroFlow";
import { MotionFeed } from "@/components/MotionFeed";
import { getSession } from "@/lib/auth";
import { FEE_PERCENT, PLATFORM_NAME, PLATFORM_TAGLINE } from "@/lib/constants";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <AppShell>
      <main className="relative px-5 pb-36">
        {/* Header */}
        <div className="flex items-center justify-between pt-14 pb-5 animate-fade-up">
          <div className="flex items-center gap-3">
            <div className="logo-glow">
              <AppLogo />
            </div>
            <p className="text-base font-semibold tracking-tight">{PLATFORM_NAME}</p>
          </div>
          <Link href="/login" className="btn-ghost px-4 py-2.5 text-sm">
            Sign in
          </Link>
        </div>

        {/* Hero copy */}
        <section className="animate-fade-up animate-fade-up-delay-1">
          <h1 className="text-[2.15rem] font-bold leading-[1.08] tracking-tight">
            Pay safe.
            <br />
            <span className="text-gradient-animated">Pay now.</span>
          </h1>
          <p className="mt-3 max-w-[90%] text-[15px] leading-relaxed text-white/45">
            {PLATFORM_TAGLINE} One app for every escrow — shops, services, rent & more.
          </p>
        </section>

        {/* Hero visual — replaces platform fee card */}
        <section className="mt-5 animate-fade-up animate-fade-up-delay-2">
          <HeroFlow />
        </section>

        {/* Flowing transaction feed — no "live" label */}
        <section className="mt-5 animate-fade-up animate-fade-up-delay-3">
          <MotionFeed />
        </section>

        {/* Auto-scrolling deal types */}
        <section className="mt-7">
          <p className="mb-2 px-0 text-sm font-semibold text-white/80">Every deal type</p>
          <DealTypeMarquee />
        </section>

        {/* Animated how-it-works */}
        <section className="mt-7">
          <p className="mb-3 text-sm font-semibold text-white/80">How it works</p>
          <FlowSteps />
        </section>

        {/* Sticky CTA */}
        <div className="fixed bottom-0 left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2 p-5 pb-[calc(20px+env(safe-area-inset-bottom))]">
          <div className="absolute inset-0 bg-gradient-to-t from-[#060608] via-[#060608]/98 to-transparent" />
          <Link href="/register" className="btn-primary btn-shimmer relative gap-2">
            Get started free
            <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="relative mt-2 text-center text-[10px] text-white/30">
            {FEE_PERCENT}% per completed deal · No monthly fee
          </p>
        </div>
      </main>
    </AppShell>
  );
}
