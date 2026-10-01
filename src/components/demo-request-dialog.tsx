import {
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  BUNDESLAENDER,
  PMS_DEFAULT,
  PMS_HINT_ID,
  PMS_OPTIONS,
  PRAXISSOFTWARE_HINT,
} from "@/lib/alma/data";
import { submitLead } from "@/lib/practice/leads";
import type { Bundesland } from "@/lib/alma/types";
import { cn } from "@/lib/utils";
import { leadRequestForSnapshot } from "@/lib/practice/lead-request";
import type { VariantProps } from "class-variance-authority";

const EMPTY_DEMO_REQUEST = {
  practice: "",
  contact: "",
  email: "",
  phone: "",
  bundesland: "" as Bundesland | "",
  pms: PMS_DEFAULT,
  message: "",
};

type DemoRequestButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    children: ReactNode;
    /** Optionaler Produktwunsch, damit die Anfrage direkt zugeordnet wird. */
    defaultMessage?: string;
  };

export function DemoRequestButton({
  children,
  defaultMessage,
  onClick,
  type = "button",
  ...buttonProps
}: DemoRequestButtonProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        {...buttonProps}
        type={type}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) {
            triggerRef.current = event.currentTarget;
            setOpen(true);
          }
        }}
      >
        {children}
      </Button>
      <DemoRequestDialog
        open={open}
        onOpenChange={setOpen}
        returnFocusRef={triggerRef}
        defaultMessage={defaultMessage}
      />
    </>
  );
}

export function DemoRequestDialog({
  open,
  onOpenChange,
  returnFocusRef,
  defaultMessage = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
  defaultMessage?: string;
}) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => ({
    ...EMPTY_DEMO_REQUEST,
    message: defaultMessage,
  }));
  const requestRef = useRef<{ signature: string; requestId: string } | null>(
    null,
  );

  function close() {
    if (busy) return;
    onOpenChange(false);
    setSent(false);
    setBusy(false);
    setForm({ ...EMPTY_DEMO_REQUEST, message: defaultMessage });
    requestRef.current = null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!form.practice || !form.contact || !form.email) {
      toast.error("Bitte Ordination, Name und E-Mail angeben.");
      return;
    }
    setBusy(true);
    const snapshot = { ...form };
    requestRef.current = leadRequestForSnapshot(
      requestRef.current,
      snapshot,
      () => crypto.randomUUID(),
    );
    const saved = await submitLead({
      data: { ...snapshot, requestId: requestRef.current.requestId },
    }).catch(() => ({ ok: false as const }));
    if (!saved.ok) {
      toast.error(
        "error" in saved && saved.error
          ? saved.error
          : "Anfrage konnte nicht gespeichert werden.",
      );
      setBusy(false);
      return;
    }
    setSent(true);
    setBusy(false);
    toast.success("Anfrage gespeichert.");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          close();
          return;
        }
        onOpenChange(true);
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          if (!returnFocusRef?.current) return;
          event.preventDefault();
          returnFocusRef.current.focus();
        }}
      >
        {sent ? (
          <div className="py-6">
            <DialogHeader>
              <DialogTitle>Danke, wir melden uns.</DialogTitle>
              <DialogDescription>
                Wir melden uns bei Ihnen, um die Demo und mögliche
                Testbedingungen für Ihre Ordination zu besprechen.
              </DialogDescription>
            </DialogHeader>
            <Button className="mt-4" onClick={close}>
              Schließen
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Demo anfragen</DialogTitle>
              <DialogDescription>
                Demo, Einrichtung und Testbedingungen besprechen wir gemeinsam.
                Preise und Vertragsbedingungen werden dabei abgestimmt.
              </DialogDescription>
            </DialogHeader>
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Bitte hier keine Patienten-, Tier- oder Gesundheitsdaten eintragen.
              Diese Anfrage dient nur der Produktvorstellung.{" "}
              <a className="underline underline-offset-2" href="/datenschutz">
                Datenschutz ansehen
              </a>
              .
            </p>
            <Field label="Ordination" htmlFor="practice">
              <Input
                id="practice"
                required
                value={form.practice}
                onChange={(e) => setForm({ ...form, practice: e.target.value })}
                placeholder="Tierordination …"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ansprechperson" htmlFor="contact">
                <Input
                  id="contact"
                  required
                  value={form.contact}
                  onChange={(e) =>
                    setForm({ ...form, contact: e.target.value })
                  }
                  placeholder="Dr. med. vet. …"
                />
              </Field>
              <Field label="Bundesland" htmlFor="bundesland">
                <select
                  id="bundesland"
                  className={cn(
                    "flex h-11 w-full rounded-md border border-input bg-card px-3 text-sm",
                  )}
                  value={form.bundesland}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      bundesland: e.target.value as Bundesland | "",
                    })
                  }
                >
                  <option value="">Bitte wählen</option>
                  {BUNDESLAENDER.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="E-Mail" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="rezeption@ordination.at"
                />
              </Field>
              <Field label="Handy" htmlFor="phone">
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+43 …"
                />
              </Field>
            </div>
            <Field label="Praxissoftware" htmlFor="pms">
              <select
                id="pms"
                className="flex h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={form.pms}
                onChange={(e) =>
                  setForm({
                    ...form,
                    pms: e.target.value as (typeof PMS_OPTIONS)[number],
                  })
                }
              >
                {PMS_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <p id={PMS_HINT_ID} className="text-xs text-muted-foreground">
              {PRAXISSOFTWARE_HINT}
            </p>
            <Field label="Was sollen wir wissen?" htmlFor="message">
              <Textarea
                id="message"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Anzahl der Linien, Nachtdienst, Standorte …"
              />
            </Field>
            <Button
              type="submit"
              className="mt-1 w-full sm:w-auto"
              disabled={busy}
            >
              {busy ? "Wird gespeichert …" : "Unverbindlich anfragen"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
