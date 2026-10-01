import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function AlmaMark({
  className,
  onDark = false,
  mark = "box",
}: {
  className?: string;
  onDark?: boolean;
  mark?: "box" | "dot";
}) {
  if (mark === "dot") {
    return (
      <Link
        to="/"
        className={cn("flex items-baseline gap-[7px] no-underline", className)}
        aria-label="Silvia Startseite"
      >
        <span
          className={cn(
            "font-display text-[23px] font-semibold tracking-[-0.02em]",
            onDark ? "text-[#F3EFE6]" : "text-foreground",
          )}
        >
          Silvia
        </span>
        <span
          className={cn(
            "mb-[3px] inline-block size-1.5 rounded-full",
            onDark ? "bg-[#8FD3AE]" : "bg-primary",
          )}
          aria-hidden
        />
      </Link>
    );
  }
  return (
    <Link
      to="/"
      className={cn("flex items-center gap-2.5 no-underline", className)}
      aria-label="Silvia Startseite"
    >
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-sm font-display text-sm font-semibold",
          onDark
            ? "bg-primary-foreground text-primary"
            : "bg-primary text-primary-foreground",
        )}
      >
        S
      </span>
      <span
        className={cn(
          "font-display text-xl font-semibold tracking-tight",
          onDark ? "text-primary-foreground" : "text-foreground",
        )}
      >
        Silvia
      </span>
    </Link>
  );
}
