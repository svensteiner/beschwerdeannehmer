import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { statusAggregate } from "@/lib/practice/status";
import type { Ampel, ServiceCheck } from "@/lib/practice/status";
import { isInhaberin } from "@/lib/practice/staff-role";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/status")({
  loader: () => statusAggregate(),
  component: StatusPage,
});

const appRoute = getRouteApi("/app");

const STATUS_REFRESH_MS = 30_000;

function useStatusRefresh() {
  const router = useRouter();
  useEffect(() => {
    if (typeof document === "undefined") return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void router.invalidate();
    };
    const id = setInterval(tick, STATUS_REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);
}

function ampelDot(ampel: Ampel) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-3 rounded-full",
        ampel === "gruen" && "bg-emerald-500",
        ampel === "gelb" && "bg-amber-500",
        ampel === "rot" && "bg-red-500",
      )}
    />
  );
}

function ampelLabel(ampel: Ampel) {
  if (ampel === "gruen") return "In Ordnung";
  if (ampel === "gelb") return "Beobachten";
  return "Handeln";
}

function StatusRow({ check }: { check: ServiceCheck }) {
  return (
    <li id={`status-${check.id}`} className="flex items-start gap-3 rounded-lg border border-border p-3">
      {ampelDot(check.ampel)}
      <div className="min-w-0">
        <p className="font-medium">
          {check.label} <span className="text-sm text-muted-foreground">— {ampelLabel(check.ampel)}</span>
        </p>
        <p className="text-sm text-muted-foreground">{check.detail}</p>
        {check.technical ? (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-muted-foreground">Für den Techniker</summary>
            <p className="text-xs text-muted-foreground">{check.technical}</p>
          </details>
        ) : null}
      </div>
    </li>
  );
}

export const STATUS_BETRIEBSHANDBUCH_HINT =
  "Ein rotes Feld bleibt nicht von selbst stehen: siehe Betriebshandbuch, Abschnitt Störungen.";

function StatusPage() {
  useStatusRefresh();
  const { session } = appRoute.useRouteContext();
  const data = Route.useLoaderData();

  if (!isInhaberin(session.role)) {
    return (
      <div className="p-4 sm:p-8">
        <h1 className="font-display text-3xl font-semibold">Status</h1>
        <p className="mt-2 text-sm text-muted-foreground">Nur die Inhaberin sieht die Status-Seite.</p>
      </div>
    );
  }

  const all: ServiceCheck[] = [...data.services, data.storage, data.retention];
  const hasRot = all.some((c) => c.ampel === "rot");

  return (
    <div className="p-4 sm:p-8">
      <h1 className="font-display text-3xl font-semibold">Status</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Läuft alles, was Silvia für den Betrieb braucht. Aktualisiert sich alle 30 Sekunden von selbst.
      </p>
      {hasRot ? (
        <div id="status-betriebshandbuch-hint" className="mt-3 max-w-2xl rounded-lg border border-flag/40 bg-flag/10 p-3 text-sm text-flag">
          <p>Mindestens ein Feld unten braucht Hilfe.</p>
          <p className="mt-1">{STATUS_BETRIEBSHANDBUCH_HINT}</p>
          <button
            id="status-hilfe-anfordern"
            type="button"
            className="mt-2 rounded-md bg-flag px-3 py-1.5 font-medium text-white"
            onClick={() =>
              toast.info('Symbol „Hilfe" auf dem Bildschirm des Praxis-PCs doppelt anklicken.')
            }
          >
            Hilfe anfordern
          </button>
        </div>
      ) : null}
      <ul className="mt-6 flex max-w-2xl flex-col gap-3">
        {data.services.map((check) => (
          <StatusRow key={check.id} check={check} />
        ))}
        <StatusRow check={data.storage} />
        <StatusRow check={data.retention} />
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">
        Stand: {new Date(data.generatedAt).toLocaleTimeString("de-AT")}
      </p>
    </div>
  );
}
