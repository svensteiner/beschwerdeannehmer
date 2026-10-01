import { createFileRoute, Link, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { AuthTabs } from "@/components/layout/auth-tabs";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SiteShell } from "@/components/layout/site-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BUNDESLAENDER, PMS_DEFAULT, PMS_HINT_ID, PMS_OPTIONS, PRAXISSOFTWARE_HINT } from "@/lib/alma/data";
import { registerPractice } from "@/lib/practice/auth";
import { deskBrowserStorage, rememberDeskSession } from "@/lib/practice/desk-session";
import {
  DESK_REGISTER_EXISTS_ID,
  DESK_REGISTER_SCHON_ID,
  DESK_REGISTER_KICKER_ID,
  DESK_REGISTER_TITLE_ID,
  TAFEL_HOLEN_FAIL_ID,
  TAFEL_HOLEN_WAIT_HREF,
  deskRegisterExistsLine,
  registerDeskFormOn,
  registerDeskKicker,
  registerDeskSchonOn,
  registerDeskTitle,
} from "@/lib/practice/desk-storage";
import { loadRegisterDeskNotice } from "@/lib/practice/holen-login-fn";
import { DESK_ANZEIGE_ID, deskAnzeigeAuthLine } from "@/lib/practice/tafel-anzeige";
import { peekAppHolenPending } from "@/lib/practice/holen-wait-gate";

export const Route = createFileRoute("/registrieren")({
  beforeLoad: async () => {
    if (await peekAppHolenPending()) {
      throw redirect({ to: TAFEL_HOLEN_WAIT_HREF, search: { next: "/registrieren" } });
    }
  },
  loader: async () => loadRegisterDeskNotice(),
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const { fail: holenFail, existing, anzeige } = Route.useLoaderData();
  const anzeigeLine = deskAnzeigeAuthLine(anzeige);
  const showForm = registerDeskFormOn({ existing, anzeige });
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    practice: "",
    name: "",
    email: "",
    inbox: "",
    password: "",
    phone: "",
    bundesland: "",
    city: "",
    pms: PMS_DEFAULT,
    street: "",
    zip: "",
    parkplatz: "",
    whatsapp: "",
    nachtdienst: "",
  });

  useEffect(() => {
    if (holenFail) toast.error(holenFail);
  }, [holenFail]);

  return (
    <SiteShell anzeige={anzeige}>
      <main className="mx-auto w-full max-w-lg px-4 py-16 sm:px-6">
        <AuthTabs active="registrieren" />
        <p id={DESK_REGISTER_KICKER_ID} className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
          {registerDeskKicker({ existing, anzeige })}
        </p>
        <h1 id={DESK_REGISTER_TITLE_ID} className="mt-2 font-display text-3xl font-semibold">
          {registerDeskTitle({ existing, anzeige })}
        </h1>
        {showForm ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Eigenes Konto, eigene Praxistafel. Anrufe landen bei Ihnen, nicht im Demo-Speicher des Browsers.
          </p>
        ) : null}
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
        {existing ? (
          <p id={DESK_REGISTER_EXISTS_ID} className="mt-3 text-sm text-muted-foreground">
            {deskRegisterExistsLine(anzeige)}{" "}
            <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
              Anmelden
            </Link>
          </p>
        ) : null}
        {showForm ? (
        <form
          id="desk-register-form"
          className="mt-8 grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            void registerPractice({ data: form })
              .then((res) => {
                if (!res.ok) {
                  if ("holen" in res && res.holen) {
                    window.location.assign(`${TAFEL_HOLEN_WAIT_HREF}?next=/registrieren`);
                    return;
                  }
                  toast.error(res.error);
                  setBusy(false);
                  return;
                }
                toast.success("Willkommen. Ihre Ordination ist bereit.");
                rememberDeskSession(deskBrowserStorage());
                void router.invalidate().then(() => navigate({ to: "/app" }));
              })
              .catch(() => {
                toast.error("Registrierung fehlgeschlagen.");
                setBusy(false);
              });
          }}
        >
          <Field label="Ordination" htmlFor="practice">
            <Input
              id="practice"
              required
              value={form.practice}
              onChange={(e) => setForm({ ...form, practice: e.target.value })}
              placeholder="Ordination"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ihr Name" htmlFor="name">
              <Input
                id="name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Dr. med. vet."
              />
            </Field>
            <Field label="Ort" htmlFor="city">
              <Input
                id="city"
                required
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="Graz"
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bundesland" htmlFor="bundesland">
              <select
                id="bundesland"
                required
                className="flex h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={form.bundesland}
                onChange={(e) => setForm({ ...form, bundesland: e.target.value })}
              >
                <option value="">Bitte wählen</option>
                {BUNDESLAENDER.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Praxissoftware" htmlFor="pms">
              <select
                id="pms"
                className="flex h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={form.pms}
                onChange={(e) =>
                  setForm({ ...form, pms: e.target.value as (typeof PMS_OPTIONS)[number] })
                }
              >
                {PMS_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p id={PMS_HINT_ID} className="text-xs text-muted-foreground">
            {PRAXISSOFTWARE_HINT}
          </p>
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <Field label="Straße" htmlFor="street">
              <Input
                id="street"
                required
                value={form.street}
                onChange={(e) => setForm({ ...form, street: e.target.value })}
                placeholder="Herrengasse 12"
              />
            </Field>
            <Field label="PLZ" htmlFor="zip">
              <Input
                id="zip"
                value={form.zip}
                onChange={(e) => setForm({ ...form, zip: e.target.value })}
                placeholder="8010"
              />
            </Field>
          </div>
          <Field label="Parkplatz / Öffi" htmlFor="parkplatz">
            <Input
              id="parkplatz"
              required
              value={form.parkplatz}
              onChange={(e) => setForm({ ...form, parkplatz: e.target.value })}
              placeholder="Parkplatz hinter dem Haus"
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Anreise für die Klientel. Silvia erfindet keine Josefstadt und keine U2.
          </p>
          <Field label="Anmelden (E-Mail)" htmlFor="email">
            <Input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="name@ordination.at"
            />
          </Field>
          <Field label="Inbox der Frau Doktor" htmlFor="inbox">
            <Input
              id="inbox"
              type="email"
              required
              value={form.inbox}
              onChange={(e) => setForm({ ...form, inbox: e.target.value })}
              placeholder="rezeption@ordination.at"
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Anmelden öffnet die Tafel. Intern-Protokoll (mailto) geht an die Inbox — nicht an Anmelden.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Passwort (mind. 8 Zeichen)" htmlFor="password">
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
            <Field label="Telefon" htmlFor="phone">
              <Input
                id="phone"
                required
                autoComplete="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="0316 … oder 0664 …"
              />
            </Field>
          </div>
          <Field label="WhatsApp der Frau Doktor (Handy)" htmlFor="whatsapp">
            <Input
              id="whatsapp"
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              placeholder="0664 …"
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Telefon ist die Leitung (auch Festnetz). Intern-WhatsApp braucht 06… – sonst die Tierarzthelferin später in den
            Einstellungen.
          </p>
          <Field label="Nachtdienst-Nummer" htmlFor="nachtdienst">
            <Input
              id="nachtdienst"
              required
              autoComplete="tel"
              inputMode="tel"
              value={form.nachtdienst}
              onChange={(e) => setForm({ ...form, nachtdienst: e.target.value })}
              placeholder="0316 … oder 0664 …"
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Nachts und am Wochenende. Handy oder Festnetz der Bereitschaft — Silvia erfindet keine Kliniknummer.
          </p>
          <Button type="submit" disabled={busy || existing || anzeige}>
            {busy ? "Wird eingerichtet…" : "Ordination anlegen"}
          </Button>
        </form>
        ) : null}
        {registerDeskSchonOn({ existing }) ? (
          <p id={DESK_REGISTER_SCHON_ID} className="mt-6 text-sm text-muted-foreground">
            Schon dabei?{" "}
            <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
              Anmelden
            </Link>
          </p>
        ) : null}
      </main>
    </SiteShell>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
