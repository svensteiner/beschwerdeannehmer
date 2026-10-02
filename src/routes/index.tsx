import { createFileRoute } from "@tanstack/react-router";
import { useState, type CSSProperties, type FormEvent } from "react";

export const Route = createFileRoute("/")({
  component: ComplaintHome,
});

function ComplaintHome() {
  const [sent, setSent] = useState(false);
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([
    { from: "bot", text: "Grüß Gott. Ich nehme Ihr Anliegen für die Garage auf. Was ist passiert?" },
  ]);

  function answerChat(text: string) {
    const value = text.trim();
    if (!value) return;
    const lower = value.toLocaleLowerCase("de-AT");
    const reply = lower.includes("schranke") || lower.includes("einfahrt")
      ? "Danke. Ich notiere: Zufahrt oder Schranke. An welchem Standort und ungefähr zu welcher Zeit war das?"
      : lower.includes("abrechnung") || lower.includes("zahlung")
        ? "Verstanden. Ich notiere ein Anliegen zur Abrechnung. Bitte halten Sie keine Zahlungsdaten im Chat fest; das Team prüft den Vorgang separat."
        : lower.includes("ticket")
          ? "Danke. Ich notiere ein Problem mit dem Parkticket. Bitte nennen Sie noch Garage oder Standort und die ungefähre Uhrzeit."
          : lower.includes("laden") || lower.includes("e-lad")
            ? "Danke. Ich notiere ein Anliegen zum E-Laden. Bitte nennen Sie noch den Standort und, falls sichtbar, die Nummer der Ladesäule."
        : lower.includes("sicher") || lower.includes("gefahr")
          ? "Das klingt sicherheitsrelevant. Ich markiere es für eine rasche Prüfung durch den Betreiber. Bitte nennen Sie noch den Standort."
          : "Danke, ich habe das aufgenommen. Für die Vorführung würde ich jetzt Standort, Zeitpunkt und Rückrufmöglichkeit abfragen.";
    setChatMessages((current) => [...current, { from: "user", text: value }, { from: "bot", text: reply }]);
    setChatInput("");
  }

  function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    answerChat(chatInput);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/beschwerden", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setError(String(result.error ?? "Die Beschwerde konnte nicht angenommen werden.")); return; }
      setReference(String(result.reference ?? ""));
      setSent(true);
    } catch {
      setError("Die Verbindung war nicht verfügbar. Bitte versuchen Sie es erneut.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logo}>BEST IN PARKING <span>· KUNDENSERVICE-DEMO</span></div>
        <a href="#formular" style={styles.headerLink}>Beschwerde melden</a>
      </header>
      <section style={styles.hero}>
        <p style={styles.eyebrow}>PARKEN · LADEN · SERVICE</p>
        <h1>Ihr Anliegen wird<br /><em>rasch aufgenommen.</em></h1>
        <p style={styles.lead}>Ob Schranke, Parkticket, Abrechnung oder E-Laden: Der digitale Kundenservice nimmt Ihr Anliegen für den richtigen Standort strukturiert auf.</p>
        <p style={styles.demoNote}>Pilotoberfläche für eine gemeinsame Vorführung – nicht die offizielle Website von Best in Parking.</p>
        <a href="#formular" style={styles.primary}>Beschwerde starten ↓</a>
        <a href="/telefon-demo" style={{ ...styles.secondary, marginLeft: 12 }}>Mit dem Bot sprechen →</a>
      </section>
      <section id="telefon-demo" style={styles.chatCard}>
        <div>
          <p style={styles.eyebrow}>KUNDENSERVICE-DEMO · LOKAL</p>
          <h2>So nimmt der Service-Bot ein Anliegen auf.</h2>
          <p style={styles.muted}>Eine kurze, vorbereitete Vorführung für Parkgaragen und Ladepunkte. Sie nutzt keine echte Telefonleitung, keine externe KI und speichert nichts.</p>
        </div>
        <div style={styles.chatWindow} aria-live="polite">
          {chatMessages.map((message, index) => (
            <div key={`${message.from}-${index}`} style={{ ...styles.chatBubble, ...(message.from === "user" ? styles.chatUser : styles.chatBot) }}>
              <small>{message.from === "user" ? "Sie" : "Betreiber-Bot"}</small>
              <div>{message.text}</div>
            </div>
          ))}
        </div>
        <div style={styles.quickReplies}>
          {['Die Schranke hat nicht geöffnet.', 'Mein Parkticket wurde nicht erkannt.', 'Ich habe ein Problem beim E-Laden.'].map((prompt) => (
            <button key={prompt} type="button" style={styles.quickButton} onClick={() => answerChat(prompt)}>{prompt}</button>
          ))}
        </div>
        <form onSubmit={handleChatSubmit} style={styles.chatForm}>
          <input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Beispielanliegen eingeben …" aria-label="Beispielanliegen" />
          <button type="submit" style={styles.primary}>Senden</button>
        </form>
      </section>
      <section id="formular" style={styles.card}>
        <div>
          <p style={styles.eyebrow}>SICHERES FORMULAR</p>
          <h2>Was ist passiert?</h2>
          <p style={styles.muted}>Pflichtfelder sind mit * markiert. Bitte keine Zahlungsdaten oder Passwörter eintragen.</p>
        </div>
        {sent ? (
          <div style={styles.success} role="status"><strong>Danke, Ihre Beschwerde ist eingegangen.</strong><br />Ihre Vorgangsnummer: <b>{reference}</b><br />Bitte bewahren Sie diese Nummer für Rückfragen auf.</div>
        ) : (
          <form onSubmit={submit} style={styles.form}>
            <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-10000px", opacity: 0 }} />
            <label>Garage / Standort *<input name="location" required maxLength={160} placeholder="z. B. Garage Hauptbahnhof" /></label>
            <label>Worum geht es? *<select name="category" required defaultValue=""><option value="" disabled>Bitte auswählen</option><option>Ein-/Ausfahrt</option><option>Parkticket oder Schranke</option><option>Parkgebühr oder Abrechnung</option><option>E-Laden</option><option>Sauberkeit oder Sicherheit</option><option>Sonstiges</option></select></label>
            <label>Dringlichkeit<select name="priority" defaultValue="normal"><option value="normal">Normal</option><option value="dringend">Dringend</option><option value="sicherheit">Sicherheitsrelevant</option></select></label>
            <div style={styles.grid}><label>Wann war der Vorfall?<input name="occurredAt" type="datetime-local" /></label><label>Telefon für Rückfragen<input name="contactPhone" type="tel" maxLength={30} autoComplete="tel" /></label></div>
            <label>Ihre Schilderung *<textarea name="description" required minLength={20} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Was ist wann passiert?" rows={5} /><small style={styles.counter}>{description.length}/5000 Zeichen</small></label>
            <div style={styles.grid}><label>Name *<input name="name" required maxLength={120} /></label><label>E-Mail *<input name="email" type="email" required maxLength={254} /></label></div>
            <label style={styles.check}><input name="consent" value="yes" type="checkbox" required /> Ich stimme der Bearbeitung dieser Beschwerde zur Klärung des Vorgangs zu.</label>
            {error && <div role="alert" style={styles.error}>{error}</div>}
            <button type="submit" disabled={submitting} style={{ ...styles.primary, ...(submitting ? styles.disabled : {}) }}>{submitting ? "Wird übermittelt …" : "Beschwerde absenden"}</button>
          </form>
        )}
      </section>
      <footer style={styles.footer}>BEST IN PARKING · KUNDENSERVICE-DEMO · <a href="/datenschutz">Datenschutz</a> · <a href="/impressum">Impressum</a></footer>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#f4f1eb", color: "#1c2824", fontFamily: "system-ui, sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px clamp(20px, 6vw, 88px)", borderBottom: "1px solid #d9d4ca" },
  logo: { fontWeight: 800, letterSpacing: "0.12em", fontSize: 16 },
  headerLink: { color: "#1c5b4d", fontWeight: 700, textDecoration: "none" },
  hero: { maxWidth: 900, margin: "0 auto", padding: "clamp(72px, 12vw, 150px) 24px 100px" },
  eyebrow: { color: "#b45b35", letterSpacing: "0.16em", fontWeight: 800, fontSize: 12 },
  lead: { maxWidth: 600, fontSize: 20, lineHeight: 1.55, color: "#53615c" },
  demoNote: { maxWidth: 620, color: "#68736e", fontSize: 13, lineHeight: 1.5 },
  primary: { display: "inline-block", background: "#1c5b4d", color: "white", border: 0, borderRadius: 999, padding: "14px 24px", fontWeight: 800, textDecoration: "none", cursor: "pointer", fontSize: 16 },
  card: { maxWidth: 900, margin: "0 auto 80px", background: "#fffdf9", border: "1px solid #d9d4ca", borderRadius: 24, padding: "clamp(24px, 5vw, 56px)", boxShadow: "0 14px 40px #243a3212" },
  chatCard: { maxWidth: 900, margin: "0 auto 40px", background: "#edf5f0", border: "1px solid #c6ddd0", borderRadius: 24, padding: "clamp(24px, 5vw, 56px)" },
  chatWindow: { display: "grid", gap: 12, marginTop: 28, padding: 18, background: "#fffdf9", borderRadius: 16, border: "1px solid #d9d4ca", minHeight: 150 },
  chatBubble: { maxWidth: "80%", padding: "12px 14px", borderRadius: 14, lineHeight: 1.45 },
  chatBot: { justifySelf: "start", background: "#e4f1e8" },
  chatUser: { justifySelf: "end", background: "#dbe9e4" },
  quickReplies: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 },
  quickButton: { border: "1px solid #9dbbad", background: "transparent", color: "#1c5b4d", borderRadius: 999, padding: "8px 12px", cursor: "pointer" },
  chatForm: { display: "flex", gap: 10, marginTop: 18 },
  muted: { color: "#68736e" },
  form: { display: "grid", gap: 18, marginTop: 32 },
  formLabel: { fontWeight: 700 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 18 },
  check: { display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "#53615c" },
  success: { marginTop: 28, padding: 20, background: "#e4f1e8", borderRadius: 14, lineHeight: 1.6 },
  error: { padding: 14, background: "#fbe8e5", color: "#8b2d21", borderRadius: 10 },
  disabled: { opacity: 0.65, cursor: "wait" },
  counter: { display: "block", marginTop: 4, color: "#68736e", textAlign: "right" },
  footer: { padding: "28px 24px", textAlign: "center", color: "#68736e", fontSize: 13, borderTop: "1px solid #d9d4ca" },
};
