import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Search, PenLine, MapPin, Settings } from "lucide-react";

type NavItem = {
  label: string;
  icon: typeof Home;
  to: string;
};

const ITEMS: NavItem[] = [
  { label: "Home", icon: Home, to: "/" },
  { label: "Find service", icon: Search, to: "/?focus=search" },
  { label: "Feedback", icon: PenLine, to: "/?action=leave-review" },
  { label: "Local business", icon: MapPin, to: "/?focus=business" },
  { label: "Settings", icon: Settings, to: "/?focus=settings" },
];

export function MobileFooterNav() {
  const { location } = useRouterState();
  const screenshotMode = Boolean(
    location.search && (location.search as Record<string, unknown>)["screenshot"],
  );
  return (
    <nav
      aria-label="Primary"
      className={`${screenshotMode ? "absolute" : "fixed"} inset-x-0 bottom-0 z-40 border-t border-border bg-review-surface/95 backdrop-blur-xl lg:hidden`}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-5xl grid-cols-5">
        {ITEMS.map(({ label, icon: Icon, to }) => {
          const active = location.pathname === to.split("?")[0] && to === "/";
          return (
            <li key={label}>
              <Link
                to={to}
                className="flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.62rem] font-medium transition-colors"
                style={{ color: active ? "var(--color-primary)" : "var(--color-muted-foreground)" }}
              >
                <Icon size={22} strokeWidth={active ? 2.4 : 2} />
                <span className="truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
