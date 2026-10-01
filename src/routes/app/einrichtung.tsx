/**
 * AP 34 — Geführte Ersteinrichtung für Tierärztin und Ordinationsassistentin.
 * Vier Seiten, keine Fachbegriffe: Name/Anschrift, Praxissoftware-Übernahme mit
 * Vorschau, Stimme wählen/anhören, Testanruf. Fortschritt sichtbar, jederzeit
 * abbrechbar und später an derselben Stelle fortsetzbar (silvia.einrichtung-* im
 * Browser dieses Rechners).
 */
import {
  createFileRoute,
  getRouteApi,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AvatarPicker } from "@/components/silvia-avatar";
import { HearSilvia, VoicePicker } from "@/components/silvia-voice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BUNDESLAENDER } from "@/lib/alma/data";
import {
  loadPracticeProfile,
  savePracticeProfile,
} from "@/lib/practice/profile";
import {
  fetchPraxissoftwareImportPreview,
  type PraxissoftwareImportPreview,
} from "@/lib/practice/praxissoftware-import";
import { parseSettingsProfile } from "@/lib/practice/settings-form";
import { isInhaberin } from "@/lib/practice/staff-role";
import {
  markSetupComplete,
  readSetupStep,
  SETUP_WIZARD_STEP_COUNT,
  SETUP_WIZARD_TITLES,
  writeSetupSkipped,
  writeSetupStep,
  type SetupWizardStep,
} from "@/lib/practice/setup-wizard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/einrichtung")({
  loader: () => loadPracticeProfile(),
  component: EinrichtungPage,
});

const appRoute = getRouteApi("/app");

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function StepShell({
  step,
  onBack,
  onLater,
  children,
}: {
  step: SetupWizardStep;
  onBack?: () => void;
  onLater: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mt-8 grid max-w-2xl gap-6 rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: SETUP_WIZARD_STEP_COUNT }, (_, i) => i + 1).map(
          (n) => (
            <span
              key={n}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                n <= step ? "bg-primary" : "bg-border",
              )}
            />
          ),
        )}
      </div>
      <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
        Schritt {step} von {SETUP_WIZARD_STEP_COUNT}
      </p>
      <h2 className="font-display text-2xl font-semibold">
        {SETUP_WIZARD_TITLES[step]}
      </h2>
      {children}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        {onBack ? (
          <Button type="button" variant="ghost" onClick={onBack}>
            Zurück
          </Button>
        ) : (
          <span />
        )}
        <Button type="button" variant="outline" onClick={onLater}>
          Später fortsetzen
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function EinrichtungPage() {
  const { session } = appRoute.useRouteContext();
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const canEdit = isInhaberin(session.role);
  const [step, setStep] = useState<SetupWizardStep>(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStep(readSetupStep(browserStorage(), session.practiceId));
    // Nur beim ersten Rendern lesen — danach bleibt der State federführend.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goTo(next: SetupWizardStep) {
    writeSetupStep(browserStorage(), session.practiceId, next);
    setStep(next);
  }

  function later() {
    writeSetupSkipped(browserStorage(), session.practiceId);
    void navigate({ to: "/app" });
  }

  if (!data.ok || !data.profile) {
    return (
      <div className="p-4 sm:p-8">
        <h1 className="font-display text-3xl font-semibold">Ersteinrichtung</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Die Ordination lädt gerade nicht. Bitte die Seite neu laden.
        </p>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="p-4 sm:p-8">
        <h1 className="font-display text-3xl font-semibold">Ersteinrichtung</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Name, Anschrift und die Übernahme aus der Praxissoftware richtet die
          Inhaberin ein. Stimme wählen und der Testanruf gehen auf der Seite{" "}
          <Link
            to="/sprechen"
            search={{ mode: undefined }}
            className="underline"
          >
            Sprechen
          </Link>{" "}
          — das können Sie auch ohne Freigabe ausprobieren.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8">
      <h1 className="font-display text-3xl font-semibold">Ersteinrichtung</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Vier kurze Seiten, danach ist Silvia für Ihre Ordination bereit.
        Jederzeit unterbrechbar — die Seite macht beim nächsten Aufruf wieder an
        derselben Stelle weiter.
      </p>
      {step === 1 ? (
        <StepOne
          initial={data.profile}
          loginEmail={data.staff.find((s) => s.self)?.email ?? ""}
          busy={busy}
          setBusy={setBusy}
          onDone={() => {
            void router.invalidate().then(() => goTo(2));
          }}
          onLater={later}
        />
      ) : null}
      {step === 2 ? (
        <StepTwo
          pmsConfigured={Boolean(data.pms)}
          currentPms={data.profile.pms}
          currentHours={data.profile.hours}
          busy={busy}
          setBusy={setBusy}
          onBack={() => goTo(1)}
          onDone={() => {
            void router.invalidate().then(() => goTo(3));
          }}
          onLater={later}
        />
      ) : null}
      {step === 3 ? (
        <StepThree
          practiceName={data.profile.name}
          onBack={() => goTo(2)}
          onDone={() => goTo(4)}
          onLater={later}
        />
      ) : null}
      {step === 4 ? (
        <StepFour
          onBack={() => goTo(3)}
          onLater={later}
          onFinish={() => {
            markSetupComplete(browserStorage(), session.practiceId);
            toast.success(
              "Eingerichtet. Silvia ist für Ihre Ordination bereit.",
            );
            void navigate({ to: "/app" });
          }}
        />
      ) : null}
    </div>
  );
}

function StepOne({
  initial,
  loginEmail,
  busy,
  setBusy,
  onDone,
  onLater,
}: {
  initial: NonNullable<
    Awaited<ReturnType<typeof loadPracticeProfile>>["profile"]
  >;
  loginEmail: string;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onDone: () => void;
  onLater: () => void;
}) {
  const [form, setForm] = useState({
    name: initial.name,
    street: initial.street,
    zip: initial.zip,
    city: initial.city,
    bundesland: initial.bundesland,
  });

  function patch<K extends keyof typeof form>(key: K, value: string) {
    setForm((curr) => ({ ...curr, [key]: value }));
  }

  function save() {
    const parsed = parseSettingsProfile(
      {
        name: form.name,
        street: form.street,
        zip: form.zip,
        city: form.city,
        bundesland: form.bundesland,
        phone: initial.phone,
        whatsapp: initial.whatsapp,
        email: initial.email,
        locationHint: initial.locationHint,
        nachtdienstName: initial.nachtdienstName,
        nachtdienstPhone: initial.nachtdienstPhone,
        nachtdienstNote: initial.nachtdienstNote,
        notes: initial.notes,
        ownerName: initial.ownerName,
        retentionDays: String(initial.retentionDays),
      },
      {
        loginEmail,
        bundesland: initial.bundesland,
        locationHint: initial.locationHint,
        name: initial.name,
        nachtdienstName: initial.nachtdienstName,
        nachtdienstPhone: initial.nachtdienstPhone,
        notes: initial.notes,
        ownerName: initial.ownerName,
        whatsapp: initial.whatsapp,
        nachtdienstNote: initial.nachtdienstNote,
        zip: initial.zip,
        street: initial.street,
        email: initial.email,
        phone: initial.phone,
        city: initial.city,
        retentionDays: initial.retentionDays,
      },
    );
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    setBusy(true);
    // vets/resources/pms haben keine Behalten-Logik im Speichern-Baustein — hier immer
    // den bisherigen Stand mitschicken, sonst würde diese Seite sie stillschweigend leeren.
    void savePracticeProfile({
      data: {
        ...parsed.value,
        vets: initial.vets,
        resources: initial.resources,
        pms: initial.pms,
      },
    })
      .then((res) => {
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Gespeichert.");
        onDone();
      })
      .catch(() => toast.error("Speichern fehlgeschlagen."))
      .finally(() => setBusy(false));
  }

  return (
    <StepShell step={1} onLater={onLater}>
      <p className="text-sm text-muted-foreground">
        Wie heißt die Ordination und wo liegt sie.
      </p>
      <Field label="Name der Ordination" htmlFor="einrichtung-name">
        <Input
          id="einrichtung-name"
          value={form.name}
          onChange={(e) => patch("name", e.target.value)}
        />
      </Field>
      <Field label="Straße und Hausnummer" htmlFor="einrichtung-street">
        <Input
          id="einrichtung-street"
          value={form.street}
          onChange={(e) => patch("street", e.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Postleitzahl" htmlFor="einrichtung-zip">
          <Input
            id="einrichtung-zip"
            value={form.zip}
            onChange={(e) => patch("zip", e.target.value)}
          />
        </Field>
        <Field label="Ort" htmlFor="einrichtung-city">
          <Input
            id="einrichtung-city"
            value={form.city}
            onChange={(e) => patch("city", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Bundesland" htmlFor="einrichtung-bundesland">
        <select
          id="einrichtung-bundesland"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={form.bundesland}
          onChange={(e) => patch("bundesland", e.target.value)}
        >
          <option value="">Bitte wählen</option>
          {BUNDESLAENDER.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </Field>
      <div>
        <Button type="button" disabled={busy} onClick={save}>
          Weiter
        </Button>
      </div>
    </StepShell>
  );
}

function StepTwo({
  pmsConfigured,
  currentPms,
  currentHours,
  busy,
  setBusy,
  onBack,
  onDone,
  onLater,
}: {
  pmsConfigured: boolean;
  currentPms: string;
  currentHours: { day: string; time: string }[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  onBack: () => void;
  onDone: () => void;
  onLater: () => void;
}) {
  const [preview, setPreview] = useState<PraxissoftwareImportPreview | null>(
    null,
  );

  function fetchPreview() {
    setBusy(true);
    void fetchPraxissoftwareImportPreview()
      .then((res) => {
        setPreview(res);
        if (!res.ok) toast.error(res.error);
      })
      .catch(() =>
        toast.error("Übernahme aus der Praxissoftware fehlgeschlagen."),
      )
      .finally(() => setBusy(false));
  }

  function apply() {
    if (!preview || !preview.ok) return;
    setBusy(true);
    // pms/vets/resources/hours haben keine Behalten-Logik im Speichern-Baustein — den
    // bisherigen Stand mitschicken, sonst würde ein leeres Feld hier stillschweigend leeren.
    void savePracticeProfile({
      data: {
        vets: preview.vets,
        resources: preview.resources,
        hours: preview.hoursFound ? preview.hours : currentHours,
        pms: currentPms,
      },
    })
      .then((res) => {
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Übernommen.");
        onDone();
      })
      .catch(() => toast.error("Speichern fehlgeschlagen."))
      .finally(() => setBusy(false));
  }

  if (!pmsConfigured) {
    return (
      <StepShell step={2} onBack={onBack} onLater={onLater}>
        <p className="text-sm text-muted-foreground">
          Für diese Ordination ist noch keine Praxissoftware hinterlegt. Ärzte,
          Räume und Öffnungszeiten tragen Sie später unter Einstellungen von
          Hand ein.
        </p>
        <div>
          <Button type="button" onClick={onDone}>
            Weiter
          </Button>
        </div>
      </StepShell>
    );
  }

  return (
    <StepShell step={2} onBack={onBack} onLater={onLater}>
      <p className="text-sm text-muted-foreground">
        Silvia kann Ärzte, Räume und Öffnungszeiten aus der Praxissoftware
        holen. Sie sehen die Angaben vorher — übernommen wird erst nach Ihrer
        Bestätigung.
      </p>
      {!preview ? (
        <div>
          <Button type="button" disabled={busy} onClick={fetchPreview}>
            Aus der Praxissoftware holen
          </Button>
        </div>
      ) : null}
      {preview && preview.ok ? (
        <div className="grid gap-3 rounded-lg border border-border bg-background p-3 text-sm">
          <div>
            <p className="font-medium">Ärzte</p>
            <p className="whitespace-pre-line text-muted-foreground">
              {preview.vets || "Keine gefunden."}
            </p>
          </div>
          <div>
            <p className="font-medium">Räume</p>
            <p className="whitespace-pre-line text-muted-foreground">
              {preview.resources || "Keine gefunden."}
            </p>
          </div>
          <div>
            <p className="font-medium">Öffnungszeiten</p>
            {preview.hoursFound ? (
              <ul className="text-muted-foreground">
                {preview.hours.map((h) => (
                  <li key={h.day}>
                    {h.day}: {h.time}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Keine gefunden.</p>
            )}
          </div>
          <div className="flex gap-3">
            <Button type="button" disabled={busy} onClick={apply}>
              Übernehmen
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={fetchPreview}
            >
              Erneut holen
            </Button>
          </div>
        </div>
      ) : null}
      {preview && !preview.ok ? (
        <div>
          <Button type="button" variant="outline" onClick={onDone}>
            Ohne Übernahme weiter
          </Button>
        </div>
      ) : null}
    </StepShell>
  );
}

function StepThree({
  practiceName,
  onBack,
  onDone,
  onLater,
}: {
  practiceName: string;
  onBack: () => void;
  onDone: () => void;
  onLater: () => void;
}) {
  return (
    <StepShell step={3} onBack={onBack} onLater={onLater}>
      <p className="text-sm text-muted-foreground">
        Welches Gesicht und welche Stimme passt zu{" "}
        {practiceName || "Ihrer Ordination"}. Ein Klick auf eine Stimme spielt
        sie vor.
      </p>
      <AvatarPicker />
      <VoicePicker />
      <div className="flex flex-wrap gap-3">
        <HearSilvia label="Noch einmal hören" />
        <Button type="button" onClick={onDone}>
          Weiter
        </Button>
      </div>
    </StepShell>
  );
}

function StepFour({
  onBack,
  onLater,
  onFinish,
}: {
  onBack: () => void;
  onLater: () => void;
  onFinish: () => void;
}) {
  return (
    <StepShell step={4} onBack={onBack} onLater={onLater}>
      <p className="text-sm text-muted-foreground">
        Jetzt einmal selbst anrufen und ausprobieren, wie Silvia am Telefon
        klingt und antwortet.
      </p>
      <div>
        <Button asChild>
          <Link
            to="/sprechen"
            search={{ mode: undefined }}
            target="_blank"
            rel="noopener noreferrer"
          >
            Jetzt testen
          </Link>
        </Button>
      </div>
      <div className="border-t border-border pt-4">
        <Button type="button" onClick={onFinish}>
          Einrichtung abschließen
        </Button>
      </div>
    </StepShell>
  );
}
