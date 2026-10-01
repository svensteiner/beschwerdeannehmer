import {
  createFileRoute,
  getRouteApi,
  Link,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { forgetPracticeFact, rememberPracticeFact } from "@/lib/practice/facts";
import {
  loadPracticeProfile,
  savePracticeBehavior,
} from "@/lib/practice/profile";
import { isInhaberin } from "@/lib/practice/staff-role";
import { anzeigeControl } from "@/lib/practice/tafel-anzeige";

const appRoute = getRouteApi("/app");

export const Route = createFileRoute("/app/training")({
  loader: () => loadPracticeProfile(),
  component: TrainingPage,
});

function TrainingPage() {
  const loaded = Route.useLoaderData();
  const board = appRoute.useLoaderData();
  const router = useRouter();
  const anzeige = Boolean(board.ok && board.anzeige);
  const lock = anzeigeControl(anzeige);
  const profile = loaded.ok ? loaded.profile : null;
  const facts = loaded.ok ? loaded.facts : [];
  const selfRole = loaded.ok
    ? loaded.staff.find((row) => row.self)?.role
    : undefined;
  const canEditBehavior = isInhaberin(selfRole);
  const [fact, setFact] = useState("");
  const [behavior, setBehavior] = useState(profile?.behavior ?? "");
  const [factBusy, setFactBusy] = useState(false);
  const [behaviorBusy, setBehaviorBusy] = useState(false);

  if (!profile) {
    return (
      <main className="p-4 sm:p-8">
        <h1 className="font-display text-3xl font-semibold">Training</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ordination nicht gefunden.
        </p>
      </main>
    );
  }

  function refresh() {
    void router.invalidate();
  }

  function remember() {
    if (factBusy || !fact.trim()) return;
    setFactBusy(true);
    void rememberPracticeFact({ data: { fact } })
      .then((result) => {
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(
          result.duplicate
            ? "Diesen Hinweis kannte Silvia schon."
            : "Hinweis gespeichert.",
        );
        setFact("");
        refresh();
      })
      .catch(() => toast.error("Hinweis nicht gespeichert."))
      .finally(() => setFactBusy(false));
  }

  function forget(id: string, expectedFact: string) {
    void forgetPracticeFact({ data: { id, expectedFact } })
      .then((result) => {
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Hinweis gelöscht.");
        refresh();
      })
      .catch(() => toast.error("Hinweis nicht gelöscht."));
  }

  function saveBehavior() {
    if (behaviorBusy || !canEditBehavior) return;
    setBehaviorBusy(true);
    void savePracticeBehavior({ data: { behavior } })
      .then((result) => {
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Ton und Verhalten gespeichert.");
        refresh();
      })
      .catch(() => toast.error("Ton und Verhalten wurden nicht gespeichert."))
      .finally(() => setBehaviorBusy(false));
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-8">
      <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
        Training
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold">
        Silvia Schritt für Schritt einlernen
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Hier pflegen Sie Praxiswissen, die Art zu sprechen und Wörter, die
        Silvia besser verstehen soll. Änderungen gelten für den nächsten Anruf,
        nicht rückwirkend für alte Gespräche.
      </p>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            Praxiswissen · sprechen
          </p>
          <h2 className="mt-2 font-display text-xl font-semibold">
            Was Silvia wissen soll
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Öffnungszeiten, Parkplatz, Abläufe, Ausnahmen und die Begrüßung.
            Sprechen Sie einen kurzen Hinweis wie „Bei der Begrüßung sagen Sie
            Grüß Gott“. Zum Tippen nutzen Sie den Bereich direkt daneben –
            beides speichert dasselbe Praxiswissen.
          </p>
          <Button className="mt-4" variant="outline" asChild>
            <Link to="/sprechen" search={{ training: "wissen" }}>
              Wissen oder Begrüßung sprechen
            </Link>
          </Button>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            Praxiswissen · tippen
          </p>
          <h2 className="mt-2 font-display text-xl font-semibold">
            Regeln und Besonderheiten
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Hinterlegen Sie kurze, eindeutige Regeln – etwa zu Terminen,
            Impfungen oder Parken.
          </p>
          <Textarea
            className="mt-4"
            value={fact}
            disabled={lock.disabled}
            title={lock.title}
            onChange={(event) => setFact(event.target.value)}
            placeholder="z. B. Mittwoch nur Kastrationen."
          />
          <Button
            className="mt-3"
            variant="outline"
            disabled={factBusy || lock.disabled || !fact.trim()}
            onClick={remember}
          >
            {factBusy ? "Speichert …" : "Hinweis speichern"}
          </Button>
          <p className="mt-4 text-xs text-muted-foreground">
            Gespeicherte Hinweise: {facts.length} von 40
          </p>
          <ul className="mt-2 grid gap-2">
            {facts.length ? (
              facts.map((row) => (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span>{row.fact}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={lock.disabled}
                    title={lock.title}
                    onClick={() => forget(row.id, row.fact)}
                  >
                    Löschen
                  </Button>
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">
                Noch keine Praxisregel hinterlegt.
              </li>
            )}
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            Verhalten
          </p>
          <h2 className="mt-2 font-display text-xl font-semibold">
            Wie Silvia auftreten soll
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Legen Sie Ton, Gesprächsregeln und Tabus fest – etwa „Sie-Form“,
            „kurz antworten“ oder „keine Kosten zusagen“. Dieser Bereich ist
            bewusst nur für die Inhaberin freigegeben.
          </p>
          <Textarea
            className="mt-4 min-h-32"
            value={behavior}
            disabled={!canEditBehavior || lock.disabled}
            title={
              !canEditBehavior
                ? "Nur die Inhaberin kann Ton und Verhalten ändern."
                : lock.title
            }
            onChange={(event) => setBehavior(event.target.value)}
            placeholder="z. B. Ruhig, freundlich und knapp. Keine Kosten zusagen."
          />
          <Button
            className="mt-3"
            variant="outline"
            disabled={behaviorBusy || !canEditBehavior || lock.disabled}
            onClick={saveBehavior}
          >
            {behaviorBusy ? "Speichert …" : "Ton und Verhalten speichern"}
          </Button>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            Spracherkennung
          </p>
          <h2 className="mt-2 font-display text-xl font-semibold">
            Spracherkennung trainieren
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Sprechen Sie mit Silvia. Sie antwortet auf Ihre Hinweise und Fragen.
            Hat sie etwas falsch verstanden, wählen Sie an der letzten
            Gesprächszeile „Korrigieren“ und berichtigen den Text.
          </p>
          <Button className="mt-4" variant="outline" asChild>
            <Link to="/sprechen" search={{ training: "sprache" }}>
              Sprachtraining starten
            </Link>
          </Button>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            Sicher testen
          </p>
          <h2 className="mt-2 font-display text-xl font-semibold">
            Wie einen echten Anruf testen
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Fragen Sie Silvia nach einer gespeicherten Regel. Dieser Test legt
            keine Akte, keinen Termin und kein Protokoll an.
          </p>
          <Button className="mt-4" variant="outline" asChild>
            <Link to="/sprechen" search={{ mode: undefined, test: "ja" }}>
              Testanruf starten
            </Link>
          </Button>
        </section>
      </div>
    </main>
  );
}
