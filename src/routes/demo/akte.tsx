import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADDON_AKTE, FAQS } from "@/lib/alma/data";
import { PATIENTS, type Patient } from "@/lib/alma/patients";
import { useAlmaStore } from "@/lib/alma/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/demo/akte")({ component: AktePage });

function AktePage() {
  const edition = useAlmaStore((s) => s.edition);
  const setEdition = useAlmaStore((s) => s.setEdition);
  const extra = useAlmaStore((s) => s.kbPatients);
  const addKb = useAlmaStore((s) => s.addKbPatient);
  const extraKeys = new Set(extra.flatMap((p) => [p.name.toLowerCase(), p.chip]));
  const all = [
    ...extra,
    ...PATIENTS.filter((p) => !extraKeys.has(p.name.toLowerCase()) && !extraKeys.has(p.chip)),
  ];
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("Katze");
  const [owner, setOwner] = useState("");
  const [notes, setNotes] = useState("");
  const on = edition === "akte";

  function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !owner.trim()) return;
    const p: Patient = {
      chip: `0400${String(Date.now()).slice(-11)}`,
      name: name.trim(),
      species,
      breed: "",
      born: "",
      owner: owner.trim(),
      phone: "",
      lastVaccine: "offen",
      rabies: "offen",
      registered: false,
      notes: notes.trim(),
      warnings: "Neu in der Kartei, von der Tierarzthelferin nachgetragen.",
    };
    addKb(p);
    toast.success(`${p.name} steht in der Akte. Rufen Sie an und fragen Sie nach.`);
    setName("");
    setOwner("");
    setNotes("");
  }

  return (
    <div className="p-4 sm:p-8">
      <p className="text-xs font-medium tracking-[0.16em] text-primary uppercase">Praxissoftware-Anbindung</p>
      <h1 className="mt-1 font-display text-3xl font-semibold">Akte-Demo mit Beispieldaten</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        {ADDON_AKTE.tagline} {ADDON_AKTE.monthlyText} Ohne Akte ist Silvia eine gute Rezeption.
        Mit Akte kennt sie Fritz.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
        <button
          type="button"
          onClick={() => setEdition(on ? "standard" : "akte")}
          className={cn(
            "min-h-11 rounded-lg px-4 text-sm font-medium",
            on ? "bg-ok text-primary-foreground" : "bg-secondary text-foreground",
          )}
        >
          {on ? "Sonderedition an" : "Standard – Akte aus"}
        </button>
        <p className="text-sm text-muted-foreground">
          {on
            ? "Silvia liest aus der Kartei. Fragen Sie nach Fritz."
            : "Namen kennt sie nicht. Schalten Sie die Akte ein, und rufen Sie nochmal an."}
        </p>
      </div>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {all.map((p) => (
          <li key={p.chip} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">
                {p.name} · {p.species}
              </p>
              {p.lastCallAt ? (
                <span className="rounded-full bg-ok/15 px-2 py-0.5 text-[11px] text-ok">
                  aus dem Telefonat
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">{p.owner}</p>
            <p className="mt-2 font-mono text-xs tabular-nums">{p.chip}</p>
            {p.lastCallNote ? (
              <p className="mt-2 text-sm">„{p.lastCallNote}“</p>
            ) : p.lastVisit ? (
              <p className="mt-2 text-sm">{p.lastVisit}</p>
            ) : null}
            {p.warnings ? <p className="mt-1 text-sm text-muted-foreground">{p.warnings}</p> : null}
          </li>
        ))}
      </ul>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold">Was Silvia auswendig kann</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Wie die offenen Rezeptions-Repos: nicht nur Patienten, auch die Fragen der Leitung.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {FAQS.map((f) => (
            <li key={f.q} className="rounded-xl border border-border bg-card p-4">
              <p className="font-medium">{f.q}</p>
              <p className="mt-1 text-sm text-muted-foreground">{f.a}</p>
            </li>
          ))}
        </ul>
      </section>

      <form onSubmit={add} className="mt-10 max-w-lg space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-xl font-semibold">Tier nachtragen</h2>
        <p className="text-sm text-muted-foreground">
          Wie die Tierarzthelferin einen Zettel hinterlegt. Danach in der Leitung nach dem Namen fragen.
        </p>
        <div>
          <Label htmlFor="n">Name</Label>
          <Input id="n" value={name} onChange={(e) => setName(e.target.value)} placeholder="Luzi" />
        </div>
        <div>
          <Label htmlFor="s">Art</Label>
          <Input id="s" value={species} onChange={(e) => setSpecies(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="o">Halter</Label>
          <Input id="o" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Frau Moser" />
        </div>
        <div>
          <Label htmlFor="h">Hinweis der Tierarzthelferin</Label>
          <Input
            id="h"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Nur nachmittags, bissig in der Box"
          />
        </div>
        <Button type="submit" disabled={!on}>
          In die Akte
        </Button>
        {!on ? (
          <p className="text-xs text-muted-foreground">Erst die Sonderedition einschalten.</p>
        ) : null}
      </form>

      <Button className="mt-8" asChild>
        <Link to="/sprechen" search={{ mode: undefined }}>Anrufen und nach Fritz fragen</Link>
      </Button>
    </div>
  );
}
