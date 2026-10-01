import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { draftOpensInNewTab } from "@/lib/practice/desk-draft";

/** Status action that also opens a wa.me / sms: / mailto: draft in the same click (no popup blocker).
 *  Empty href is not a silent status button — without Handy, E-Mail-Bestätigung confirms. */
export function DeskDraftButton({
  href,
  children,
  onAct,
  variant = "default",
  size = "sm",
  newTab,
  id,
  disabled,
  title,
}: {
  href: string;
  children: ReactNode;
  onAct: () => void;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "default";
  /** Override. Default: WhatsApp (https) opens a tab; sms: / mailto: / tel: stay here. */
  newTab?: boolean;
  id?: string;
  disabled?: boolean;
  title?: string;
}) {
  if (!href) return null;
  if (disabled) {
    return (
      <Button id={id} type="button" size={size} variant={variant} disabled title={title}>
        {children}
      </Button>
    );
  }
  const openTab = newTab ?? draftOpensInNewTab(href);
  return (
    <Button size={size} variant={variant} asChild>
      <a
        id={id}
        href={href}
        title={title}
        {...(openTab ? { target: "_blank", rel: "noreferrer" } : {})}
        onClick={onAct}
      >
        {children}
      </a>
    </Button>
  );
}
