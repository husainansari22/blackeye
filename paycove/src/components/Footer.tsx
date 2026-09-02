import { PLATFORM_NAME } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-950 text-slate-300">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div>
          <p className="text-lg font-semibold text-white">{PLATFORM_NAME}</p>
          <p className="mt-2 text-sm text-slate-400">
            Nigeria&apos;s all-in-one escrow platform for WhatsApp, Instagram,
            services, rent, cars, events, and more.
          </p>
        </div>
        <div>
          <p className="font-medium text-white">Deal types</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            <li>Shop & IG goods</li>
            <li>Services & milestones</li>
            <li>Rent & high-ticket</li>
            <li>Events, import & B2B</li>
          </ul>
        </div>
        <div>
          <p className="font-medium text-white">Contact</p>
          <p className="mt-3 text-sm text-slate-400">paycovenow.com</p>
          <p className="mt-1 text-sm text-slate-400">Built for Nigeria 🇳🇬</p>
        </div>
      </div>
      <div className="border-t border-slate-800 py-4 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} {PLATFORM_NAME}. Trust every deal.
      </div>
    </footer>
  );
}
