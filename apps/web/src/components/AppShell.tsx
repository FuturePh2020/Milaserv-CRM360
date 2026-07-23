"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api-client";
import { clearSession, getSessionUser, type SessionUser } from "../lib/auth";
import { ActivityTracker } from "./ActivityTracker";

interface NavItem {
  label: string;
  href?: string;
}

const ADMIN_NAV: NavItem[] = [
  { label: "Overview", href: "/dashboard" },
  { label: "Live Shift Monitor", href: "/admin/live-shift-monitor" },
  { label: "Leads Distributor", href: "/admin/leads-distributor" },
  { label: "Cash Leads", href: "/admin/cash-leads" },
  { label: "Insurance Leads", href: "/admin/insurance-leads" },
  { label: "Leads Search", href: "/admin/leads-search" },
  { label: "Lead Reports", href: "/admin/lead-reports" },
  { label: "Converted Leads", href: "/dashboard/converted-leads" },
  { label: "Sessions & Breaks", href: "/admin/live-shift-monitor" },
  { label: "Monthly Attendance", href: "/admin/monthly-attendance" },
  { label: "Yeastar CDR Imports", href: "/admin/cdr-imports" },
  { label: "CDR Matching Reports", href: "/admin/cdr-reports" },
  { label: "Users & Shifts", href: "/admin/users-shifts" },
  { label: "Import History", href: "/admin/import-history" },
  { label: "Audit Log", href: "/admin/audit-log" },
  { label: "Settings", href: "/admin/settings" },
];

const AGENT_NAV: NavItem[] = [
  { label: "Start Session / Current Session", href: "/agent" },
  { label: "My Current Lead", href: "/agent/leads" },
  { label: "Lead Distributor", href: "/agent/leads" },
  { label: "Cash Leads", href: "/agent/leads/cash" },
  { label: "Insurance Leads", href: "/agent/leads/insurance" },
  { label: "Leads Search", href: "/agent/leads/search" },
  { label: "My Daily Results", href: "/agent" },
  { label: "My Breaks", href: "/agent/breaks" },
  { label: "My Session History", href: "/agent/history" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const sessionUser = getSessionUser();
    if (!sessionUser) {
      router.replace("/login");
      return;
    }
    setUser(sessionUser);
    setChecked(true);
  }, [router]);

  async function handleLogout() {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
    clearSession();
    router.replace("/login");
  }

  if (!checked || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app-bg text-muted-slate">Loading…</div>
    );
  }

  const navItems = user.role === "AGENT" ? AGENT_NAV : ADMIN_NAV;

  function renderNavList(onNavigate?: () => void) {
    return (
      <ul className="flex flex-col gap-0.5">
        {navItems.map((item) => {
          const isActive = item.href === pathname;
          if (!item.href) {
            return (
              <li key={item.label}>
                <span
                  className="flex cursor-not-allowed items-center justify-between rounded-full px-3 py-2 text-sm text-soft-gray/60"
                  aria-disabled="true"
                >
                  {item.label}
                  <span className="text-[10px] uppercase tracking-wide text-soft-gray/40">Soon</span>
                </span>
              </li>
            );
          }
          return (
            <li key={item.label}>
              <Link
                href={item.href}
                onClick={onNavigate}
                className={`block rounded-full px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal ${
                  isActive ? "bg-teal font-medium text-white" : "text-white/85 hover:bg-white/10"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="flex min-h-screen bg-app-bg">
      {user.role === "AGENT" && <ActivityTracker />}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-white focus:p-2 focus:text-navy"
      >
        Skip to content
      </a>

      <aside className="flex w-64 shrink-0 flex-col bg-navy text-white max-md:hidden">
        <div className="flex items-center gap-2 px-4 py-4">
          <Image src="/logo.jpg" alt="Milaserv" width={36} height={36} className="rounded-md" />
          <span className="text-sm font-semibold tracking-wide">MILASERV CRM360</span>
        </div>
        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-2 py-2">
          {renderNavList()}
        </nav>
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-navy text-white shadow-lg">
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-2">
                <Image src="/logo.jpg" alt="Milaserv" width={32} height={32} className="rounded-md" />
                <span className="text-sm font-semibold tracking-wide">MILASERV CRM360</span>
              </div>
              <button
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation"
                className="rounded-md p-1 text-white/80 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
              >
                ✕
              </button>
            </div>
            <nav aria-label="Main navigation (mobile)" className="flex-1 overflow-y-auto px-2 py-2">
              {renderNavList(() => setMobileNavOpen(false))}
            </nav>
          </aside>
        </div>
      )}

      <div className="flex min-h-screen flex-1 flex-col">
        {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && (
          <div className="bg-amber px-4 py-1.5 text-center text-xs font-semibold text-white">
            DEMO ENVIRONMENT — test data only. Do not enter real customer, medical, or payment information.
          </div>
        )}
        <header className="flex items-center justify-between border-b border-border bg-white px-4 py-3 md:px-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              className="rounded-md p-1.5 text-navy hover:bg-app-bg focus-visible:ring-2 focus-visible:ring-teal md:hidden"
            >
              ☰
            </button>
            <Image src="/logo.jpg" alt="Milaserv" width={28} height={28} className="rounded-md md:hidden" />
            <span className="text-sm font-semibold text-navy md:hidden">MILASERV CRM360</span>
            <div className="hidden text-sm text-muted-slate md:block">
              {user.role === "AGENT" ? "Agent Dashboard" : "Admin Dashboard"}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-app-text sm:inline">{user.fullName}</span>
            <span className="rounded-full bg-app-bg px-2 py-0.5 text-xs font-medium text-muted-slate">
              {user.role.replace("_", " ")}
            </span>
            <button
              onClick={handleLogout}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-app-text hover:bg-app-bg focus-visible:ring-2 focus-visible:ring-teal"
            >
              Sign out
            </button>
          </div>
        </header>
        <main id="main-content" className="flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
