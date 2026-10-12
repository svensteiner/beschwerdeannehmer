import { createFileRoute } from "@tanstack/react-router";
import { useState, type CSSProperties } from "react";
import { garageBrand } from "@/lib/beschwerden/branding.js";
import { aggregateComplaintAnalytics, complaintAnalyticsCsv } from "@/lib/beschwerden/complaint-analytics.js";

export const Route = createFileRoute("/auswertung")({ component: Auswertung });

type Complaint = { location: string; category: string; createdAt: string; status: string };
type Row = { location: string; category: string; month: string; count: number; closed: number; open: number };

function Auswertung() {
  const [key, setKey] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/beschwerden", { headers: { "x-garagen-operator": key } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(String(body.error ?? "Die Auswertung konnte nicht geladen werden.")); return; }
    try { setRows(aggregateComplaintAnalytics(body.complaints as Complaint[])); setError(""); }
    catch { setError("Die gespeicherten Vorgänge sind für die Auswertung unvollständig."); }
  }

  function downloadCsv() {
    const file = new Blob([complaintAnalyticsCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url; link.download = "beschwerde-auswertung.csv"; link.click();
    URL.revokeObjectURL(url);
  }

  return <main style={styles.page}><header style={styles.header}><b>{garageBrand.name} · BETREIBERDEMO</b><nav style={styles.nav}><a href="/tafel">Tafel</a><a href="/bearbeitung">Bearbeitung</a></nav></header><section style={styles.card}><p style={styles.eyebrow}>AUSWERTUNG · DEMO</p><h1>Beschwerden im Überblick</h1><p>Diese Auswertung zeigt nur Summen nach Standort, Kategorie und Monat. Namen, Texte und Kontaktdaten erscheinen nicht.</p><div style={styles.login}><input aria-label="Betreiber-Schlüssel" type="password" placeholder="Betreiber-Schlüssel" value={key} onChange={(event) => setKey(event.target.value)} /><button onClick={() => void load()}>Auswertung laden</button>{rows.length > 0 && <button onClick={downloadCsv}>CSV herunterladen</button>}</div>{error && <p role="alert" style={styles.error}>{error}</p>}{rows.length > 0 && <div style={styles.tableWrap}><table><thead><tr><th>Standort</th><th>Kategorie</th><th>Monat</th><th>Gesamt</th><th>Offen</th><th>Abgeschlossen</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.location}-${row.category}-${row.month}`}><td>{row.location}</td><td>{row.category}</td><td>{row.month}</td><td>{row.count}</td><td>{row.open}</td><td>{row.closed}</td></tr>)}</tbody></table></div>}</section></main>;
}

const styles: Record<string, CSSProperties> = { page: { minHeight: "100vh", background: "#f4f1eb", color: "#1c2824", fontFamily: "system-ui, sans-serif" }, header: { display: "flex", justifyContent: "space-between", padding: "24px clamp(20px, 6vw, 88px)", borderBottom: "1px solid #d9d4ca" }, nav: { display: "flex", gap: 18 }, card: { maxWidth: 1000, margin: "48px auto", background: "#fffdf9", padding: "clamp(24px, 5vw, 56px)", borderRadius: 24 }, eyebrow: { color: "#b45b35", letterSpacing: "0.14em", fontWeight: 800, fontSize: 12 }, login: { display: "flex", flexWrap: "wrap", gap: 12, margin: "24px 0" }, tableWrap: { overflowX: "auto" }, error: { color: "#8b2d21", fontWeight: 700 } };
