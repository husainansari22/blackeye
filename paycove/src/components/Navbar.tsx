import Link from "next/link";
import { PLATFORM_NAME } from "@/lib/constants";

export function Navbar({
  user,
}: {
  user?: { name: string; role: string } | null;
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-sm font-bold text-white">
            PC
          </span>
          <div>
            <p className="text-lg font-semibold text-slate-900">{PLATFORM_NAME}</p>
            <p className="text-xs text-teal-700">paycovenow.com</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
          <Link href="/#how-it-works" className="hover:text-teal-700">
            How it works
          </Link>
          <Link href="/#deal-types" className="hover:text-teal-700">
            Deal types
          </Link>
          <Link href="/#pricing" className="hover:text-teal-700">
            Pricing
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              {user.role === "ADMIN" && (
                <Link
                  href="/admin"
                  className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:inline-flex"
                >
                  Admin
                </Link>
              )}
              <Link
                href="/dashboard"
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                Start free
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
