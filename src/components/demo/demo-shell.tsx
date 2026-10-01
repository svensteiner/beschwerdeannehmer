import { Link } from "@tanstack/react-router";
import {
  Activity,
  BookOpen,
  CalendarDays,
  LayoutDashboard,
  MessageCircle,
  PhoneCall,
  Siren,
} from "lucide-react";
import type { ReactNode } from "react";
import { AlmaMark } from "@/components/alma-mark";
import { SilviaAvatar } from "@/components/silvia-avatar";
import { Badge } from "@/components/ui/badge";
import { DeskLoggedInDemoBanner } from "@/components/desk/desk-logged-in-demo-banner";
import { DESK_DEMO_SHELL_ID } from "@/lib/practice/desk-home";
import { PRACTICE } from "@/lib/alma/data";
import { cn } from "@/lib/utils";

const ITEMS = [
  { to: "/demo", label: "Heute", icon: LayoutDashboard },
  { to: "/demo/anrufe", label: "Anrufe", icon: PhoneCall },
  { to: "/demo/kalender", label: "Kalender", icon: CalendarDays },
  { to: "/demo/nachrichten", label: "Protokoll", icon: MessageCircle },
  { to: "/demo/notfall", label: "Notfall", icon: Siren },
  { to: "/demo/akte", label: "Akte", icon: BookOpen },
  { to: "/demo/analyse", label: "Auswertung", icon: Activity },
] as const;

export function DemoShell({ children }: { children: ReactNode }) {
  return (
    <div id={DESK_DEMO_SHELL_ID} className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-4">
          <AlmaMark />
          <span className="hidden h-5 w-px bg-border sm:block" />
          <p className="hidden text-sm text-muted-foreground sm:block">
            {PRACTICE.name} · {PRACTICE.zip} {PRACTICE.city}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SilviaAvatar size="sm" />
          <Badge variant="ok">Demo</Badge>
        </div>
      </header>
      <DeskLoggedInDemoBanner variant="board" />
      <div className="mx-auto flex max-w-7xl">
        <aside className="hidden w-56 shrink-0 border-r border-border md:block">
          <nav className="sticky top-14 flex flex-col gap-1 p-3">
            {ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                activeOptions={{ exact: item.to === "/demo" }}
                activeProps={{ className: "bg-secondary text-foreground font-medium" }}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 flex-1 pb-20 md:pb-0">{children}</div>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card md:hidden">
        {ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground",
            )}
            activeOptions={{ exact: item.to === "/demo" }}
            activeProps={{ className: "text-primary" }}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
