import { createFileRoute } from "@tanstack/react-router";
import { useState, type CSSProperties } from "react";
import { complaintBoardColumns, complaintsByStatus } from "@/lib/beschwerden/complaint-board.js";
import { complaintHandoff } from "@/lib/beschwerden/complaint-workflow.js";

export const Route = createFileRoute("/tafel")({ component: ComplaintBoard });

type Complaint = { reference: string; createdAt: string; location: string; category: string; description: string; occurredAt: string; contactPhone?: string; priority: "normal" | "dringend" | "sicherheit"; status: string };

function ComplaintBoard() {
  const [key, setKey] = useState("");
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/beschwerden", { headers: { "x-garagen-operator": key } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body.error ?? "Die Tafel konnte nicht geladen werden."));
      setComplaints(body.complaints ?? []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Die Tafel konnte nicht geladen werden."); }
    finally { setLoading(false); }
  }

  async function move(reference: string, status: string) {
    const response = await fetch("/api/beschwerden", { method: "PATCH", headers: { "Content-Type": "application/json", "x-garagen-operator": key }, body: JSON.stringify({ reference, status }) });
    if (!response.ok) { const body = await response.json().catch(() => ({})); setError(String(body.error ?? "Status konnte nicht geändert werden.")); return; }
    await load();
  }

  const columns = complaintsByStatus(complaints) as Record<string, Complaint[]>;
  return <main style={styles.page}>
    <header style={styles.header}><b>BEST IN PARKING · BETREIBERDEMO</b><nav style={styles.nav}><a href="/">Kundenansicht</a><a href="/bearbeitung">Detailbearbeitung</a></nav></header>
    <section style={styles.intro}><p style={styles.eyebrow}>BESCHWERDE-TAFEL · DEMO</p><h1>Alle Anliegen im Blick.</h1><p>Neue und dringende Vorgänge stehen sichtbar vorne. Ein Klick verschiebt den Vorgang in den nächsten Bearbeitungsschritt.</p><div style={styles.login}><input aria-label="Betreiber-Schlüssel" type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="Betreiber-Schlüssel" style={styles.input} /><button type="button" onClick={() => void load()} style={styles.primary}>{loading ? "Lädt …" : "Tafel laden"}</button></div>{error && <p role="alert" style={styles.error}>{error}</p>}</section>
    <section aria-label="Beschwerde-Tafel" style={styles.board}>{complaintBoardColumns.map((column) => <div key={column.status} style={styles.column}><div style={styles.columnHeading}><h2>{column.title}</h2><span>{columns[column.status]?.length ?? 0}</span></div><div style={styles.cards}>{(columns[column.status] ?? []).map((complaint) => {
      const handoff = complaintHandoff(complaint);
      return <article key={complaint.reference} style={styles.card}><div style={styles.cardTop}><strong>{complaint.reference}</strong><span style={complaint.priority === "sicherheit" ? styles.security : complaint.priority === "dringend" ? styles.urgent : styles.normal}>{complaint.priority === "sicherheit" ? "Sicherheit" : complaint.priority === "dringend" ? "Dringend" : "Normal"}</span></div><b>{complaint.location || "Standort offen"}</b><p style={styles.category}>{complaint.category || "Kategorie offen"}</p><p style={styles.description}>{complaint.description}</p><small>{complaint.occurredAt || "Zeitpunkt offen"}</small><div style={styles.handoff}><b>Zuständig: {handoff.owner}</b><span>{handoff.nextStep}</span></div><button type="button" onClick={() => void move(complaint.reference, column.next)} style={styles.move}>{column.action} →</button></article>;
    })}{!loading && (columns[column.status] ?? []).length === 0 && <p style={styles.empty}>Keine Vorgänge.</p>}</div></div>)}</section>
  </main>;
}

const styles: Record<string, CSSProperties> = { page: { minHeight: "100vh", background: "#f4f1eb", color: "#1c2824", fontFamily: "system-ui, sans-serif" }, header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px clamp(20px, 6vw, 88px)", borderBottom: "1px solid #d9d4ca" }, nav: { display: "flex", gap: 18 }, intro: { maxWidth: 1180, margin: "0 auto", padding: "52px 24px 30px" }, eyebrow: { color: "#b45b35", letterSpacing: "0.15em", fontWeight: 800, fontSize: 12 }, login: { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 24 }, input: { minHeight: 46, minWidth: 280, border: "1px solid #c8d2cc", borderRadius: 10, background: "#fff", padding: "0 12px", font: "inherit" }, primary: { minHeight: 46, border: 0, borderRadius: 999, background: "#1c5b4d", color: "#fff", padding: "0 20px", fontWeight: 800, cursor: "pointer" }, error: { color: "#8b2d21", fontWeight: 700 }, board: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(245px, 1fr))", gap: 16, maxWidth: 1180, margin: "0 auto", padding: "0 24px 70px" }, column: { minHeight: 360, border: "1px solid #d9d4ca", borderRadius: 18, background: "#ebe8e0", padding: 14 }, columnHeading: { display: "flex", justifyContent: "space-between", alignItems: "center" }, cards: { display: "grid", gap: 12, marginTop: 12 }, card: { background: "#fffdf9", borderRadius: 12, padding: 14, boxShadow: "0 2px 8px #243a3212" }, cardTop: { display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 12, fontSize: 12 }, security: { color: "#8b2d21", fontWeight: 800 }, urgent: { color: "#b45b35", fontWeight: 800 }, normal: { color: "#68736e" }, category: { color: "#1c5b4d", fontSize: 14, margin: "4px 0" }, description: { fontSize: 14, lineHeight: 1.45 }, handoff: { display: "grid", gap: 4, marginTop: 12, padding: 10, borderRadius: 9, background: "#edf5f0", color: "#23463b", fontSize: 13, lineHeight: 1.35 }, move: { width: "100%", marginTop: 14, border: "1px solid #9dbbad", borderRadius: 9, background: "#edf5f0", padding: "9px 10px", color: "#1c5b4d", fontWeight: 800, cursor: "pointer" }, empty: { color: "#68736e", fontSize: 14 } };
