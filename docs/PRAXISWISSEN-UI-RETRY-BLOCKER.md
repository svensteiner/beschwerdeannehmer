# Praxiswissen-Korrektur: UI-Retry nach Merge geprüft

Der frühere Blocker ist erledigt. Der gezielte, isolierte Lauf

```powershell
$env:PRACTICE_MERGE_AUDIT='1'; node scripts/auth-speech-retry-audit.mjs
```

nutzt Port 8095 nur, wenn er frei ist, eine temporäre lokale PGLite-Datenbank
und einen echten Login mit der Route `/sprechen?training=wissen`. Audio, STT,
TTS und die lokale Alma-Antwort werden kontrolliert simuliert; alle Fakten-
Speicherungen sind echte Server-Funktionen.

Der Audit legt die Quelle über die sichtbare Wissenstraining-UI an, hat schon
vorher einen doppelten Zielhinweis in Praxis B und einen Kontrollhinweis in
Praxis A. Beim ersten `replacePracticeFact` wird die echte Serverantwort
abgewartet und mit Seroval dekodiert. Erst wenn sie `ok: true` und die
Quellen-ID enthält, erhält die UI kontrolliert HTTP 503. Der Bildschirm muss
danach Originalzeile und Edittext behalten; der normale Klick auf
„Korrigieren“ wiederholt dieselbe Aktion.

Erfolgsnachweis vom 11.09.2026 steht in
`artifacts/auth-speech-practice-merge-audit.log`: zwei Replace-POSTs, dieselbe
Quellen-ID vor dem 503 und im Endbestand, der Duplikat-Zielhinweis entfernt und
Praxis A unverändert.
