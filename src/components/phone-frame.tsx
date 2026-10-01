import { type ReactNode } from "react";
import { PRACTICE } from "@/lib/alma/data";
import { cn } from "@/lib/utils";

export function Waveform({ className }: { className?: string }) {
  return (
    <span className={cn("alma-wave", className)} aria-hidden>
      <span />
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}
export function PhoneShell({
  children,
  footer,
  className,
  line = PRACTICE.phone,
  tone = "night",
}: {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  line?: string;
  tone?: "night" | "desk";
}) {
  const desk = tone === "desk";
  return (
    <div
      className={cn(
        "flex w-full flex-col overflow-hidden",
        desk
          ? "max-w-none bg-card text-foreground"
          : "max-w-[22rem] rounded-xl border border-primary/20 bg-night text-night-foreground shadow-soft",
        className,
      )}
    >
      {desk ? null : (
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <span className="text-xs font-medium tracking-wider uppercase opacity-70">
            Silvia
          </span>
          <span className="size-1.5 rounded-full bg-ok alma-pulse" />
          <span className="text-xs tabular-nums opacity-70">{line}</span>
        </div>
      )}
      <div
        className={cn(
          "min-h-0 flex-1",
          desk ? "px-[18px] pt-5 pb-4" : "px-4 pb-4",
        )}
      >
        {children}
      </div>
      {footer ? (
        <div
          className={cn(
            desk
              ? "border-t border-border px-[18px] py-3"
              : "border-t border-night-foreground/10 px-4 py-3",
          )}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}
