import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/impressum")({ component: ImpressumPage });

function ImpressumPage() {
  return <main className="mx-auto max-w-2xl px-6 py-16"><a href="/">← Zurück</a><h1 className="mt-10 text-4xl font-semibold">Impressum</h1><p className="mt-2 text-sm text-muted-foreground">Angaben gemäß österreichischem Recht.</p><div className="mt-8 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Betreibername, ladungsfähige Anschrift, Firmenbuch-/UID-Angaben und Kontakt müssen vor dem Live-Betrieb ergänzt werden.</div></main>;
}
