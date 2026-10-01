# Recherche: fonio.ai als technisches Vorbild (Stand 2026-09-09)

Wiener Anbieter (gegründet 2024), KI-Telefonassistent für Arztpraxen, Handwerk, Kanzleien, KMU.
Mehrere Angaben stammen aus Sekundärquellen und sind als unverifiziert markiert.

## Technik

| Bereich | fonio | Quelle / Status |
|---|---|---|
| Hosting | EU, Hetzner Nürnberg | Sekundärquelle (foxifai.com/fonio-avv), unverifiziert |
| LLM | OpenAI-Modelle über Microsoft Azure EU | Sekundärquelle, unverifiziert |
| STT/TTS | nicht genannt, vermutlich Azure-Pipeline | unverifiziert |
| Telefonie | eigene Nummer über Twilio, Rufnummernmitnahme, SIP-Trunk (Sipgate, Placetel, Easybell, NFON, 3CX, STARFACE, Telnyx, Yeastar) | docs.fonio.ai/SIP-Telefonnummern |
| Latenz, Barge-in | keine belastbaren Zahlen, nur Marketing | – |
| Sprachen | Deutsch mit Dialekt-Anspruch, Englisch | fonio.ai |

## Produkt
- Freitext-Konfiguration des Verhaltens statt starrer Regeln, Setup "in Minuten".
- Terminbuchung, Verschiebung, Storno, drei Terminvorschläge. Doctolib-Anbindung angekündigt, Status offen.
- Transkript per E-Mail nach jedem Anruf, parallele Anrufannahme, Weiterleitung und Rückruf als Fallback.
- AVV nach Art. 28 DSGVO öffentlich unter docs.fonio.ai/Datenschutz/AVV. Keine ISO 27001 oder SOC 2 (Stand April 2026, Sekundärquelle).

## Preise
Pay-per-Use ab 0,15 € pro Minute ohne Grundgebühr, alternativ Monatsabo, 15 % Rabatt bei Jahreszahlung.
Solo-Plan ohne Parallelanrufe.

## Für Silvia übernehmen
1. **AVV öffentlich** als Vertrauenssignal.
2. **Freitext-Konfiguration** für die Inhaberin, ergänzend zum Trainingsmodus.
3. **Transkript per E-Mail** nach jedem Anruf (kleiner Aufwand).
4. **SIP-Trunk zu bestehenden Telefonanlagen** als Anbindungsstrategie, statt nur eigene Nummer.
5. **Minutenpreis** als Vergleichsgröße für die eigene Preisliste.
6. **EU-Hosting über Azure-OpenAI** als Option, falls Praxen DSGVO-Nachweise verlangen.

## Nicht übertragbar
- fonio hat keine Praxissoftware-Tiefenintegration. Die Vquadrat-Bridge ist Silvias Alleinstellungsmerkmal.
- Doctolib ist Humanmedizin, für Tierärzte irrelevant.
- Zu STT-Qualität und Latenz von fonio gibt es keine Daten, kein Beleg, dass es besser ist als Silvias OpenAI-Pfad.
