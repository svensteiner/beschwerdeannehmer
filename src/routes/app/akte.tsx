import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { DeskDraftButton } from "@/components/desk/desk-draft-button";
import { HalterinReach } from "@/components/desk/halterin-reach";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { displayOwner } from "@/lib/alma/actions";
import { gelegtSlotForPet } from "@/lib/practice/board-window";
import { createAkte, loadPatientById, searchPatients, updateAppointmentStatus, updatePatientContact } from "@/lib/practice/desk-actions";
import {
  confirmDraftToast,
  ownerReachBody,
  ownerReachMailSubject,
  walkInConfirmHref,
  walkInConfirmMailHref,
  walkInConfirmSmsHref,
} from "@/lib/practice/walk-in-last";
import { HALTERIN_PHONE_HINT, HALTERIN_PHONE_LABEL, WALK_IN_PLACEHOLDERS, DESK_SEARCH_PLACEHOLDER_AKTE, AKTE_EMAIL_PLACEHOLDER } from "@/lib/practice/desk-status";
import {
  parseNewAkte,
  patientContactFieldIds,
  patientContactFromFields,
  patientSearchNeedle,
} from "@/lib/practice/patient-query";
import {
  AKTE_LEAD_ID,
  AKTE_SEARCH_EMPTY_ID,
  AKTE_NEU_ANZEIGE_ID,
  AKTE_FELDER_ANZEIGE,
  AKTE_FELDER_ANZEIGE_ID,
  akteContactSaveVisible,
  akteEmptyCopy,
  akteFelderVisible,
  akteLead,
  akteSearchEmptyCopy,
  akteNeuFormVisible,
  akteNeuTitle,
  anzeigeControl,
} from "@/lib/practice/tafel-anzeige";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/akte")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { p?: string; q?: string; owner?: string; phone?: string; email?: string } => ({
    ...(typeof search.p === "string" ? { p: search.p.slice(0, 80) } : {}),
    ...(typeof search.q === "string" ? { q: search.q.slice(0, 40) } : {}),
    ...(typeof search.owner === "string" ? { owner: search.owner.slice(0, 80) } : {}),
    ...(typeof search.phone === "string" ? { phone: search.phone.slice(0, 32) } : {}),
    ...(typeof search.email === "string" ? { email: search.email.slice(0, 160) } : {}),
  }),
  component: AktePage,
});

const appRoute = getRouteApi("/app");

type AktePatient = {
  id: string;
  name: string;
  species: string;
  owner_name: string;
  phone: string;
  email?: string;
  chip: string;
  source: string;
  last_call_note: string | null;
  last_visit: string | null;
  notes: string;
};

function AktePage() {
  const data = appRoute.useLoaderData();
  const { p: patientId, q: qSearch, owner: ownerSearch, phone: phoneSearch, email: emailSearch } =
    Route.useSearch();
  const listed = useMemo(() => (data.ok ? data.patients : []), [data]);
  const total = data.ok ? Number(data.counts.patients) || listed.length : 0;
  const anzeige = Boolean(data.ok && data.anzeige);
  const [q, setQ] = useState(qSearch ?? "");
  const [hits, setHits] = useState<AktePatient[] | null>(null);
  const [extra, setExtra] = useState<AktePatient | null>(null);
  const [busy, setBusy] = useState(false);
  const [neuPet, setNeuPet] = useState("");
  const [neuOwner, setNeuOwner] = useState(ownerSearch ?? "");
  const [neuPhone, setNeuPhone] = useState(phoneSearch ?? "");
  const [neuEmail, setNeuEmail] = useState(emailSearch ?? "");
  const [neuBusy, setNeuBusy] = useState(false);
  const router = useRouter();
  const navigate = Route.useNavigate();

  function runSearch(value: string) {
    const needle = patientSearchNeedle(value);
    if (!needle) {
      setHits(null);
      return;
    }
    setBusy(true);
    void searchPatients({ data: { q: value } })
      .then((res) => {
        if (!res.ok) {
          toast.error("Suche nicht möglich.");
          return;
        }
        setHits(res.patients);
      })
      .catch(() => toast.error("Suche nicht möglich."))
      .finally(() => setBusy(false));
  }

  useEffect(() => {
    setQ(qSearch ?? "");
  }, [qSearch]);

  useEffect(() => {
    if (ownerSearch) setNeuOwner(ownerSearch);
    if (phoneSearch) setNeuPhone(phoneSearch);
    if (emailSearch) setNeuEmail(emailSearch);
  }, [ownerSearch, phoneSearch, emailSearch]);

  useEffect(() => {
    const needle = patientSearchNeedle(q);
    if (!needle) {
      setHits(null);
      return;
    }
    const t = window.setTimeout(() => runSearch(q), 280);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!patientId || listed.some((row) => row.id === patientId) || extra?.id === patientId) return;
    void loadPatientById({ data: { id: patientId } })
      .then((res) => {
        if (res.ok && res.patient) setExtra(res.patient);
      })
      .catch(() => undefined);
  }, [patientId, listed, extra?.id]);

  useEffect(() => {
    if (!patientId) return;
    window.requestAnimationFrame(() => {
      document.getElementById(`akte-${patientId}`)?.scrollIntoView({ block: "center" });
    });
  }, [patientId, listed, extra?.id, hits]);

  function saveNeuAkte() {
    if (anzeige) {
      toast.error(anzeigeControl(true).title);
      return;
    }
    const get = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? "";
    const parsed = parseNewAkte({
      pet: get("akte-neu-pet") || neuPet,
      owner: get("akte-neu-owner") || neuOwner,
      phone: get("akte-neu-phone") || neuPhone,
      email: get("akte-neu-email") || neuEmail,
    });
    if (!parsed) {
      toast.error("Tier und Halterin brauchen je mindestens zwei Zeichen — nicht Patient oder Hund.");
      return;
    }
    setNeuBusy(true);
    void createAkte({
      data: {
        pet: parsed.pet,
        owner: parsed.owner,
        phone: parsed.phone,
        email: parsed.email,
      },
    })
      .then((res) => {
        if (!res.ok) {
          toast.error(
            "error" in res && res.error && res.error !== "tier-owner"
              ? res.error
              : "Akte nicht angelegt. Tier und Halterin brauchen je zwei Zeichen.",
          );
          return;
        }
        toast.success(res.created ? "Akte liegt." : "Akte aktualisiert.");
        setNeuPet("");
        setQ("");
        setHits(null);
        void navigate({
          to: "/app/akte",
          search: { p: res.id },
        });
        void router.invalidate();
      })
      .catch(() => toast.error("Akte nicht angelegt."))
      .finally(() => setNeuBusy(false));
  }

  const searching = Boolean(patientSearchNeedle(q));
  const shown =
    hits ??
    (extra && !listed.some((row) => row.id === extra.id) ? [extra, ...listed] : listed);

  return (
    <div className="p-4 sm:p-8">
      <h1 className="font-display text-3xl font-semibold">Akte</h1>
      <p id={AKTE_LEAD_ID} className="mt-1 text-sm text-muted-foreground">
        {akteLead(anzeige)}
      </p>
      <form
        className="mt-6 max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          const field = e.currentTarget.elements.namedItem("akte-q");
          const value = field instanceof HTMLInputElement ? field.value : q;
          setQ(value);
          runSearch(value);
        }}
      >
        <Label htmlFor="akte-q">Kartei durchsuchen</Label>
        <Input
          id="akte-q"
          name="akte-q"
          className="mt-1.5"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          placeholder={DESK_SEARCH_PLACEHOLDER_AKTE}
          autoComplete="off"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {busy
            ? "Sucht…"
            : searching
              ? shown.length
                ? `${shown.length} Treffer · ${total} in der Kartei`
                : `Kein Eintrag zu „${q.trim()}“.`
              : total > listed.length
                ? `${listed.length} zuletzt aktiv von ${total} – Suche findet den Rest.`
                : total
                  ? `${total} in der Kartei`
                  : "Noch keine Akte."}
        </p>
      </form>
      <form
        id="akte-neu"
        className="mt-8 max-w-md rounded-xl border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          saveNeuAkte();
        }}
      >
        <h2 className="font-display text-xl font-semibold">{akteNeuTitle(anzeige)}</h2>
        {anzeige ? (
          <p id={AKTE_NEU_ANZEIGE_ID} className="mt-1 text-sm text-foreground">
            {anzeigeControl(true).title}
          </p>
        ) : null}
        {akteNeuFormVisible(anzeige) ? (
        <>
        <p className="mt-1 text-sm text-muted-foreground">
          Ohne Slot. Für Rückrufzettel ohne genannten Tiernamen. Walk-in im Kalender legt weiter den Termin.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="akte-neu-pet">Tier</Label>
            <Input
              id="akte-neu-pet"
              value={neuPet}
              onChange={(e) => setNeuPet(e.target.value)}
              placeholder={WALK_IN_PLACEHOLDERS.pet}
              autoComplete="off"
              maxLength={40}
              disabled={anzeigeControl(anzeige).disabled}
              title={anzeigeControl(anzeige).title}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="akte-neu-owner">Halterin</Label>
            <Input
              id="akte-neu-owner"
              value={neuOwner}
              onChange={(e) => setNeuOwner(e.target.value)}
              placeholder={WALK_IN_PLACEHOLDERS.owner}
              autoComplete="off"
              maxLength={80}
              disabled={anzeigeControl(anzeige).disabled}
              title={anzeigeControl(anzeige).title}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="akte-neu-phone">{HALTERIN_PHONE_LABEL}</Label>
            <Input
              id="akte-neu-phone"
              value={neuPhone}
              onChange={(e) => setNeuPhone(e.target.value)}
              placeholder={WALK_IN_PLACEHOLDERS.phone}
              autoComplete="off"
              maxLength={24}
              disabled={anzeigeControl(anzeige).disabled}
              title={anzeigeControl(anzeige).title}
            />
            <p className="text-xs text-muted-foreground">{HALTERIN_PHONE_HINT}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="akte-neu-email">E-Mail der Halterin</Label>
            <Input
              id="akte-neu-email"
              value={neuEmail}
              onChange={(e) => setNeuEmail(e.target.value)}
              placeholder={WALK_IN_PLACEHOLDERS.email}
              autoComplete="off"
              maxLength={160}
              disabled={anzeigeControl(anzeige).disabled}
              title={anzeigeControl(anzeige).title}
            />
          </div>
          <Button
            type="submit"
            id="akte-neu-speichern"
            disabled={neuBusy || anzeigeControl(anzeige).disabled}
            title={anzeigeControl(anzeige).title}
          >
            {neuBusy ? "Legt an…" : "Akte anlegen"}
          </Button>
        </div>
        </>
        ) : null}
      </form>
      {shown.length === 0 ? (
        <p id={searching ? AKTE_SEARCH_EMPTY_ID : undefined} className="mt-8 text-sm text-muted-foreground">
          {searching ? akteSearchEmptyCopy(anzeige) : akteEmptyCopy(anzeige)}
        </p>
      ) : (
        <>
        {anzeige ? (
          <p id={AKTE_FELDER_ANZEIGE_ID} className="mt-6 text-sm text-foreground">
            {AKTE_FELDER_ANZEIGE}
          </p>
        ) : null}
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {shown.map((p) => (
            <PatientCard
              key={p.id}
              patient={p}
              highlighted={patientId === p.id}
              practiceName={data.ok ? data.contact.practiceName : "Ordination"}
              slot={gelegtSlotForPet(data.ok ? data.appointments : [], p.name)}
              anzeige={anzeige}
            />
          ))}
        </ul>
        </>
      )}
    </div>
  );
}

function PatientCard({
  patient: p,
  highlighted,
  practiceName,
  slot,
  anzeige,
}: {
  patient: {
    id: string;
    name: string;
    species: string;
    owner_name: string;
    phone: string;
    email?: string;
    chip: string;
    source: string;
    last_call_note: string | null;
    last_visit: string | null;
    notes: string;
  };
  highlighted: boolean;
  practiceName: string;
  slot: { id: string; pet: string; start_at: string } | null;
  anzeige: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const ids = patientContactFieldIds(p.id);
  const lock = anzeigeControl(anzeige);
  const stamp = `${p.id}-${p.owner_name}-${p.phone}-${p.email ?? ""}-${p.species}-${p.chip}-${p.notes}`;

  const confirmHref =
    slot && p.phone
      ? walkInConfirmHref({
          phone: p.phone,
          pet: p.name,
          owner: p.owner_name,
          startAt: slot.start_at,
          practiceName,
        })
      : "";
  const confirmSms =
    slot && p.phone
      ? walkInConfirmSmsHref({
          phone: p.phone,
          pet: p.name,
          owner: p.owner_name,
          startAt: slot.start_at,
          practiceName,
        })
      : "";
  const confirmMail = slot
    ? walkInConfirmMailHref({
        pet: p.name,
        owner: p.owner_name,
        startAt: slot.start_at,
        practiceName,
        email: p.email,
      })
    : "";

  function confirmSlot(channel: "whatsapp" | "sms" | "mail" | "") {
    if (!slot) return;
    if (anzeige) {
      toast.error(anzeigeControl(true).title);
      return;
    }
    void updateAppointmentStatus({ data: { id: slot.id, status: "bestätigt" } })
      .then((res) => {
        if (!res.ok) {
          toast.error("error" in res && res.error ? res.error : "Termin nicht bestätigt.");
          return;
        }
        toast.success(confirmDraftToast(channel));
        void router.invalidate();
      })
      .catch(() => toast.error("Termin nicht bestätigt."));
  }

  function saveFromDom() {
    if (anzeige) {
      toast.error(anzeigeControl(true).title);
      return;
    }
    const get = (id: string) =>
      (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? "";
    const next = patientContactFromFields(get, ids);
    setBusy(true);
    void updatePatientContact({
      data: {
        id: p.id,
        owner: next.owner,
        phone: next.phone,
        email: next.email,
        species: next.species,
        chip: next.chip,
        notes: next.notes,
      },
    })
      .then((res) => {
        if (!res.ok) {
          toast.error(
            "error" in res && res.error
              ? res.error
              : "Akte nicht gespeichert. Halterin braucht mindestens zwei Zeichen.",
          );
          return;
        }
        toast.success("Akte gespeichert.");
        void router.invalidate();
      })
      .catch(() => toast.error("Akte nicht gespeichert."))
      .finally(() => setBusy(false));
  }

  return (
    <li
      id={`akte-${p.id}`}
      className={cn(
        "rounded-xl border bg-card p-4",
        highlighted ? "border-primary/40 ring-1 ring-inset ring-primary/30" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">{p.name}</h2>
        <Badge variant="outline">{p.source === "kassa" ? "Tafel" : "Telefon"}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{displayOwner(p.owner_name) || "Klientel"}</p>
      {p.last_call_note || p.last_visit ? (
        <p className="mt-3 text-sm leading-snug">{p.last_call_note || p.last_visit}</p>
      ) : null}
      <div className="mt-4 flex flex-col gap-3">
        {akteFelderVisible(anzeige) ? (
          <>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.species}>Art</Label>
          <Input
            id={ids.species}
            key={`sp-${stamp}`}
            defaultValue={p.species}
            placeholder="Hund, Katze, …"
            autoComplete="off"
            maxLength={40}
            disabled={lock.disabled}
            title={lock.title}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.chip}>Chip</Label>
          <Input
            id={ids.chip}
            key={`ch-${stamp}`}
            defaultValue={p.chip}
            placeholder="15 Ziffern"
            inputMode="numeric"
            autoComplete="off"
            maxLength={19}
            className="font-mono tabular-nums"
            disabled={lock.disabled}
            title={lock.title}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.owner}>Halterin</Label>
          <Input
            id={ids.owner}
            key={`o-${stamp}`}
            required
            minLength={2}
            defaultValue={p.owner_name}
            autoComplete="off"
            disabled={lock.disabled}
            title={lock.title}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.phone}>{HALTERIN_PHONE_LABEL}</Label>
          <Input
            id={ids.phone}
            key={`ph-${stamp}`}
            defaultValue={p.phone}
            placeholder={WALK_IN_PLACEHOLDERS.phone}
            inputMode="tel"
            autoComplete="off"
            disabled={lock.disabled}
            title={lock.title}
          />
          <p id={`${ids.phone}-hint`} className="text-xs text-muted-foreground">
            {HALTERIN_PHONE_HINT}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.email}>E-Mail der Halterin</Label>
          <Input
            id={ids.email}
            key={`em-${stamp}`}
            defaultValue={p.email ?? ""}
            placeholder={AKTE_EMAIL_PLACEHOLDER}
            type="email"
            inputMode="email"
            autoComplete="off"
            disabled={lock.disabled}
            title={lock.title}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.notes}>Hinweis der Tierarzthelferin</Label>
          <Textarea
            id={ids.notes}
            key={`no-${stamp}`}
            defaultValue={p.notes}
            placeholder="Nur nachmittags, bissig in der Box"
            className="min-h-20"
            maxLength={400}
            disabled={lock.disabled}
            title={lock.title}
          />
        </div>
          </>
        ) : (
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Art</dt>
              <dd id={`akte-anzeige-species-${p.id}`}>{p.species.trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Chip</dt>
              <dd id={`akte-anzeige-chip-${p.id}`} className="font-mono tabular-nums">
                {p.chip.trim() || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Halterin</dt>
              <dd id={`akte-anzeige-owner-${p.id}`}>{displayOwner(p.owner_name) || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{HALTERIN_PHONE_LABEL}</dt>
              <dd id={`akte-anzeige-phone-${p.id}`}>{p.phone.trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">E-Mail der Halterin</dt>
              <dd id={`akte-anzeige-email-${p.id}`}>{(p.email ?? "").trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Hinweis der Tierarzthelferin</dt>
              <dd id={`akte-anzeige-notes-${p.id}`}>{p.notes.trim() || "—"}</dd>
            </div>
          </dl>
        )}
        <div className="flex flex-wrap gap-2">
          {akteContactSaveVisible(anzeige) ? (
          <Button
            id={ids.save}
            type="button"
            size="sm"
            disabled={busy || lock.disabled}
            title={lock.title}
            onClick={saveFromDom}
          >
            {busy ? "Speichert…" : "Kontakt speichern"}
          </Button>
          ) : null}
          {akteContactSaveVisible(anzeige) && confirmHref ? (
            <DeskDraftButton
              id={`akte-wa-bestaetigung-${p.id}`}
              href={confirmHref}
              size="sm"
              disabled={anzeigeControl(anzeige).disabled}
              title={anzeigeControl(anzeige).title}
              onAct={() => confirmSlot("whatsapp")}
            >
              WhatsApp-Bestätigung an die Halterin
            </DeskDraftButton>
          ) : null}
          {akteContactSaveVisible(anzeige) && confirmSms ? (
            <DeskDraftButton
              id={`akte-sms-bestaetigung-${p.id}`}
              href={confirmSms}
              size="sm"
              variant="outline"
              newTab={false}
              disabled={anzeigeControl(anzeige).disabled}
              title={anzeigeControl(anzeige).title}
              onAct={() => confirmSlot("sms")}
            >
              SMS-Bestätigung an die Halterin
            </DeskDraftButton>
          ) : null}
          {akteContactSaveVisible(anzeige) && confirmMail ? (
            <DeskDraftButton
              id={`akte-mail-bestaetigung-${p.id}`}
              href={confirmMail}
              size="sm"
              variant="outline"
              newTab={false}
              disabled={anzeigeControl(anzeige).disabled}
              title={anzeigeControl(anzeige).title}
              onAct={() => confirmSlot("mail")}
            >
              E-Mail-Bestätigung an die Halterin
            </DeskDraftButton>
          ) : null}
          <HalterinReach
            openId={`akte-reach-${p.id}`}
            ownerPhone={p.phone}
            ownerEmail={p.email}
            mailSubject={ownerReachMailSubject(p.name, practiceName, p.owner_name)}
            body={ownerReachBody({
              pet: p.name,
              caller: p.owner_name,
              practiceName,
              kind: "akte",
            })}
          />
        </div>
      </div>
    </li>
  );
}
