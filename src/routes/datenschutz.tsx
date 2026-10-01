import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/datenschutz")({ component: PrivacyPage });

function PrivacyPage() {
  return <main className="mx-auto max-w-2xl px-6 py-16"><a href="/">← Zurück</a><h1 className="mt-10 text-4xl font-semibold">Datenschutz</h1><p className="mt-2 text-sm text-muted-foreground">Informationen zur Beschwerdeannahme.</p><div className="mt-8 space-y-5 text-sm leading-relaxed"><p>Verantwortlich ist der jeweilige Garagenbetreiber. Die Kontaktdaten werden auf der Betreiber-Website ergänzt.</p><p>Wir verarbeiten nur die Angaben, die Sie im Beschwerdeformular selbst eintragen: Standort, Kategorie, Schilderung, Name und E-Mail-Adresse. Die Daten dienen ausschließlich der Prüfung und Beantwortung Ihres Vorgangs.</p><p>Die Daten werden lokal im Betreiber-System gespeichert. Eine Weitergabe an Werbeplattformen oder externe KI-Dienste findet nicht statt.</p><p>Sie können Auskunft, Berichtigung oder Löschung Ihrer Angaben verlangen. Schreiben Sie dafür an die im Betreiber-Impressum genannte Kontaktadresse und nennen Sie Ihre Vorgangsnummer.</p><p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">Vor dem öffentlichen Betrieb müssen Betreibername, Kontaktadresse, Aufbewahrungsfrist und die zuständige Datenschutzinformation ergänzt werden.</p></div></main>;
}
