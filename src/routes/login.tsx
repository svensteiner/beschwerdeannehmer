import { createFileRoute, Link, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { AuthTabs } from "@/components/layout/auth-tabs";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SiteShell } from "@/components/layout/site-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LOGIN_RESET_FORM_ID } from "@/lib/practice/desk-password-form";
import {
  DESK_RESET_ANZEIGE_ID,
  DESK_RESET_HINT_ID,
  deskResetAnzeigeLine,
  deskResetFormVisible,
  deskResetHint,
} from "@/lib/practice/desk-reset";
import { signInPractice } from "@/lib/practice/auth";
import { applyDeskPasswordReset, requestDeskPasswordReset } from "@/lib/practice/desk-reset-fn";
import {
  holenLoginShouldOpenReset,
  takeHolenLoginNotice,
  TAFEL_HOLEN_LOGIN_RESET,
  TAFEL_HOLEN_WAIT_HREF,
  TAFEL_HOLEN_FAIL_ID,
  DESK_LOGIN_REGISTER_ID,
} from "@/lib/practice/desk-storage";
import { peekAppHolenPending } from "@/lib/practice/holen-wait-gate";
import {
  loadDeskRegisterCta,
  loadHolenFailNotice,
  loadHolenLoginEmail,
  loadTafelAnzeigeFlag,
} from "@/lib/practice/holen-login-fn";
import { DESK_ANZEIGE_ID, TAFEL_ANZEIGE_ERROR, deskAnzeigeAuthLine, sprechenLoginDest } from "@/lib/practice/tafel-anzeige";
import {
  deskBrowserStorage,
  deskLoginNext,
  hadDeskSession,
  rememberDeskSession,
} from "@/lib/practice/desk-session";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { next?: string } => {
    const next = deskLoginNext(search.next);
    return next ? { next } : {};
  },
  beforeLoad: async () => {
    if (await peekAppHolenPending()) {
      throw redirect({ to: TAFEL_HOLEN_WAIT_HREF, search: { next: "/login" } });
    }
  },
  loader: async () => {
    const [email, fail, anzeige, showRegister] = await Promise.all([
      loadHolenLoginEmail(),
      loadHolenFailNotice(),
      loadTafelAnzeigeFlag(),
      loadDeskRegisterCta(),
    ]);
    return { email, fail, anzeige, showRegister };
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const { next } = Route.useSearch();
  const { email: holenEmail, fail: holenFail, anzeige, showRegister } = Route.useLoaderData();
  const anzeigeLine = deskAnzeigeAuthLine(anzeige);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetPath, setResetPath] = useState("");
  const [resetAnzeige, setResetAnzeige] = useState("");
  const [expired, setExpired] = useState(false);
  const [holenNotice, setHolenNotice] = useState("");
  const [notice, setNotice] = useState<{ id: "desk-login-wait" | "desk-tafel-locked"; text: string } | null>(
    null,
  );

  useEffect(() => {
    if (holenFail) toast.error(holenFail);
  }, [holenFail]);

  useEffect(() => {
    const holen = takeHolenLoginNotice({ storage: deskBrowserStorage(), email: holenEmail });
    if (holen) {
      setHolenNotice(holen);
      toast.success(holen);
      if (holenLoginShouldOpenReset(holenEmail)) setForgot(true);
      return;
    }
    if (next && hadDeskSession(deskBrowserStorage())) setExpired(true);
  }, [next, holenEmail]);

  function readField(id: string) {
    const el = document.getElementById(id);
    if (el instanceof HTMLInputElement) return el.value;
    return "";
  }

  return (
    <SiteShell anzeige={anzeige}>
      <main className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
        <AuthTabs active="login" />
        <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">Ordination</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">Anmelden</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ihre Praxistafel, Ihre Akte, Ihre Anrufe – nicht die Demo.
        </p>
        {anzeigeLine ? (
          <p id={DESK_ANZEIGE_ID} className="mt-3 text-sm text-muted-foreground">
            {anzeigeLine}
          </p>
        ) : null}
        {holenFail ? (
          <p id={TAFEL_HOLEN_FAIL_ID} className="mt-3 text-sm text-muted-foreground">
            {holenFail}
          </p>
        ) : null}
        {holenNotice ? (
          <p id="desk-holen-login" className="mt-3 text-sm text-muted-foreground">
            {holenNotice}
          </p>
        ) : null}
        {holenNotice && holenLoginShouldOpenReset(holenEmail) ? (
          <p id="desk-holen-login-reset" className="mt-2 text-sm text-muted-foreground">
            {TAFEL_HOLEN_LOGIN_RESET}
          </p>
        ) : null}
        {expired ? (
          <p id="desk-session-expired" className="mt-3 text-sm text-muted-foreground">
            Ihre Sitzung ist abgelaufen. Nach dem Anmelden geht es auf der Tafel weiter.
          </p>
        ) : null}
        {notice ? (
          <p id={notice.id} className="mt-3 text-sm text-muted-foreground">
            {notice.text}
          </p>
        ) : null}
        <form
          className="mt-8 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const emailValue = readField("email");
            const passwordValue = readField("password");
            setBusy(true);
            void signInPractice({ data: { email: emailValue, password: passwordValue } })
              .then((res) => {
                if (!res.ok) {
                  if ("holen" in res && res.holen) {
                    window.location.assign(`${TAFEL_HOLEN_WAIT_HREF}?next=/login`);
                    return;
                  }
                  toast.error(res.error);
                  if ("wait" in res && res.wait) {
                    setNotice({ id: "desk-login-wait", text: res.error });
                  } else if ("held" in res && res.held) {
                    setNotice({ id: "desk-tafel-locked", text: res.error });
                  } else {
                    setNotice(null);
                  }
                  setBusy(false);
                  return;
                }
                setNotice(null);
                rememberDeskSession(deskBrowserStorage());
                const dest = sprechenLoginDest({ dest: deskLoginNext(next), anzeige });
                if (dest) {
                  window.location.assign(dest);
                  return;
                }
                void router.invalidate().then(() => navigate({ to: "/app" }));
              })
              .catch((err) => {
                const msg = err instanceof Error ? err.message : "";
                if (msg.startsWith("Die Tafel ist schon offen")) {
                  toast.error(msg);
                  setNotice({ id: "desk-tafel-locked", text: msg });
                } else {
                  toast.error("Anmeldung fehlgeschlagen.");
                }
                setBusy(false);
              });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">E-Mail</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="username"
              defaultValue={holenEmail ?? ""}
              placeholder="rezeption@ordination.at"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Passwort</Label>
            <Input id="password" type="password" required autoComplete="current-password" />
          </div>
          <Button id="desk-login-submit" type="submit" disabled={busy}>
            {busy ? "Einen Moment…" : "In die Ordination"}
          </Button>
        </form>
        {showRegister ? (
          <p id={DESK_LOGIN_REGISTER_ID} className="mt-6 text-sm text-muted-foreground">
            Noch kein Zugang?{" "}
            <Link to="/registrieren" className="font-medium text-foreground underline-offset-4 hover:underline">
              Ordination eröffnen
            </Link>
          </p>
        ) : null}
        <button
          id="login-forgot"
          type="button"
          className="mt-4 text-sm font-medium text-foreground underline-offset-4 hover:underline"
          onClick={() => setForgot((open) => !open)}
        >
          Passwort vergessen?
        </button>
        {forgot ? (
          <form
            id={LOGIN_RESET_FORM_ID}
            className="mt-4 grid gap-3 rounded-xl border border-border bg-card p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const emailEl = document.getElementById("login-reset-email");
              const codeEl = document.getElementById("login-reset-code");
              const passwordEl = document.getElementById("login-reset-password");
              const confirmEl = document.getElementById("login-reset-confirm");
              const value = emailEl instanceof HTMLInputElement ? emailEl.value : readField("email");
              const code = codeEl instanceof HTMLInputElement ? codeEl.value : "";
              const password = passwordEl instanceof HTMLInputElement ? passwordEl.value : "";
              const confirm = confirmEl instanceof HTMLInputElement ? confirmEl.value : "";
              setResetBusy(true);
              void applyDeskPasswordReset({ data: { email: value, code, password, confirm } })
                .then((res) => {
                  if (!res.ok) {
                    if ("holen" in res && res.holen) {
                      window.location.assign(`${TAFEL_HOLEN_WAIT_HREF}?next=/login`);
                      return;
                    }
                    const line = deskResetAnzeigeLine(res.error);
                    setResetAnzeige(line);
                    toast.error(res.error);
                    return;
                  }
                  setResetAnzeige("");
                  setResetPath("");
                  setForgot(false);
                  toast.success("Passwort gesetzt. Bitte anmelden.");
                })
                .catch(() => toast.error("Passwort nicht gesetzt."))
                .finally(() => setResetBusy(false));
            }}
          >
            <p id={DESK_RESET_HINT_ID} className="text-sm text-muted-foreground">
              {deskResetHint(anzeige)}
            </p>
            {deskResetFormVisible(anzeige) ? (
              <>
            <div className="grid gap-1.5">
              <Label htmlFor="login-reset-email">E-Mail</Label>
              <Input
                id="login-reset-email"
                name="username"
                type="email"
                autoComplete="username"
                defaultValue={holenEmail || readField("email")}
              />
            </div>
            <Button
              id="login-reset-request"
              type="button"
              variant="outline"
              disabled={resetBusy}
              onClick={() => {
                const el = document.getElementById("login-reset-email");
                const value = el instanceof HTMLInputElement ? el.value : readField("email");
                setResetBusy(true);
                void requestDeskPasswordReset({ data: { email: value } })
                  .then((res) => {
                    if (!res.ok) {
                      if ("holen" in res && res.holen) {
                        window.location.assign(`${TAFEL_HOLEN_WAIT_HREF}?next=/login`);
                        return;
                      }
                      const line = deskResetAnzeigeLine(res.error);
                      setResetAnzeige(line);
                      if (line) setResetPath("");
                      toast.error(res.error);
                      return;
                    }
                    setResetAnzeige("");
                    setResetPath(res.path);
                    toast.success("Code liegt auf diesem Rechner.");
                  })
                  .catch(() => toast.error("Code nicht gelegt."))
                  .finally(() => setResetBusy(false));
              }}
            >
              {resetBusy ? "Legt…" : "Code auf diesen Rechner legen"}
            </Button>
            {resetAnzeige ? (
              <p id={DESK_RESET_ANZEIGE_ID} className="text-sm text-amber-900">
                {resetAnzeige}
              </p>
            ) : null}
            {resetPath ? (
              <p id="login-reset-path" className="break-all font-mono text-xs">
                {resetPath}
              </p>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor="login-reset-code">Code aus der Datei</Label>
              <Input id="login-reset-code" name="one-time-code" autoComplete="one-time-code" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="login-reset-password">Neues Passwort</Label>
              <Input id="login-reset-password" name="new-password" type="password" autoComplete="new-password" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="login-reset-confirm">Neues Passwort wiederholen</Label>
              <Input id="login-reset-confirm" name="new-password-confirm" type="password" autoComplete="new-password" />
            </div>
            <Button id="login-reset-save" type="submit" disabled={resetBusy}>
              {resetBusy ? "Setzt…" : "Passwort setzen"}
            </Button>
              </>
            ) : (
              <p id={DESK_RESET_ANZEIGE_ID} className="text-sm text-amber-900">
                {TAFEL_ANZEIGE_ERROR}
              </p>
            )}
          </form>
        ) : null}
      </main>
    </SiteShell>
  );
}
