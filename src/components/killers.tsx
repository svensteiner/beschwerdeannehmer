import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NACHTDIENSTE } from "@/lib/alma/data";
import {
  DESK_WERKZEUGE_ANRUFEN_ID,
  sprechenPublicNavTo,
} from "@/lib/practice/tafel-anzeige";
import {
  deskStatus,
  formatSlot,
  nextOpenSlot,
  viennaNow,
} from "@/lib/alma/hours";
import { PATIENTS, lookupPatient } from "@/lib/alma/patients";
import { cn } from "@/lib/utils";

export function LunchBanner() {
  const status = deskStatus();
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        status.code === "mittag" ||
          status.code === "feiertag" ||
          status.code === "sonntag"
          ? "border-ok/30 bg-ok/8"
          : "border-border bg-card",
      )}
    >
      <p className="font-medium">{status.label}</p>
      <p className="text-muted-foreground">{status.detail}</p>
    </div>
  );
}

export function ChipLookup() {
  const [q, setQ] = useState("");
  const hit = useMemo(() => lookupPatient(q), [q]);
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
        Heimtierdatenbank
      </p>
      <h3 className="mt-1 font-display text-2xl font-semibold">
        Chip nachschlagen
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Hunde seit 2010 pflicht. Silvia liest die Akte vor – sie ist kein Amt.
      </p>
      <Input
        className="mt-4"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Chip oder Name – z. B. Fritz"
        inputMode="text"
      />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {PATIENTS.map((p) => (
          <button
            key={p.chip}
            type="button"
            className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-secondary"
            onClick={() => setQ(p.chip)}
          >
            {p.name}
          </button>
        ))}
      </div>
      {q && !hit ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Nichts gefunden. Silvia legt die Nummer neu an und fragt beim Anruf
          nach dem Namen.
        </p>
      ) : null}
      {hit ? (
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground uppercase">Tier</dt>
            <dd className="font-medium">
              {hit.name} · {hit.breed}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground uppercase">Halter</dt>
            <dd className="font-medium">{hit.owner}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground uppercase">Chip</dt>
            <dd className="font-mono tabular-nums">{hit.chip}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground uppercase">
              Register
            </dt>
            <dd className="font-medium">
              {hit.registered ? "Heimtierdatenbank ja" : "Meldung fehlt"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground uppercase">
              Impfung / Tollwut
            </dt>
            <dd>
              {hit.lastVaccine} · Tollwut {hit.rabies}
            </dd>
          </div>
          {hit.lastVisit ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground uppercase">
                Letzter Besuch
              </dt>
              <dd>{hit.lastVisit}</dd>
            </div>
          ) : null}
          <p className="sm:col-span-2 text-muted-foreground">{hit.notes}</p>
        </dl>
      ) : null}
    </div>
  );
}

const DESTINATIONS = [
  {
    id: "hr",
    land: "Kroatien",
    extra:
      "Tollwut aktuell, EU-Ausweis. Bandwurm nur wenn der Campingplatz es verlangt.",
  },
  {
    id: "it",
    land: "Italien",
    extra: "Tollwut und EU-Ausweis. Maulkorb in manchen Zügen.",
  },
  { id: "hu", land: "Ungarn", extra: "Tollwut und EU-Ausweis. Chip lesbar." },
  { id: "si", land: "Slowenien", extra: "Tollwut und EU-Ausweis." },
] as const;

export function ReiseCheck({ anzeige = false }: { anzeige?: boolean }) {
  const [dest, setDest] = useState<(typeof DESTINATIONS)[number]>(
    DESTINATIONS[0],
  );
  const [name, setName] = useState("Wastl");
  const pet = lookupPatient(name);
  const rabiesOk = pet
    ? !/fehlt|nicht nötig für wohnung/i.test(pet.rabies)
    : false;
  const pass = Boolean(pet?.registered && rabiesOk);
  const slot = formatSlot(nextOpenSlot(viennaNow()));
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
        EU-Heimtierausweis
      </p>
      <h3 className="mt-1 font-display text-2xl font-semibold">Reise-Check</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Silvia diagnostiziert nicht. Sie sagt, was für die Grenze fehlt, und
        legt den Slot.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {DESTINATIONS.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setDest(d)}
            className={cn(
              "min-h-11 rounded-lg border px-3 text-sm",
              dest.id === d.id
                ? "border-primary bg-secondary"
                : "border-border hover:bg-secondary/60",
            )}
          >
            {d.land}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {PATIENTS.map((p) => (
          <button
            key={p.chip}
            type="button"
            onClick={() => setName(p.name)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs",
              name === p.name
                ? "border-primary bg-secondary"
                : "border-border hover:bg-secondary",
            )}
          >
            {p.name}
          </button>
        ))}
      </div>
      <div
        className={cn(
          "mt-4 rounded-lg border px-4 py-3 text-sm",
          pass ? "border-ok/30 bg-ok/8" : "border-warn/30 bg-warn/8",
        )}
      >
        <p className="font-medium">
          {pet?.name ?? name} nach {dest.land}:{" "}
          {pass ? "passt grob" : "es fehlt etwas"}
        </p>
        <p className="mt-1 text-muted-foreground">{dest.extra}</p>
        {pet ? (
          <p className="mt-1 text-muted-foreground">
            Register {pet.registered ? "ja" : "nein"} · Tollwut {pet.rabies}.
          </p>
        ) : null}
        <p className="mt-2">
          Nächster Slot bei der Frau Doktor:{" "}
          <span className="font-medium">{slot}</span>
        </p>
      </div>
      <Button className="mt-4" asChild>
        <Link id={DESK_WERKZEUGE_ANRUFEN_ID} to={sprechenPublicNavTo(anzeige)}>
          Silvia anrufen und legen
        </Link>
      </Button>
    </div>
  );
}

export function NightBoard() {
  const [land, setLand] = useState(NACHTDIENSTE[0]?.land ?? "Wien");
  const hit = NACHTDIENSTE.find((n) => n.land === land) ?? NACHTDIENSTE[0];
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
        Neun Länder
      </p>
      <h3 className="mt-1 font-display text-2xl font-semibold">Nachtdienst</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Silvia kennt den hinterlegten Dienst – nicht eine deutsche Bandansage.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {NACHTDIENSTE.map((n) => (
          <button
            key={n.land}
            type="button"
            onClick={() => setLand(n.land)}
            className={cn(
              "min-h-11 rounded-lg border px-3 text-sm",
              land === n.land
                ? "border-primary bg-secondary"
                : "border-border hover:bg-secondary/60",
            )}
          >
            {n.land}
          </button>
        ))}
      </div>
      {hit ? (
        <div className="mt-4">
          <p className="font-display text-xl">{hit.place}</p>
          <p className="text-sm text-muted-foreground">{hit.detail}</p>
        </div>
      ) : null}
    </div>
  );
}
