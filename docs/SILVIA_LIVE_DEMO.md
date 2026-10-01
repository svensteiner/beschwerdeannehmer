# Silvia Live Hörprobe — Implementierungsstand

Die lokale Hörprobe nutzt die dokumentierte GPT-Live-WebRTC-Verbindung mit
`gpt-live-1` und der Stimme `marin`. Der Browser holt das Mikrofon erst nach
Klick, während der OpenAI-Schlüssel ausschließlich im Serverprozess bleibt.

## Separater RAM-Hörtest

`npm run live:sandbox -- --confirm-synthetic` startet einen getrennten lokalen
Hörtest auf `127.0.0.1:8093`. Der Start selbst ruft OpenAI noch nicht auf; erst
ein weiterer Klick im Browser nach der sichtbaren Bestätigung startet eine
Sitzung. Der Launcher erzwingt RAM-Daten, eine leere Datenbank, die Live-
Freigabe und den lokalen Host. Er verweigert den Start ohne serverseitigen
`OPENAI_API_KEY` oder einen vorhandenen, absoluten und dauerhaften
`SILVIA_LIVE_GUARD_DIR`. Temporäre und Build-Ordner sind als Schutzordner
gesperrt. Ausschließlich erfundene Angaben verwenden.

Standardmäßig ist die Funktion aus. Für einen ausdrücklich lokalen Test muss
der laufende Prozess mit `SILVIA_LIVE_DEMO_ENABLED=1` gestartet werden. Zusätzlich
ist zwingend `SILVIA_LIVE_DEMO_SANDBOX=1` und `SILVIA_DATA_DIR=memory` (oder
`memory://`/`:memory:`) erforderlich. Eine gesetzte `DATABASE_URL` oder ein
anderer Datenspeicher blockiert den Start. Damit kann die Cloud-Live-Demo nicht
versehentlich gemeinsam mit persistenten Praxisdaten laufen. Die Sperre greift
vor Mikrofonzugriff, WebRTC und jedem Anbieter-WebSocket/-Aufruf; sie gilt auch
wenn der serverseitige Schlüssel vorhanden ist.
Die Konfiguration verhindert Live im Praxisbetrieb, erzwingt aber nicht, was
jemand während einer freigegebenen Demo spricht. Die Bestätigung erfundener
Inhalte ist nur eine sichtbare Schutzschranke und kein technischer Beweis.
Der laufende Prozess muss daher ausdrücklich als isolierte Demo gestartet werden.
Die
zusätzliche Einstellung `SILVIA_LIVE_GUARD_DIR` muss auf einen vorhandenen,
absolut angegebenen und dauerhaft gespeicherten Ordner zeigen. Alle lokalen
Prozesse dieser Demo müssen denselben Ordner verwenden. Keinen temporären
Ordner oder Build-Ausgabeordner verwenden. Ohne gültigen Schutzordner startet
keine Anbieteranfrage; diese Dokumentation ist keine Testfreigabe.
Die
Routen akzeptieren nur Loopback-Anfragen, erlauben höchstens eine aktive
Sitzung und fordern nach 120 Sekunden oder über **Stoppen** den Sitzungsstopp
an. Das ist wegen möglicher Server-/Netzwerkfehler keine Garantie, dass der
externe Dienst die Sitzung tatsächlich beendet.
Die Sitzung wird zusätzlich über einen serverseitigen Sideband-WebSocket
beobachtet. Bei fehlender Abschlussbestätigung bleibt der Prozess bewusst in
einem unsicheren Zustand und gibt den Sitzungsslot nicht still frei.

Die Begrüßung folgt einer festen, serverseitigen Reihenfolge: Zuerst wird eine
deutschsprachige Begrüßungsanweisung gesendet. Erst nach ihrer bestätigten
Annahme sendet Silvia den kurzen Startimpuls für die hörbare Begrüßung. Das
bestätigt weder die genaue Formulierung noch, dass die Person die Audioausgabe
gehört hat; genau das bleibt Teil des echten Hörtests.

Vor dem Anbieteraufruf wird im Schutzordner atomar eine Reservierung
`silvia-live-demo-active/lease.json` angelegt und geschrieben. Sie enthält
nur Formatversion und eine zufällige Besitzkennung, keine Schlüssel,
Gesprächsinhalte oder Audiodaten. Die Reservierung überlebt einen
Prozessneustart. Nur die dazugehörige bestätigte `session.closed`-Meldung
darf sie freigeben; fehlgeschlagene Freigaben halten weitere Starts gesperrt.
Alter der Datei und Prozessnummer sind kein Grund für automatische Freigabe.

Nach einem Absturz ist eine manuelle Prüfung notwendig: Die verantwortliche
Person muss beim Anbieter klären, ob die alte Sitzung beendet ist, bevor
die Reservierung gezielt aufgehoben und ein weiterer Test freigegeben wird.
Nicht durch Wechsel des Schutzordners umgehen. Der Schutz ist kein
serverübergreifendes Budgetsystem, kein Euro-Kostenlimit und kein Nachweis
gegen Stromausfall, Dateisystemverlust oder manuelle Manipulation.

Abnahme des Neustartschutzes (12.09.2026): 25 lokale Servertests bestanden.
Nach simuliertem Verlust des Prozessspeichers blockiert die vorhandene
Reservierung einen weiteren Start. Zwei tatsächlich getrennte Node-Prozesse
am selben Schutzordner ergeben genau einen zugelassenen und einen gesperrten
Start. Alle Anbieterantworten und Verbindungen sind dabei simuliert.
Fehlende/relative Konfiguration, ein Dateipfad statt Ordner und ein
simulierter Speicherfehler blockieren vor dem Anbieteraufruf. Ein bestätigtes
`session.closed` gibt die eigene Reservierung auch ohne finale Nutzungszahl
frei: Sitzungsabschluss und vollständige Verbrauchsbestätigung sind getrennt.
Typprüfung bestanden; kein realer Live-Test, Neubau oder Neustart der
Originalinstallation. Der Status nennt nur den Zustand des Schutzes, keine
internen Dateipfade oder Besitzkennungen.

Die Oberfläche prüft diesen Status vor Mikrofonzugriff, WebRTC-Verbindung und
Startanfrage. Sie startet nur bei `enabled: true`, `active: false`,
`finalizationUncertain: false`, `persistentGuard: "ready"` und
`persistentGuardBlocked: false`; fehlende oder widersprüchliche Statusfelder
blockieren vorsichtshalber. Ein lokaler Browseraudit prüfte diese Sperrgründe
mit synthetischen Statusantworten und zählte dabei jeweils null Mikrofon-,
WebRTC- und Startanfragen. Nach einer wieder sicheren Antwort ist ein neuer
Klick möglich. Es gab keine Anbieter- oder Praxisdatenanfrage.
Nachweis: `artifacts/live-demo-ui-audit-20260912.log` (Exit 0), zwölf
Sperrvarianten, erneuter Start und bestehende Zeitüberschreitungs-/Sitzungstests.
Dies belegt die lokale Bedienlogik, nicht die echte Live-Sprachverbindung.

Zusätzlich ist die Bestätigung „ausschließlich erfundene Demo-Inhalte“ vor dem
Start zwingend und nicht vorausgewählt. Ohne diese Bestätigung wird weder
Mikrofon noch Sitzung angefordert. Sie ist eine sichtbare Schutzschranke,
aber kein technischer Beweis dafür, was jemand danach spricht.

## Begrenzte Browserrechte

Der WebRTC-Datenkanal im Browser gilt als nicht vertrauenswürdig. Er darf
deshalb ausschließlich `session.close` an GPT-Live senden. An den Browser
gehen nur der Sitzungsstart/-abschluss, die sichtbaren Ein-/Ausgabe-Transkript-
teile und eine generische Fehlermeldung. Begrüßungsanweisung, Kostenstatus und
Abschlusskontrolle bleiben auf dem vertrauenswürdigen Server-Sideband-Kanal.
Die Begrenzung folgt der [OpenAI-Referenz für den WebRTC-Datenkanal](https://developers.openai.com/api/reference/typescript/resources/live)
und beschränkt Browserrechte; sie verhindert nicht, dass jemand in einer
absichtlich freigegebenen Hörprobe echte Inhalte ins Mikrofon spricht.

Der lokale Status enthält nun `voiceSeconds`, `finalUsageConfirmed` und
`closeReason` für die aktuelle bzw. zuletzt beendete Sitzung. Sekunden sind
kumulative Provider-Snapshots, keine aufzuaddierenden Teilwerte. Ohne gültige
finale Sekunden bleibt die Verbrauchsbestätigung aus. Es werden weder
Transkripte noch rohe Providerobjekte in dieser Zusammenfassung gespeichert.
Die Werte liegen nur im Prozessspeicher; Backendmodellkosten, dauerhafte
Abrechnung und eine belastbare Ausgabenobergrenze sind damit nicht abgedeckt.
Die Hörprobe konfiguriert bewusst keine Responses-Delegation und keine
Backend-Werkzeuge. Damit gibt es in diesem Ablauf keinen zusätzlichen
modellgesteuerten Backend-Pfad; das 120-Sekunden-Limit bleibt dennoch keine
Kosten-Garantie für GPT-Live selbst.

Vor einer öffentlichen Freigabe braucht die Live-Hörprobe ein eigenes
OpenAI-Projekt mit eigenem Schlüssel und einem dort aktivierten monatlichen
**Hard Spend Limit**. Betrag und Nachweis der Einstellung sind eine
Inhaber-Entscheidung. Eine reine Ausgabenwarnung stoppt keine Anfragen;
auch das harte Anbieterlimit kann wegen verzögerter Durchsetzung leicht
überschritten werden. Die App kann diese Konto-Einstellung nicht prüfen,
und die gemeldeten Sprachsekunden sind kein verlässlicher Euro-Zähler.
Quelle: [OpenAI Spend limits](https://developers.openai.com/api/docs/guides/spend-limits).

25 simulierte Servertests bestehen, einschließlich Duplikaten, ungültigen
Werten, fehlender Abschlussnutzung und verspäteten alten Sitzungsereignissen.
Kein realer Provideraufruf oder Hörtest war Teil dieser Prüfung.
Grundlage: [OpenAI: Usage and graceful close](https://developers.openai.com/api/docs/guides/live-conversations#usage-and-graceful-close).

Dies ist noch keine produktive Veröffentlichung und wurde noch nicht
abgenommen. Ausschließlich erfundene Angaben sind erlaubt. Ein Warnhinweis
verhindert versehentliche Eingaben echter Daten nicht technisch. Die Demo
hat keine echten Buchungen, Tools oder öffentliche Rollout-Konfiguration.

Die kurze Prompt-Struktur (inklusive Backchannel- und Unterbrechungsregeln)
folgt der offiziellen OpenAI-Dokumentation: [Prompting
GPT-Live](https://developers.openai.com/api/docs/guides/live-prompting/).
