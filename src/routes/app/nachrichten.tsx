import { createFileRoute, getRouteApi, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { format } from "date-fns";
import { deAT } from "date-fns/locale";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AkteHandyLink } from "@/components/desk/akte-handy-link";
import { DeskDraftButton } from "@/components/desk/desk-draft-button";
import { HalterinReach } from "@/components/desk/halterin-reach";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markThreadRead } from "@/lib/practice/board";
import { internDeskTitle, internDraftBody, internDraftDomIds, internSettingsTarget, marksReadOnOpen } from "@/lib/practice/desk-calls";
import { loadMailById, loadThreadById, searchProtocol } from "@/lib/practice/desk-actions";
import { protocolSearchNeedle } from "@/lib/practice/protocol-query";
import type { DeskMail, DeskThread } from "@/lib/practice/protocol-rows";
import { telHref, threadDraftDest } from "@/lib/alma/phone";
import { mailtoHref, smsHref, whatsappHref } from "@/lib/alma/protocol";
import { emailForPet, ownerReachMailSubject } from "@/lib/practice/walk-in-last";
import { DESK_SEARCH_PLACEHOLDER } from "@/lib/practice/desk-status";
import {
  anzeigeControl,
  internGelesenVisible,
  NACHRICHTEN_EMPTY_ID,
  NACHRICHTEN_LEAD_ID,
  NACHRICHTEN_MAIL_EMPTY_ID,
  nachrichtenEmptyCopy,
  nachrichtenLead,
  nachrichtenMailEmptyCopy,
  NACHRICHTEN_UNREAD_ID,
  nachrichtenUnreadCopy,
} from "@/lib/practice/tafel-anzeige";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/nachrichten")({
  validateSearch: (search: Record<string, unknown>): { t?: string; m?: string } => ({
    ...(typeof search.t === "string" ? { t: search.t.slice(0, 80) } : {}),
    ...(typeof search.m === "string" ? { m: search.m.slice(0, 80) } : {}),
  }),
  component: NachrichtenPage,
});

const appRoute = getRouteApi("/app");

function NachrichtenPage() {
  const data = appRoute.useLoaderData();
  const { t: threadId, m: mailSearch } = Route.useSearch();
  const navigate = useNavigate({ from: "/app/nachrichten" });
  const router = useRouter();
  const listedThreads = useMemo(() => (data.ok ? data.threads : []), [data]);
  const listedMails = useMemo(() => (data.ok ? data.mails : []), [data]);
  const threadTotal = data.ok ? Number(data.counts.threads) || listedThreads.length : 0;
  const mailTotal = data.ok ? Number(data.counts.mails) || listedMails.length : 0;
  const contact = data.ok ? data.contact : { ownerName: "", email: "", whatsapp: "", practiceName: "", phone: "" };
  const anzeige = Boolean(data.ok && data.anzeige);
  const [tab, setTab] = useState<"wa" | "mail">(mailSearch ? "mail" : "wa");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ threads: DeskThread[]; mails: DeskMail[] } | null>(null);
  const [extraThread, setExtraThread] = useState<DeskThread | null>(null);
  const [extraMail, setExtraMail] = useState<DeskMail | null>(null);
  const [busy, setBusy] = useState(false);
  const [mailId, setMailId] = useState<string | undefined>(mailSearch);
  const searching = Boolean(protocolSearchNeedle(q));
  const threads =
    hits?.threads ??
    (extraThread && !listedThreads.some((t) => t.id === extraThread.id)
      ? [extraThread, ...listedThreads]
      : listedThreads);
  const mails =
    hits?.mails ??
    (extraMail && !listedMails.some((m) => m.id === extraMail.id) ? [extraMail, ...listedMails] : listedMails);
  const selected = threads.find((t) => t.id === (threadId ?? threads[0]?.id)) ?? threads[0];
  const mail = mails.find((m) => m.id === (mailId ?? mailSearch ?? mails[0]?.id)) ?? mails[0];
  const waBody = selected?.intern
    ? internDraftBody(selected.messages, selected.preview)
    : (selected?.messages.at(-1)?.text ?? "");
  const reach = threadDraftDest({
    intern: Boolean(selected?.intern),
    ownerPhone: selected?.owner_phone,
    practiceWhatsapp: contact.whatsapp,
    practicePhone: contact.phone,
  });
  const dest = reach.phone;
  const waHref = reach.whatsapp ? whatsappHref(waBody, reach.whatsapp) : "";
  const smsLink = dest ? smsHref(waBody, dest) : "";
  const internTel = selected?.intern && dest ? telHref(dest) : "";
  const internMail =
    selected?.intern && contact.email
      ? mailtoHref(selected.preview || `Protokoll: ${selected.pet}`, waBody, contact.email)
      : "";
  const internIds = internDraftDomIds("nachrichten-intern", selected?.id);
  const mailHref = mail?.to_addr ? mailtoHref(mail.subject, mail.body, mail.to_addr) : "";

  function runSearch(value: string) {
    const needle = protocolSearchNeedle(value);
    if (!needle) {
      setHits(null);
      return;
    }
    setBusy(true);
    void searchProtocol({ data: { q: value } })
      .then((res) => {
        if (!res.ok) {
          toast.error("Suche nicht möglich.");
          return;
        }
        setHits({ threads: res.threads, mails: res.mails });
      })
      .catch(() => toast.error("Suche nicht möglich."))
      .finally(() => setBusy(false));
  }

  useEffect(() => {
    const needle = protocolSearchNeedle(q);
    if (!needle) {
      setHits(null);
      return;
    }
    const t = window.setTimeout(() => runSearch(q), 280);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (hits?.threads[0]?.id) {
      void navigate({ search: (prev) => ({ ...prev, t: hits.threads[0].id }) });
    }
  }, [hits, navigate]);

  useEffect(() => {
    if (hits?.mails[0]?.id) setMailId(hits.mails[0].id);
  }, [hits]);

  useEffect(() => {
    if (mailSearch) {
      setTab("mail");
      setMailId(mailSearch);
    }
  }, [mailSearch]);

  useEffect(() => {
    if (!threadId || listedThreads.some((t) => t.id === threadId) || extraThread?.id === threadId) return;
    void loadThreadById({ data: { id: threadId } })
      .then((res) => {
        if (res.ok && res.thread) setExtraThread(res.thread);
      })
      .catch(() => undefined);
  }, [threadId, listedThreads, extraThread?.id]);

  useEffect(() => {
    if (!mailSearch || listedMails.some((m) => m.id === mailSearch) || extraMail?.id === mailSearch) return;
    void loadMailById({ data: { id: mailSearch } })
      .then((res) => {
        if (res.ok && res.mail) setExtraMail(res.mail);
      })
      .catch(() => undefined);
  }, [mailSearch, listedMails, extraMail?.id]);

  useEffect(() => {
    if (anzeige) return;
    if (!selected?.unread || !marksReadOnOpen(selected)) return;
    void markThreadRead({ data: { id: selected.id } }).then((res) => {
      if (res.ok) void router.invalidate();
    });
  }, [anzeige, router, selected, selected?.id, selected?.unread, selected?.intern]);

  function markInternRead(openedDraft: boolean) {
    if (!selected?.unread) return;
    if (anzeige) {
      toast.error(anzeigeControl(true).title);
      return;
    }
    void markThreadRead({ data: { id: selected.id } })
      .then((res) => {
        if (!res.ok) {
          toast.error("error" in res && res.error ? res.error : "Protokoll nicht als gelesen markiert.");
          return;
        }
        toast.success(openedDraft ? "Protokoll gelesen. Entwurf ist offen." : "Protokoll gelesen.");
        void router.invalidate();
      })
      .catch(() => toast.error("Protokoll nicht als gelesen markiert."));
  }

  const helper = busy || (searching && hits === null)
    ? "Sucht…"
    : searching
      ? threads.length || mails.length
        ? `${threads.length} WhatsApp · ${mails.length} E-Mail`
        : `Kein Protokoll zu „${q.trim()}“.`
      : threadTotal > listedThreads.length || mailTotal > listedMails.length
        ? `${listedThreads.length} WhatsApp, ${listedMails.length} E-Mail zuletzt – Suche findet den Rest.`
        : threadTotal || mailTotal
          ? `${threadTotal} WhatsApp · ${mailTotal} E-Mail`
          : "Noch kein Protokoll.";

  return (
    <div className="p-4 sm:p-8">
      <h1 className="font-display text-3xl font-semibold">An die Frau Doktor</h1>
      <p id={NACHRICHTEN_LEAD_ID} className="mt-1 text-sm text-muted-foreground">
        {nachrichtenLead(anzeige)}
      </p>

      <form
        className="mt-6 max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          const field = e.currentTarget.elements.namedItem("protokoll-q");
          const value = field instanceof HTMLInputElement ? field.value : q;
          setQ(value);
          runSearch(value);
        }}
      >
        <Label htmlFor="protokoll-q">Protokoll durchsuchen</Label>
        <Input
          id="protokoll-q"
          name="protokoll-q"
          className="mt-1.5"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          placeholder={DESK_SEARCH_PLACEHOLDER}
          autoComplete="off"
        />
        <p className="mt-2 text-xs text-muted-foreground">{helper}</p>
      </form>

      <div className="mt-4 flex gap-2">
        <button
          id="protokoll-tab-wa"
          type="button"
          onClick={() => setTab("wa")}
          className={cn(
            "min-h-11 rounded-lg px-4 text-sm font-medium",
            tab === "wa" ? "bg-primary text-primary-foreground" : "bg-secondary",
          )}
        >
          WhatsApp{threads.length ? ` (${threads.length})` : ""}
        </button>
        <button
          id="protokoll-tab-mail"
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
            {threads.length === 0 ? (
              <p id={NACHRICHTEN_EMPTY_ID} className="p-4 text-sm text-muted-foreground">
                {searching
                  ? "Name, Tier, Vorschau oder Handy anders schreiben."
                  : nachrichtenEmptyCopy(anzeige)}
              </p>
            ) : (
              <ul>
                {threads.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => {
                        void navigate({ search: (prev) => ({ ...prev, t: t.id }) });
                      }}
                      className={cn(
                        "flex w-full flex-col items-start gap-0.5 border-t border-border px-4 py-3 text-left first:border-t-0",
                        selected?.id === t.id ? "bg-secondary" : "hover:bg-secondary/50",
                      )}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="font-medium">{t.name}</span>
                        {t.unread > 0 ? (
                          <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                            {t.unread}
                          </span>
                        ) : null}
                      </span>
                      <span className="line-clamp-1 text-sm text-muted-foreground">
                        {t.intern ? "Intern · Frau Doktor" : "Halterin"}
                        {t.intern
                          ? internDeskTitle(t) !== t.name
                            ? ` · ${internDeskTitle(t)}`
                            : ""
                          : t.pet
                            ? ` · ${t.pet}`
                            : ""}
                        {t.preview ? ` · ${t.preview}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
          {selected ? (
            <section className="flex flex-col p-4 sm:p-6">
              <header className="mb-4">
                <h2 className="font-display text-2xl font-semibold">{selected.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {selected.intern
                    ? `Intern · ${contact.whatsapp || contact.phone || "Nummer in den Einstellungen hinterlegen"}`
                    : selected.owner_phone
                      ? `Halterin · ${selected.owner_phone} · ${selected.pet}`
                      : `Halterin · Telefon in der Akte · ${selected.pet}`}
                </p>
                {selected.intern && selected.unread > 0 ? (
                  <p id={NACHRICHTEN_UNREAD_ID} className="mt-1 text-xs font-medium text-primary">
                    {nachrichtenUnreadCopy(anzeige)}
                  </p>
                ) : null}
              </header>
              <div className="flex flex-1 flex-col gap-3">
                {selected.messages.map((m, i) => (
                  <div
                    key={`${selected.id}-${i}`}
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
                <div className="mt-4 flex flex-wrap gap-2">
                  {internTel ? (
                    <DeskDraftButton
                      id={internIds.tel}
                      href={internTel}
                      size="default"
                      newTab={false}
                      onAct={() => markInternRead(true)}
                    >
                      Frau Doktor anrufen
                    </DeskDraftButton>
                  ) : null}
                  {waHref ? (
                    <DeskDraftButton
                      id={internIds.wa}
                      href={waHref}
                      size="default"
                      onAct={() => markInternRead(true)}
                    >
                      WhatsApp an {contact.ownerName || "die Frau Doktor"}
                    </DeskDraftButton>
                  ) : null}
                  {smsLink ? (
                    <DeskDraftButton
                      id={internIds.sms}
                      href={smsLink}
                      size="default"
                      variant="outline"
                      onAct={() => markInternRead(true)}
                    >
                      SMS öffnen
                    </DeskDraftButton>
                  ) : null}
                  {internMail ? (
                    <DeskDraftButton
                      id={internIds.mail}
                      href={internMail}
                      size="default"
                      variant="outline"
                      onAct={() => markInternRead(true)}
                    >
                      E-Mail öffnen
                    </DeskDraftButton>
                  ) : null}
                  {(() => {
                    const internSettings = internSettingsTarget({
                      href: waHref,
                      mailHref: internMail,
                      smsHref: smsLink,
                    });
                    if (!internSettings) return null;
                    return (
                      <Button variant="outline" asChild>
                        <Link
                          id={internIds.settings ?? "nachrichten-intern-settings"}
                          to="/app/einstellungen"
                          hash={internSettings.hash}
                        >
                          {internSettings.label}
                        </Link>
                      </Button>
                    );
                  })()}
                  {internGelesenVisible(anzeige) && selected.unread > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      id={internIds.gelesen ?? "nachrichten-intern-gelesen"}
                      disabled={anzeigeControl(anzeige).disabled}
                      title={anzeigeControl(anzeige).title}
                      onClick={() => markInternRead(false)}
                    >
                      Gelesen
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <HalterinReach
                    openId={`nachrichten-reach-${selected.id}`}
                    ownerPhone={dest}
                    ownerEmail={selected.owner_email || emailForPet(data.ok ? data.patients : [], selected.pet)}
                    mailSubject={ownerReachMailSubject(selected.pet, contact.practiceName, selected.name)}
                    body={waBody}
                    size="default"
                  />
                  {!dest ? (
                    <p className="w-full text-sm text-muted-foreground">Telefon der Halterin fehlt.</p>
                  ) : null}
                  <AkteHandyLink
                    pet={selected.pet}
                    patients={data.ok ? data.patients : []}
                    size="default"
                    ownerPhone={dest}
                    ownerEmail={selected.owner_email || emailForPet(data.ok ? data.patients : [], selected.pet)}
                    anzeige={anzeige}
                  />
                </div>
              )}
            </section>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 grid min-h-[28rem] overflow-hidden rounded-xl border border-border lg:grid-cols-[18rem_1fr]">
          <aside className="border-b border-border lg:border-r lg:border-b-0">
            {mails.length === 0 ? (
              <p id={NACHRICHTEN_MAIL_EMPTY_ID} className="p-4 text-sm text-muted-foreground">
                {searching
                  ? "Betreff, Text oder Tier anders schreiben."
                  : nachrichtenMailEmptyCopy(anzeige)}
              </p>
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
              <p id="protokoll-mail-to" className="text-xs text-muted-foreground">
                An {mail.to_addr}
              </p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{mail.subject}</h2>
              <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed">{mail.body}</pre>
              {mailHref ? (
                <Button className="mt-6" asChild>
                  <a href={mailHref}>Im Mailprogramm öffnen</a>
                </Button>
              ) : (
                <p className="mt-6 text-sm text-muted-foreground">Keine E-Mail-Adresse hinterlegt.</p>
              )}
            </article>
          ) : null}
        </div>
      )}
    </div>
  );
}
