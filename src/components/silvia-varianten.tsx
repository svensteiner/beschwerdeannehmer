import { useEffect, useId, useRef, useState } from "react";
import { clearAudioPreview, startAudioPreview } from "@/lib/alma/audio-preview";
import { cn } from "@/lib/utils";
import { SILVIA_PAKETE } from "@/lib/silvia-pakete";

/** Comparison samples; listening never changes the active conversation voice. */
export function SilviaVarianten({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const audios = useRef<Array<HTMLAudioElement | null>>([]);
  const headingId = useId();
  const [audioErrors, setAudioErrors] = useState<Record<string, boolean>>({});

  // Ein <audio preload="metadata"> kann schon vor React-Hydration mit einem
  // Fehler enden. Den nativen Zustand beim Einhängen einmal übernehmen und
  // die Elemente für das spätere Unmount sichern: Callback-Refs sind dann
  // möglicherweise bereits auf null gesetzt.
  useEffect(() => {
    const ownedAudios = [...audios.current];
    setAudioErrors((current) => {
      let changed = false;
      const next = { ...current };
      for (const [index, variant] of SILVIA_PAKETE.entries()) {
        if (ownedAudios[index]?.error && !next[variant.id]) {
          next[variant.id] = true;
          changed = true;
        }
      }
      return changed ? next : current;
    });
    return () => {
      for (const audio of ownedAudios) {
        audio?.pause();
        clearAudioPreview(audio);
      }
    };
  }, []);

  return (
    <section className={cn("mt-8", className)} aria-labelledby={headingId}>
      <h2 id={headingId} className="text-xl font-semibold">
        Welche Silvia möchten Sie?
      </h2>
      <div
        className={cn(
          "mt-4 grid gap-4",
          compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2",
        )}
      >
        {SILVIA_PAKETE.map((variant, index) => (
          <div
            key={variant.id}
            className="rounded-lg border border-border/70 bg-card/60 p-4"
          >
            <p className="font-semibold">{variant.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {variant.description}
            </p>
            <audio
              ref={(audio) => {
                audios.current[index] = audio;
              }}
              className="mt-3 w-full"
              controls
              preload="metadata"
              src={variant.audioSrc}
              aria-label={`${variant.name} Hörprobe`}
              onPlay={(event) => startAudioPreview(event.currentTarget)}
              onPause={(event) => clearAudioPreview(event.currentTarget)}
              onEnded={(event) => clearAudioPreview(event.currentTarget)}
              onError={() => setAudioErrors((current) => ({ ...current, [variant.id]: true }))}
              onLoadedMetadata={() => setAudioErrors((current) => ({ ...current, [variant.id]: false }))}
            >
              Ihr Browser unterstützt keine Audio-Wiedergabe.
            </audio>
            <p className="mt-3 text-xs text-muted-foreground">{variant.status}</p>
            {variant.usageNotice ? (
              <p className="mt-2 text-sm text-muted-foreground">{variant.usageNotice}</p>
            ) : null}
            {audioErrors[variant.id] ? (
              <p role="alert" className="mt-2 text-sm text-destructive">Die Hörprobe konnte nicht geladen werden. Bitte laden Sie die Seite erneut.</p>
            ) : null}
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Beide Hörproben sind vorbereitete Aufnahmen. Premium hören Sie mit der
        lokal erzeugten Stimme für echte Praxisgespräche. Die Live-Aufnahme mit
        Marin zeigt die separate GPT-Live-1-Demo; interaktives Unterbrechen gibt
        es nur isoliert, nach Freigabe und mit erfundenen Inhalten.
        Eine neue Hörprobe beendet die vorherige Wiedergabe.
      </p>
    </section>
  );
}
