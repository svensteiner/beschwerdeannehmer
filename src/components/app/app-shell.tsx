import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  PhoneCall,
  PhoneIncoming,
  Settings,
  GraduationCap,
  Siren,
  BarChart3,
  Ellipsis,
} from "lucide-react";
import { AlmaMark } from "@/components/alma-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { signOutPractice, type SessionView } from "@/lib/practice/auth";
import {
  DESK_NAV_ITEMS,
  deskChrome,
  deskHashId,
  deskMobilePhoneLabel,
  deskMobilePhoneShort,
  deskMobileTabs,
  deskMobileMoreItems,
  deskMobileMoreLinkId,
} from "@/lib/practice/desk-chrome";
import { refreshTafelAnzeige } from "@/lib/practice/board";
import { anzeigeCopiedAt, markAnzeigeCopied } from "@/lib/practice/use-anzeige-refresh";
import { isInhaberin } from "@/lib/practice/staff-role";
import { readSetupSkipped, setupBannerVisible, writeSetupSkipped } from "@/lib/practice/setup-wizard";
import {
  deskBrowserStorage,
  forgetDeskSession,
  rememberDeskSession,
} from "@/lib/practice/desk-session";
import {
  DESK_ANZEIGE_ID,
  TAFEL_ANZEIGE_BANNER,
  TAFEL_ANZEIGE_LADEN_HTTP_FAIL,
  TAFEL_ANZEIGE_LINE,
  TAFEL_ANZEIGE_REFRESH_HINT,
  TAFEL_ANZEIGE_REFRESH_LABEL,
  TAFEL_ANZEIGE_REFRESH_OK,
  sprechenDeskOpenVisible,
  anzeigeCopyError,
  anzeigeStandLabel,
  noteAnzeigeCopyFail,
  subscribeAnzeigeCopyFail,
} from "@/lib/practice/tafel-anzeige";
import { cn } from "@/lib/utils";

const ICONS = {
  "/app": LayoutDashboard,
  "/app/anrufe": PhoneCall,
  "/app/rueckrufe": PhoneIncoming,
  "/app/kalender": CalendarDays,
  "/app/nachrichten": MessageCircle,
  "/app/notfall": Siren,
  "/app/akte": BookOpen,
  "/app/training": GraduationCap,
  "/app/auswertung": BarChart3,
  "/app/einstellungen": Settings,
} as const;

export function AppShell({
  session,
  contact,
  unreadProtocol = 0,
  anzeige = false,
  writerCopySeq = 0,
  restart = null,
  setupIncomplete = false,
  thirdPartyLlm = false,
  children,
}: {
  session: SessionView;
  contact?: { practiceName?: string; city?: string } | null;
  unreadProtocol?: number;
  anzeige?: boolean;
  writerCopySeq?: number;
  restart?: { title: string; body: string } | null;
  /** AP 34: Ärzte/Räume noch nie aus der Praxissoftware übernommen — Banner zur Ersteinrichtung. */
  setupIncomplete?: boolean;
  /** AP 34: ruhiger Dauerhinweis — Gespräch läuft über einen Dienstleister im Ausland statt im Haus. */
  thirdPartyLlm?: boolean;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const [ladenBusy, setLadenBusy] = useState(false);
  const [anzeigeWarn, setAnzeigeWarn] = useState(anzeigeCopyError);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hash = useRouterState({ select: (s) => s.location.hash });
  const onPhone = pathname === "/sprechen";
  const chrome = deskChrome(session, contact);
  const mobileTabs = deskMobileTabs();
  const mobileLeft = mobileTabs.slice(0, 2);
  const mobileRight = mobileTabs.slice(2);
  const phoneLabel = deskMobilePhoneLabel(onPhone);
  const phoneShort = deskMobilePhoneShort(onPhone);
  const moreItems = deskMobileMoreItems();
  const [moreOpen, setMoreOpen] = useState(false);
  const anzeigeStand = anzeige ? anzeigeStandLabel(anzeigeCopiedAt()) : "";
  const anzeigeWarnLine = anzeige ? anzeigeWarn : "";
  const [setupSkipped, setSetupSkipped] = useState(true);
  const showSetupBanner =
    pathname !== "/app/einrichtung" &&
    setupBannerVisible({ needsSetup: setupIncomplete, skipped: setupSkipped, isInhaberin: isInhaberin(session.role) });

  useEffect(() => {
    rememberDeskSession(deskBrowserStorage());
  }, []);

  useEffect(() => {
    // Re-read on every Seitenwechsel, nicht nur beim Einloggen: „Einrichtung
    // abschließen" navigiert clientseitig zurück nach /app — AppShell bleibt dabei
    // gemountet, also muss der Banner-Zustand hier erneut geprüft werden.
    setSetupSkipped(readSetupSkipped(deskBrowserStorage(), session.practiceId));
  }, [session.practiceId, pathname]);

  useEffect(() => subscribeAnzeigeCopyFail(setAnzeigeWarn), []);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    const id = deskHashId(hash);
    if (!id) return;
    const pin = () => document.getElementById(id)?.scrollIntoView();
    pin();
    const raf = requestAnimationFrame(pin);
    const t = window.setTimeout(pin, 80);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [hash, pathname]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-4">
          <AlmaMark />
          <span className="hidden h-5 w-px bg-border sm:block" />
          <p className="hidden text-sm text-muted-foreground sm:block">
            {chrome.practiceName}
            {chrome.city ? ` · ${chrome.city}` : ""}
            {chrome.userName ? ` · ${chrome.userName}` : ""}
          </p>
        </div>
        <div className="relative flex items-center gap-2">
          <Button
            id="desk-mehr"
            type="button"
            variant="ghost"
            size="sm"
            className="md:hidden"
            aria-label="Mehr"
            aria-expanded={moreOpen}
            aria-controls="desk-mehr-panel"
            onClick={() => setMoreOpen((open) => !open)}
          >
            <Ellipsis className="size-4" />
            <span className="sr-only">Mehr</span>
          </Button>
          {moreOpen ? (
            <nav
              id="desk-mehr-panel"
              aria-label="Mehr"
              className="absolute top-full right-0 z-40 mt-1 grid min-w-44 gap-1 rounded-xl border border-border bg-card p-2 shadow-md md:hidden"
            >
              {moreItems.map((item) => {
                const Icon = ICONS[item.to];
                return (
                  <Link
                    key={item.to}
                    id={deskMobileMoreLinkId(item.to)}
                    to={item.to}
                    className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                    activeProps={{ className: "bg-secondary text-foreground font-medium" }}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          ) : null}
          {anzeige ? (
            <Badge id="desk-tafel-anzeige-badge" variant="outline" title={TAFEL_ANZEIGE_BANNER}>
              Anzeige
            </Badge>
          ) : (
            <Badge variant="ok" title="Tafel aktualisiert sich, wenn niemand tippt">
              Live
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            aria-label="Abmelden"
            onClick={() => {
              forgetDeskSession(deskBrowserStorage());
              void signOutPractice().then(() => navigate({ to: "/" }));
            }}
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Abmelden</span>
          </Button>
        </div>
      </header>
      <p
        id="desk-datenschutz-dauerhinweis"
        className="border-b border-border bg-card px-4 py-1 text-center text-xs text-muted-foreground"
      >
        {thirdPartyLlm
          ? "Gespräche laufen über einen Dienstleister im Ausland."
          : "Gespräche bleiben im Haus."}
      </p>
      {restart ? (
        <p
          id="desk-restart-hint"
          className="border-b border-flag/30 bg-flag/8 px-4 py-2 text-center text-sm text-foreground"
        >
          <strong>{restart.title}</strong> {restart.body}
        </p>
      ) : null}
      {anzeige ? (
        <p
          id={DESK_ANZEIGE_ID}
          className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-b border-border bg-secondary/70 px-4 py-2 text-center text-sm text-foreground"
        >
          <span>
            {TAFEL_ANZEIGE_BANNER}
          </span>
          {anzeigeStand ? (
            <span id="desk-tafel-anzeige-stand" className="text-muted-foreground">
              {anzeigeStand}
            </span>
          ) : null}
          {anzeigeWarnLine ? (
            <span id="desk-tafel-anzeige-warn" className="text-amber-900">
              {anzeigeWarnLine}
            </span>
          ) : null}
          <Button
            id="desk-tafel-anzeige-laden"
            type="button"
            size="sm"
            variant="outline"
            disabled={ladenBusy}
            title={TAFEL_ANZEIGE_REFRESH_HINT}
            onClick={() => {
              setLadenBusy(true);
              void refreshTafelAnzeige()
                .then((res) => {
                  if (!res.ok) {
                    const line = noteAnzeigeCopyFail(res.error);
                    toast.error(line);
                    return;
                  }
                  markAnzeigeCopied(Date.now(), writerCopySeq);
                  toast.success(TAFEL_ANZEIGE_REFRESH_OK);
                  void router.invalidate();
                })
                .catch(() => {
                  const line = noteAnzeigeCopyFail(TAFEL_ANZEIGE_LADEN_HTTP_FAIL);
                  toast.error(line);
                })
                .finally(() => setLadenBusy(false));
            }}
          >
            {ladenBusy ? "Lädt…" : TAFEL_ANZEIGE_REFRESH_LABEL}
          </Button>
        </p>
      ) : null}
      <div className="mx-auto flex max-w-7xl">
        <aside className="hidden w-56 shrink-0 border-r border-border md:block">
          <nav className="sticky top-14 flex flex-col gap-1 p-3">
            {DESK_NAV_ITEMS.map((item) => {
              const Icon = ICONS[item.to];
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                  activeOptions={{ exact: item.to === "/app" }}
                  activeProps={{ className: "bg-secondary text-foreground font-medium" }}
                >
                  <Icon className="size-4" />
                  {item.label}
                  {item.to === "/app/nachrichten" && unreadProtocol > 0 ? (
                    <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground tabular-nums">
                      {unreadProtocol}
                    </span>
                  ) : null}
                </Link>
              );
            })}
            {sprechenDeskOpenVisible(anzeige) ? (
              <Link
                id="desk-silvia-anrufen"
                to="/sprechen"
                search={{ mode: undefined }}
                aria-current={onPhone ? "page" : undefined}
                className={cn(
                  "mt-3 flex min-h-11 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground",
                  onPhone && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
                )}
              >
                <PhoneCall className="size-4" />
                {phoneLabel}
              </Link>
            ) : (
              <button
                id="desk-silvia-anrufen"
                type="button"
                title={TAFEL_ANZEIGE_LINE}
                className="mt-3 flex min-h-11 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
                onClick={() => toast.error(TAFEL_ANZEIGE_LINE)}
              >
                <PhoneCall className="size-4" />
                {phoneLabel}
              </button>
            )}
          </nav>
        </aside>
        <div className="min-w-0 flex-1 pb-20 md:pb-0">
          {showSetupBanner ? (
            <div
              id="desk-setup-banner"
              className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-secondary px-4 py-3 text-sm sm:mx-8 sm:mt-8 sm:mb-0"
            >
              <p>
                Silvia ist noch nicht fertig eingerichtet. Vier kurze Seiten, dann ist sie für Ihre
                Ordination bereit.
              </p>
              <div className="flex items-center gap-3">
                <Link to="/app/einrichtung" className="font-medium underline">
                  Jetzt einrichten
                </Link>
                <button
                  id="desk-setup-banner-spaeter"
                  type="button"
                  className="text-muted-foreground underline"
                  onClick={() => {
                    writeSetupSkipped(deskBrowserStorage(), session.practiceId);
                    setSetupSkipped(true);
                  }}
                >
                  Später
                </button>
              </div>
            </div>
          ) : null}
          {children}
        </div>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card md:hidden">
        {mobileLeft.map((item) => (
          <MobileTab key={item.to} to={item.to} label={item.label} unreadProtocol={unreadProtocol} />
        ))}
        {sprechenDeskOpenVisible(anzeige) ? (
          <Link
            id="desk-silvia-anrufen-mobile"
            to="/sprechen"
            search={{ mode: undefined }}
            aria-label={phoneLabel}
            aria-current={onPhone ? "page" : undefined}
            className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 bg-primary text-xs font-medium text-primary-foreground"
          >
            <PhoneCall className="size-4" />
            <span>{phoneShort}</span>
          </Link>
        ) : (
          <button
            id="desk-silvia-anrufen-mobile"
            type="button"
            title={TAFEL_ANZEIGE_LINE}
            aria-label={phoneLabel}
            className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 bg-primary text-xs font-medium text-primary-foreground"
            onClick={() => toast.error(TAFEL_ANZEIGE_LINE)}
          >
            <PhoneCall className="size-4" />
            <span>{phoneShort}</span>
          </button>
        )}
        {mobileRight.map((item) => (
          <MobileTab key={item.to} to={item.to} label={item.label} unreadProtocol={unreadProtocol} />
        ))}
      </nav>
    </div>
  );
}

function MobileTab({
  to,
  label,
  unreadProtocol,
}: {
  to: (typeof DESK_NAV_ITEMS)[number]["to"];
  label: string;
  unreadProtocol: number;
}) {
  const Icon = ICONS[to];
  return (
    <Link
      to={to}
      className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground"
      activeOptions={{ exact: to === "/app" }}
      activeProps={{ className: "text-primary" }}
    >
      <Icon className="size-4" />
      <span className="relative">
        {label}
        {to === "/app/nachrichten" && unreadProtocol > 0 ? (
          <span className="absolute -top-1 -right-3 rounded-full bg-primary px-1 text-[9px] leading-4 text-primary-foreground tabular-nums">
            {unreadProtocol}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
