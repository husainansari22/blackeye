import Link from "next/link";
import { ArrowRight, Shield, Zap } from "lucide-react";
import { AppLogo, AppShell } from "@/components/AppShell";
import { LiveTicker } from "@/components/LiveTicker";
import { getSession } from "@/lib/auth";
import { DEAL_TYPES, FEE_PERCENT, PLATFORM_NAME, PLATFORM_TAGLINE } from "@/lib/constants";
import { DEAL_COLORS, DEAL_ICON_MAP } from "@/lib/deal-icons";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  const dealTypes = Object.values(DEAL_TYPES);

  return (
    <AppShell>
      <main className="relative px-5 pb-8">
        {/* Top bar */}
        <div className="flex items-center justify-between pt-14 pb-6 animate-fade-up">
          <div className="flex items-center gap-3">
            <AppLogo />
            <div>
              <p className="text-base font-semibold tracking-tight">{PLATFORM_NAME}</p>
              <div className="flex items-center gap-1.5">
                <span className="live-dot" />
                <p className="text-[11px] text-white/45">Live · Nigeria</p>
              </div>
            </div>
          </div>
          <Link href="/login" className="btn-ghost px-4 py-2.5 text-sm">
            Sign in
          </Link>
        </div>

        {/* Hero */}
        <section className="animate-fade-up animate-fade-up-delay-1">
          <h1 className="text-[2rem] font-bold leading-[1.1] tracking-tight">
            Pay safe.
            <br />
            <span className="text-gradient">Pay now.</span>
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-white/50">
            {PLATFORM_TAGLINE} Escrow for every deal — shops, services, rent, cars & more.
          </p>
        </section>

        {/* Stats bento */}
        <section className="mt-6 grid grid-cols-2 gap-3 animate-fade-up animate-fade-up-delay-2">
          <div className="glass col-span-2 rounded-[var(--app-radius-lg)] p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-white/35">
                  Platform fee
                </p>
                <p className="mt-1 text-4xl font-bold tracking-tight text-gradient">
                  {FEE_PERCENT}%
                </p>
                <p className="mt-1 text-xs text-white/40">Only when deal completes</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15">
                <Zap className="h-5 w-5 text-emerald-400" />
              </div>
            </div>
          </div>

          <div className="glass rounded-[var(--app-radius)] p-4">
            <Shield className="h-5 w-5 text-[#00e5b5]" />
            <p className="mt-3 text-2xl font-bold">8</p>
            <p className="text-[11px] text-white/40">Deal types</p>
          </div>
          <div className="glass rounded-[var(--app-radius)] p-4">
            <p className="text-2xl font-bold">₦</p>
            <p className="mt-1 text-[11px] leading-snug text-white/40">
              WhatsApp & IG ready
            </p>
          </div>
        </section>

        {/* Live ticker */}
        <section className="mt-6 animate-fade-up animate-fade-up-delay-3">
          <LiveTicker />
        </section>

        {/* Deal types — horizontal scroll */}
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">All escrow types</p>
            <p className="text-[11px] text-white/35">Swipe →</p>
          </div>
          <div className="scroll-strip -mx-5 px-5">
            {dealTypes.map((type) => {
              const Icon = DEAL_ICON_MAP[type.id];
              return (
                <div
                  key={type.id}
                  className={`glass w-[140px] rounded-[var(--app-radius)] bg-gradient-to-br p-4 ${DEAL_COLORS[type.id]}`}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
                    <Icon className="h-4 w-4 text-white/80" />
                  </div>
                  <p className="mt-3 text-[13px] font-semibold leading-tight">{type.label}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* How it works — compact steps */}
        <section className="mt-8">
          <p className="mb-3 text-sm font-semibold">How it works</p>
          <div className="glass-strong rounded-[var(--app-radius-lg)] p-1">
            {[
              ["Create deal", "Get a payment link in seconds"],
              ["Buyer pays", "Funds held safely via Paystack"],
              ["Deliver & confirm", "Release when everyone's happy"],
            ].map(([title, sub], i) => (
              <div
                key={title}
                className="flex items-center gap-4 rounded-[18px] px-4 py-3.5"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#00e5b5]/20 to-[#3b9eff]/20 text-xs font-bold text-[#00e5b5]">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-[11px] text-white/40">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Sticky CTA */}
        <div className="fixed bottom-0 left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2 p-5 pb-[calc(20px+env(safe-area-inset-bottom))]">
          <div className="absolute inset-0 bg-gradient-to-t from-[#060608] via-[#060608]/95 to-transparent" />
          <Link href="/register" className="btn-primary relative gap-2">
            Get started free
            <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="relative mt-2 text-center text-[10px] text-white/30">
            No monthly fee · Sellers bring their own buyers
          </p>
        </div>
      </main>
    </AppShell>
  );
}
