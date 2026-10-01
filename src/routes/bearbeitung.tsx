import { createFileRoute } from "@tanstack/react-router";
import { useState, type CSSProperties } from "react";

export const Route = createFileRoute("/bearbeitung")({ component: Bearbeitung });

type Complaint = { reference: string; createdAt: string; location: string; category: string; description: string; name: string; email: string; occurredAt: string; contactPhone: string; priority: string; status: string; response?: string; history?: { at: string; status: string; response?: string }[] };

function Bearbeitung() {
  const [key, setKey] = useState("");
  const [items, setItems] = useState<Complaint[]>([]);
  const [error, setError] = useState("");
  async function load() {
    const response = await fetch("/api/beschwerden", { headers: { "x-garagen-operator": key } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(String(result.error ?? "Zugriff verweigert.")); return; }
    setError(""); setItems(result.complaints ?? []);
  }
  async function setStatus(reference: string, status: string, response?: string) {
    const result = await fetch("/api/beschwerden", { method: "PATCH", headers: { "Content-Type": "application/json", "x-garagen-operator": key }, body: JSON.stringify({ reference, status, response }) });
    if (!result.ok) { const body = await result.json().catch(() => ({})); setError(String(body.error ?? "Änderung konnte nicht gespeichert werden.")); return; }
    await load();
  }
  async function remove(reference: string) {
    if (!window.confirm(`Vorgang ${reference} wirklich löschen?`)) return;
    const result = await fetch("/api/beschwerden", { method: "DELETE", headers: { "Content-Type": "application/json", "x-garagen-operator": key }, body: JSON.stringify({ reference }) });
    if (!result.ok) { const body = await result.json().catch(() => ({})); setError(String(body.error ?? "Vorgang konnte nicht gelöscht werden.")); return; }
    await load();
  }
 return <main style={styles.page}><header style={styles.header}><b>GARAGENWÄCHTER · BEARBEITUNG</b><a href="/">← Zur Meldung</a></header><section style={styles.card}><h1>Beschwerden bearbeiten</h1><p>Dieser Bereich ist nur für Betreiber. Der Schlüssel bleibt im Browser und wird nicht gespeichert.</p><div style={styles.login}><input type="password" placeholder="Betreiber-Schlüssel" value={key} onChange={(e) => setKey(e.target.value)} /><button onClick={load}>Laden</button></div>{error && <p role="alert" style={styles.error}>{error}</p>}<div style={styles.list}>{items.map((item) => <article key={item.reference} style={styles.item}><div style={styles.row}><strong>{item.reference}</strong><span>{item.priority === "sicherheit" ? "⚠ Sicherheitsrelevant" : item.priority === "dringend" ? "Dringend" : "Normal"}</span><select value={item.status} onChange={(e) => setStatus(item.reference, e.target.value, item.response)}><option value="neu">Neu</option><option value="in_pruefung">In Prüfung</option><option value="beantwortet">Beantwortet</option><option value="geschlossen">Geschlossen</option></select></div><b>{item.location} · {item.category}</b><p>{item.description}</p><small>{item.name} · {item.email} · {item.contactPhone || "keine Telefonnummer"} · {item.occurredAt || "Zeitpunkt nicht angegeben"} · Eingegangen: {new Date(item.createdAt).toLocaleString("de-AT")}</small><details style={styles.history}><summary>Verlauf ({item.history?.length ?? 1})</summary>{(item.history ?? [{ at: item.createdAt, status: item.status }]).map((entry, index) => <div key={`${entry.at}-${index}`}><small>{new Date(entry.at).toLocaleString("de-AT")} · {entry.status.replace("_", " ")}</small>{entry.response && <p>{entry.response}</p>}</div>)}</details><textarea aria-label={`Antwort ${item.reference}`} defaultValue={item.response ?? ""} placeholder="Antwort oder interne Notiz" rows={3} style={styles.textarea} /><button onClick={(event) => { const textarea = (event.currentTarget.previousElementSibling as HTMLTextAreaElement); setStatus(item.reference, "beantwortet", textarea.value); }}>Antwort speichern</button><a style={styles.mail} href={`mailto:${encodeURIComponent(item.email)}?subject=${encodeURIComponent(`Ihre Beschwerde ${item.reference}`)}&body=${encodeURIComponent(item.response ?? "Guten Tag,\n\nzu Ihrer Beschwerde melden wir uns wie folgt:\n\n")}`}>E-Mail im Mailprogramm öffnen</a><button onClick={() => remove(item.reference)} style={styles.delete}>Vorgang löschen</button></article>)}</div></section></main>;
}

const styles: Record<string, CSSProperties> = { page: { minHeight: "100vh", background: "#f4f1eb", color: "#1c2824", fontFamily: "system-ui, sans-serif" }, header: { display: "flex", justifyContent: "space-between", padding: "24px clamp(20px, 6vw, 88px)", borderBottom: "1px solid #d9d4ca" }, card: { maxWidth: 1000, margin: "48px auto", background: "#fffdf9", padding: "clamp(24px, 5vw, 56px)", borderRadius: 24 }, login: { display: "flex", gap: 12, margin: "24px 0" }, list: { display: "grid", gap: 14 }, item: { border: "1px solid #d9d4ca", borderRadius: 14, padding: 18 }, row: { display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }, history: { marginTop: 12, padding: 8, background: "#f4f1eb" }, textarea: { display: "block", width: "100%", margin: "16px 0", padding: 10 }, mail: { display: "inline-block", marginLeft: 12 }, delete: { marginLeft: 12, color: "#8b2d21" }, error: { color: "#8b2d21" } };
