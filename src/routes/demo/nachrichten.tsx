import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { deAT } from "date-fns/locale";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PRACTICE, THREADS } from "@/lib/alma/data";
import { mailtoHref, whatsappHref } from "@/lib/alma/protocol";
import { useAlmaStore } from "@/lib/alma/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/demo/nachrichten")({ component: Nachrichten });

function Nachrichten() {
  const extra = useAlmaStore((s) => s.extraThreads);
  const mails = useAlmaStore((s) => s.extraMails);
  const notifyWhatsapp = useAlmaStore((s) => s.notifyWhatsapp);
  const notifyEmail = useAlmaStore((s) => s.notifyEmail);
  const setWa = useAlmaStore((s) => s.setNotifyWhatsapp);
  const setMail = useAlmaStore((s) => s.setNotifyEmail);
  const threads = [...extra, ...THREADS.filter((t) => !extra.some((e) => e.id === t.id))];
  const [tab, setTab] = useState<"wa" | "mail">("wa");
  const [id, setId] = useState(threads[0]?.id);
  const selected = threads.find((t) => t.id === id) ?? threads[0];
  const [mailId, setMailId] = useState(mails[0]?.id);
  const mail = mails.find((m) => m.id === mailId) ?? mails[0];

  return (
    <div className="p-4 sm:p-8">
      <h1 className="font-display text-3xl font-semibold">An die Frau Doktor</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Nach dem Telefonat schickt Silvia das Protokoll per WhatsApp und E-Mail – nicht aufs private
        Handy.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setWa(!notifyWhatsapp)}
          className={cn(
            "min-h-11 rounded-lg border px-3 text-sm",
            notifyWhatsapp ? "border-primary bg-secondary" : "border-border",
          )}
        >
          WhatsApp {notifyWhatsapp ? "an" : "aus"}
        </button>
        <button
          type="button"
          onClick={() => setMail(!notifyEmail)}
          className={cn(
            "min-h-11 rounded-lg border px-3 text-sm",
            notifyEmail ? "border-primary bg-secondary" : "border-border",
          )}
        >
          E-Mail {notifyEmail ? "an" : "aus"}
        </button>
      </div>
      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("wa")}
          className={cn(
            "min-h-11 rounded-lg px-4 text-sm font-medium",
            tab === "wa" ? "bg-primary text-primary-foreground" : "bg-secondary",
          )}
        >
          WhatsApp
        </button>
        <button
          type="button"
          onClick={() => setTab("mail")}
          className={cn(
            "min-h-11 rounded-lg px-4 text-sm font-medium",
            tab === "mail" ? "bg-primary text-primary-foreground" : "bg-secondary",
          )}
        >
          E-Mail{mails.length ? ` (${mails.length})` : ""}
        </button>
      </div>

      {tab === "wa" ? (
        <div className="mt-6 grid min-h-[28rem] overflow-hidden rounded-xl border border-border lg:grid-cols-[18rem_1fr]">
          <aside className="border-b border-border lg:border-r lg:border-b-0">
            <ul>
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setId(t.id)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 border-t border-border px-4 py-3 text-left first:border-t-0",
                      selected?.id === t.id ? "bg-secondary" : "hover:bg-secondary/50",
                    )}
                  >
                    <span className="flex w-full items-center justify-between">
                      <span className="font-medium">{t.name}</span>
                      {t.unread > 0 ? (
                        <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                          {t.unread}
                        </span>
                      ) : null}
                    </span>
                    <span className="line-clamp-1 text-sm text-muted-foreground">{t.preview}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          {selected ? (
            <section className="flex flex-col p-4 sm:p-6">
              <header className="mb-4">
                <h2 className="font-display text-2xl font-semibold">{selected.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {selected.intern ? `Intern · ${PRACTICE.whatsapp}` : `Tier: ${selected.pet}`}
                </p>
              </header>
              <div className="flex flex-1 flex-col gap-3">
                {selected.messages.map((m, i) => (
                  <div
                    key={i}
                    className={cn(
                      "max-w-[28rem] whitespace-pre-wrap rounded-lg px-4 py-3 text-sm",
                      m.from === "alma"
                        ? "self-start bg-primary text-primary-foreground"
                        : "self-end border border-border bg-card",
                    )}
                  >
                    {m.text}
                    <p className="mt-1 text-xs opacity-70 tabular-nums">
                      {format(new Date(m.at), "HH:mm", { locale: deAT })}
                    </p>
                  </div>
                ))}
              </div>
              {selected.intern ? (
                <Button className="mt-4 w-fit" asChild>
                  <a
                    id="demo-intern-wa"
                    href={whatsappHref(selected.messages.at(-1)?.text ?? "", PRACTICE.whatsapp)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    An {PRACTICE.owner} senden
                  </a>
                </Button>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 grid min-h-[28rem] overflow-hidden rounded-xl border border-border lg:grid-cols-[18rem_1fr]">
          <aside className="border-b border-border lg:border-r lg:border-b-0">
            {mails.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Noch kein Protokoll. Rufen Sie an.</p>
            ) : (
              <ul>
                {mails.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setMailId(m.id)}
                      className={cn(
                        "flex w-full flex-col items-start gap-0.5 border-t border-border px-4 py-3 text-left first:border-t-0",
                        mail?.id === m.id ? "bg-secondary" : "hover:bg-secondary/50",
                      )}
                    >
                      <span className="font-medium">{m.subject}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {format(new Date(m.at), "HH:mm", { locale: deAT })} · {m.pet}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
          {mail ? (
            <article className="p-4 sm:p-6">
              <p className="text-xs text-muted-foreground">An {mail.to}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{mail.subject}</h2>
              <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed">{mail.body}</pre>
              <Button className="mt-6" asChild>
                <a id="demo-intern-mail" href={mailtoHref(mail.subject, mail.body, PRACTICE.email)}>
                  Im Mailprogramm öffnen
                </a>
              </Button>
            </article>
          ) : null}
        </div>
      )}
    </div>
  );
}
