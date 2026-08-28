"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PlusCircle, Shield, User } from "lucide-react";
import { cn } from "@/lib/utils";

type AppShellProps = {
  children: React.ReactNode;
  showNav?: boolean;
  user?: { name: string; role: string } | null;
};

export function AppShell({ children, showNav = false, user }: AppShellProps) {
  const pathname = usePathname();

  const navItems = [
    { href: "/dashboard", icon: Home, label: "Home" },
    { href: "/dashboard/deals/new", icon: PlusCircle, label: "New", accent: true },
    ...(user?.role === "ADMIN"
      ? [{ href: "/admin", icon: Shield, label: "Admin" }]
      : []),
    { href: "/dashboard", icon: User, label: "You" },
  ];

  return (
    <div className="app-viewport">
      <div className="app-frame">
        <div className={cn("app-scroll relative", !showNav && "no-nav")}>
          <div className="mesh-bg" aria-hidden />
          {children}
        </div>

        {showNav && (
          <nav className="bottom-nav">
            <div className="flex h-[72px] items-center justify-around px-2">
              {navItems.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href === "/dashboard" &&
                    item.label === "Home" &&
                    pathname === "/dashboard");
                const Icon = item.icon;

                if (item.accent) {
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="flex -mt-5 flex-col items-center gap-1"
                    >
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#00e5b5] to-[#3b9eff] shadow-lg shadow-emerald-500/30">
                        <Icon className="h-6 w-6 text-[#060608]" strokeWidth={2.5} />
                      </span>
                    </Link>
                  );
                }

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={cn(
                      "flex flex-col items-center gap-1 px-4 py-2 transition-colors",
                      active ? "text-[#00e5b5]" : "text-white/40"
                    )}
                  >
                    <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                    <span className="text-[10px] font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}

export function AppHeader({
  title,
  subtitle,
  backHref,
  right,
}: {
  title?: string;
  subtitle?: string;
  backHref?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 px-5 pt-12 pb-4">
      <div className="absolute inset-0 bg-[#060608]/80 backdrop-blur-xl" />
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {backHref && (
            <Link
              href={backHref}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full glass"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
          )}
          <div className="min-w-0">
            {title && (
              <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
            )}
            {subtitle && (
              <p className="truncate text-xs text-white/45">{subtitle}</p>
            )}
          </div>
        </div>
        {right}
      </div>
    </header>
  );
}

export function AppLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-lg" };
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-2xl bg-gradient-to-br from-[#00e5b5] to-[#3b9eff] font-bold text-[#060608] shadow-lg shadow-emerald-500/20",
        sizes[size]
      )}
    >
      PC
    </div>
  );
}
