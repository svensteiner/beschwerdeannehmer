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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/beschwerden", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(String(result.error ?? "Die Beschwerde konnte nicht angenommen werden.")); return; }
    setReference(String(result.reference ?? ""));
    setSent(true);
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logo}>GARAGEN<span>WÄCHTER</span></div>
        <a href="#formular" style={styles.headerLink}>Beschwerde melden</a>
      </header>
      <section style={styles.hero}>
        <p style={styles.eyebrow}>FAIR. KLAR. NACHVOLLZIEHBAR.</p>
        <h1>Ihre Beschwerde wird<br /><em>ernst genommen.</em></h1>
        <p style={styles.lead}>Schildern Sie uns kurz, was passiert ist. Wir prüfen den Vorgang und melden uns mit einer nachvollziehbaren Antwort.</p>
        <a href="#formular" style={styles.primary}>Beschwerde starten ↓</a>
      </section>
      <section id="formular" style={styles.card}>
        <div>
          <p style={styles.eyebrow}>SICHERES FORMULAR</p>
          <h2>Was ist passiert?</h2>
          <p style={styles.muted}>Pflichtfelder sind mit * markiert. Bitte keine Zahlungsdaten oder Passwörter eintragen.</p>
        </div>
        {sent ? (
          <div style={styles.success} role="status"><strong>Danke, Ihre Beschwerde ist eingegangen.</strong><br />Ihre Vorgangsnummer: <b>{reference}</b><br />Sie erhalten zusätzlich eine Bestätigung per E-Mail.</div>
        ) : (
          <form onSubmit={submit} style={styles.form}>
            <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-10000px", opacity: 0 }} />
            <label>Garage / Standort *<input name="location" required placeholder="z. B. Garage Hauptbahnhof" /></label>
            <label>Worum geht es? *<select name="category" required defaultValue=""><option value="" disabled>Bitte auswählen</option><option>Ein-/Ausfahrt</option><option>Parkplatz oder Schranke</option><option>Abrechnung</option><option>Sauberkeit oder Sicherheit</option><option>Sonstiges</option></select></label>
            <label>Dringlichkeit<select name="priority" defaultValue="normal"><option value="normal">Normal</option><option value="dringend">Dringend</option><option value="sicherheit">Sicherheitsrelevant</option></select></label>
            <div style={styles.grid}><label>Wann war der Vorfall?<input name="occurredAt" type="datetime-local" /></label><label>Telefon für Rückfragen<input name="contactPhone" type="tel" autoComplete="tel" /></label></div>
            <label>Ihre Schilderung *<textarea name="description" required minLength={20} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Was ist wann passiert?" rows={5} /></label>
            <div style={styles.grid}><label>Name *<input name="name" required /></label><label>E-Mail *<input name="email" type="email" required /></label></div>
            <label style={styles.check}><input name="consent" value="yes" type="checkbox" required /> Ich stimme der Bearbeitung dieser Beschwerde zur Klärung des Vorgangs zu.</label>
            {error && <div role="alert" style={styles.error}>{error}</div>}
            <button type="submit" style={styles.primary}>Beschwerde absenden</button>
          </form>
        )}
      </section>
      <footer style={styles.footer}>GARAGENWÄCHTER · Beschwerdemanagement für Garagenbetreiber · <a href="/datenschutz">Datenschutz</a></footer>
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
  primary: { display: "inline-block", background: "#1c5b4d", color: "white", border: 0, borderRadius: 999, padding: "14px 24px", fontWeight: 800, textDecoration: "none", cursor: "pointer", fontSize: 16 },
  card: { maxWidth: 900, margin: "0 auto 80px", background: "#fffdf9", border: "1px solid #d9d4ca", borderRadius: 24, padding: "clamp(24px, 5vw, 56px)", boxShadow: "0 14px 40px #243a3212" },
  muted: { color: "#68736e" },
  form: { display: "grid", gap: 18, marginTop: 32 },
  formLabel: { fontWeight: 700 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 18 },
  check: { display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "#53615c" },
  success: { marginTop: 28, padding: 20, background: "#e4f1e8", borderRadius: 14, lineHeight: 1.6 },
  error: { padding: 14, background: "#fbe8e5", color: "#8b2d21", borderRadius: 10 },
  footer: { padding: "28px 24px", textAlign: "center", color: "#68736e", fontSize: 13, borderTop: "1px solid #d9d4ca" },
};
