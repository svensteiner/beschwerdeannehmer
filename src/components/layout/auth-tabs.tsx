import { Link } from "@tanstack/react-router";

/**
 * Umschalter Anmelden | Registrieren oben auf beiden Auth-Seiten — wie man es von
 * anderen Webseiten kennt, statt nur eines kleinen Links unter dem Formular.
 */
export function AuthTabs({ active }: { active: "login" | "registrieren" }) {
  const base = "flex-1 rounded-md px-3 py-2 text-center text-sm font-medium transition-colors";
  const on = "bg-background text-foreground shadow-sm";
  const off = "text-muted-foreground hover:text-foreground";
  return (
    <nav aria-label="Anmelden oder Registrieren" className="mb-6 flex rounded-lg bg-muted p-1">
      <Link to="/login" className={`${base} ${active === "login" ? on : off}`} aria-current={active === "login" ? "page" : undefined}>
        Anmelden
      </Link>
      <Link to="/registrieren" className={`${base} ${active === "registrieren" ? on : off}`} aria-current={active === "registrieren" ? "page" : undefined}>
        Registrieren
      </Link>
    </nav>
  );
}
