import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/layout/site-footer";
import { COMPANY } from "@/lib/alma/data";
import { loadTafelAnzeigeFlag } from "@/lib/practice/holen-login-fn";
import {
  DESK_IMPRESSUM_ID,
  IMPRESSUM_MUSTER,
  IMPRESSUM_SCOPE,
} from "@/lib/practice/desk-legal";

export const Route = createFileRoute("/impressum")({
  loader: async () => ({ anzeige: await loadTafelAnzeigeFlag() }),
  component: ImpressumPage,
});

function ImpressumPage() {
  const { anzeige } = Route.useLoaderData();
  return (
    <SiteShell anzeige={anzeige}>
      <main id={DESK_IMPRESSUM_ID} className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <h1 className="font-display text-4xl font-semibold">Impressum</h1>
        <p className="mt-2 text-sm text-muted-foreground">Angaben gemäß § 5 ECG und § 14 UGB.</p>
        <div
          id="desk-impressum-muster"
          role="alert"
          className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {IMPRESSUM_MUSTER}
        </div>
        <dl className="mt-8 space-y-4 text-sm">
          <Row k="Firma" v={COMPANY.name} />
          <Row k="Sitz" v={`${COMPANY.street}, ${COMPANY.zip} ${COMPANY.city}`} />
          <Row k="Firmenbuch" v={`${COMPANY.fn}, ${COMPANY.court}`} />
          <Row k="UID" v={COMPANY.uid} />
          <Row k="Geschäftsführung" v={COMPANY.gf} />
          <Row k="Kammer" v={COMPANY.chamber} />
          <Row k="E-Mail" v={COMPANY.email} />
          <Row k="Telefon" v={COMPANY.phone} />
        </dl>
        <p className="mt-8 text-sm text-muted-foreground">{IMPRESSUM_SCOPE}</p>
      </main>
    </SiteShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{k}</dt>
      <dd className="mt-0.5">{v}</dd>
    </div>
  );
}
