import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DESK_HOME_LOGIN_ID,
  DESK_HOME_REGISTER_ID,
} from "@/lib/practice/desk-storage";
import { loadDeskRegisterCta } from "@/lib/practice/holen-login-fn";

export function CloseRegisterCta() {
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    void loadDeskRegisterCta().then(setOpen);
  }, []);
  if (open === null) return null;
  return (
    <Button
      size="lg"
      variant="secondary"
      className="rounded-[3px] bg-primary-foreground text-primary hover:bg-primary-foreground/90"
      asChild
    >
      {open ? (
        <Link id={DESK_HOME_REGISTER_ID} to="/registrieren">
          Ordination eröffnen
        </Link>
      ) : (
        <Link id={DESK_HOME_LOGIN_ID} to="/login">
          Anmelden
        </Link>
      )}
    </Button>
  );
}

export function Kicker({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "mb-[18px] text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function Display({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <h2
      id={id}
      className={cn(
        "font-display text-[clamp(1.75rem,3.3vw,2.875rem)] font-semibold leading-[1.08] tracking-[-0.025em] text-pretty",
        className,
      )}
    >
      {children}
    </h2>
  );
}
