import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { DESK_SCROLL_MT } from "@/lib/practice/desk-chrome";
import {
  HEUTE_VQUADRAT_ANZEIGE_ID,
  HEUTE_VQUADRAT_SPIEGEL_ID,
  SETTINGS_VQUADRAT_ANZEIGE_ID,
  SETTINGS_VQUADRAT_SPIEGEL_ID,
  VQUADRAT_SPIEGEL_ANZEIGE,
  VQUADRAT_SPIEGEL_TITLE,
  VQUADRAT_SPIEGEL_WALKIN,
  vquadratSpiegelAkteLabel,
  vquadratSpiegelEmptyCopy,
  vquadratSpiegelLead,
  vquadratSpiegelWriteVisible,
} from "@/lib/practice/tafel-anzeige";
import { spiegelRowLine, type PraxissoftwareSpiegelRow } from "@/lib/practice/vquadrat/spiegel-row";
import { cn } from "@/lib/utils";

export function VquadratSpiegelCard({
  prefix,
  rows,
  anzeige,
}: {
  prefix: "heute" | "settings";
  rows: PraxissoftwareSpiegelRow[];
  anzeige?: boolean;
}) {
  const cardId = prefix === "heute" ? HEUTE_VQUADRAT_SPIEGEL_ID : SETTINGS_VQUADRAT_SPIEGEL_ID;
  const leerId = `${prefix}-vquadrat-leer`;
  const leadId = `${prefix}-vquadrat-lead`;
  const titleId = `${prefix}-vquadrat-title`;
  const walkInId = `${prefix}-vquadrat-walkin`;
  const akteId = `${prefix}-vquadrat-akte`;
  const settingsId = `${prefix}-vquadrat-settings`;
  const anzeigeId = prefix === "heute" ? HEUTE_VQUADRAT_ANZEIGE_ID : SETTINGS_VQUADRAT_ANZEIGE_ID;
  const write = vquadratSpiegelWriteVisible(anzeige);

  return (
    <section id={cardId} className={cn(DESK_SCROLL_MT, "mt-6 rounded-xl border border-flag/40 bg-card p-4")}>
      <p id={titleId} className="font-medium">
        {VQUADRAT_SPIEGEL_TITLE}
      </p>
      <p id={leadId} className="mt-1 text-sm text-muted-foreground">
        {vquadratSpiegelLead(anzeige)}
      </p>
      {write ? null : (
        <p id={anzeigeId} className="mt-3 text-sm text-foreground">
          {VQUADRAT_SPIEGEL_ANZEIGE}
        </p>
      )}
      {rows.length === 0 ? (
        <p id={leerId} className="mt-3 text-sm text-muted-foreground">
          {vquadratSpiegelEmptyCopy(anzeige)}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-background">
          {rows.map((row) => (
            <li key={row.id} id={`${prefix}-vquadrat-zeile-${row.id}`} className="px-3 py-2 text-sm">
              <p className="font-medium">{spiegelRowLine(row)}</p>
              {row.phone || row.email ? (
                <p className="text-muted-foreground">
                  {[row.phone, row.email].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {write ? (
          prefix === "heute" ? (
            <Button size="lg" asChild>
              <a id={walkInId} href="#heute-walkin">
                {VQUADRAT_SPIEGEL_WALKIN}
              </a>
            </Button>
          ) : (
            <Button size="lg" asChild>
              <Link id={walkInId} to="/app" hash="heute-walkin">
                {VQUADRAT_SPIEGEL_WALKIN}
              </Link>
            </Button>
          )
        ) : null}
        <Button size="lg" variant={write ? "outline" : "default"} asChild>
          <Link id={akteId} to="/app/akte">
            {vquadratSpiegelAkteLabel(anzeige)}
          </Link>
        </Button>
        {prefix === "heute" ? (
          <Button size="lg" variant="outline" asChild>
            <Link id={settingsId} to="/app/einstellungen" hash="settings-vquadrat-spiegel">
              In den Einstellungen
            </Link>
          </Button>
        ) : null}
      </div>
    </section>
  );
}
