import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { getSession } from "@/lib/auth";
import { DEAL_TYPES, FEE_PERCENT, PLATFORM_NAME, PLATFORM_TAGLINE } from "@/lib/constants";

export default async function HomePage() {
  const session = await getSession();

  return (
    <>
      <Navbar user={session} />
      <main>
        <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 text-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-28">
            <div>
              <p className="inline-flex rounded-full bg-teal-500/20 px-3 py-1 text-sm font-medium text-teal-200">
                Built for Nigeria 🇳🇬
              </p>
              <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                {PLATFORM_NAME}
              </h1>
              <p className="mt-4 text-2xl font-medium text-teal-200">{PLATFORM_TAGLINE}</p>
              <p className="mt-6 max-w-xl text-lg text-slate-300">
                One platform to protect every deal — WhatsApp & IG shops, services,
                rent, cars, weddings, imports, and B2B supply. Money held until
                everyone is satisfied.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/register"
                  className="rounded-xl bg-teal-500 px-6 py-3 font-semibold text-white hover:bg-teal-400"
                >
                  Start free
                </Link>
                <Link
                  href="/login"
                  className="rounded-xl border border-white/20 px-6 py-3 font-semibold text-white hover:bg-white/10"
                >
                  Log in
                </Link>
              </div>
              <p className="mt-6 text-sm text-slate-400">
                Only {FEE_PERCENT}% per deal · Sellers bring their own buyers · No monthly fee
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <p className="text-sm font-medium text-teal-200">All deal types in one place</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {Object.values(DEAL_TYPES).map((type) => (
                  <div key={type.id} className="rounded-2xl bg-white/10 p-4">
                    <p className="text-2xl">{type.icon}</p>
                    <p className="mt-2 font-semibold">{type.label}</p>
                    <p className="mt-1 text-sm text-slate-300">{type.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="text-center text-3xl font-bold text-slate-900">How PayCove works</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-4">
            {[
              ["1", "Create deal", "Pick deal type, enter amount, get a payment link."],
              ["2", "Buyer pays", "Customer pays via Paystack. Funds held in escrow."],
              ["3", "Deliver & prove", "Seller ships or completes service with proof."],
              ["4", "Release funds", "Buyer confirms. Seller gets paid minus 4% fee."],
            ].map(([step, title, copy]) => (
              <div key={step} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 font-bold text-teal-700">
                  {step}
                </p>
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-slate-600">{copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="deal-types" className="bg-white py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold text-slate-900">
              Every escrow type. One website.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-slate-600">
              Whether you sell wigs on Instagram, collect rent, import from China,
              or plan weddings — PayCove handles the money safely.
            </p>
            <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {Object.values(DEAL_TYPES).map((type) => (
                <div key={type.id} className="rounded-2xl border border-slate-200 p-5">
                  <p className="text-3xl">{type.icon}</p>
                  <h3 className="mt-3 font-semibold text-slate-900">{type.label}</h3>
                  <p className="mt-2 text-sm text-slate-600">{type.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="rounded-3xl bg-teal-600 p-10 text-center text-white">
            <h2 className="text-3xl font-bold">Simple pricing</h2>
            <p className="mt-4 text-5xl font-bold">{FEE_PERCENT}%</p>
            <p className="mt-2 text-lg text-teal-100">per completed deal. No setup fee. No monthly subscription.</p>
            <Link
              href="/register"
              className="mt-8 inline-flex rounded-xl bg-white px-6 py-3 font-semibold text-teal-700 hover:bg-teal-50"
            >
              Create your first deal
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
