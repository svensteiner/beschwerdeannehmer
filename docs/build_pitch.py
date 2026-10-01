#!/usr/bin/env python3
"""Internes Pitch-Deck für Silvia. Ausgabe: docs/Silvia-Pitch-Kollegen.pptx"""

from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import nsmap
from pptx.oxml import parse_xml
from pptx.util import Emu, Inches, Pt

GREEN = RGBColor(0x1F, 0x4A, 0x3A)
GREEN_DARK = RGBColor(0x14, 0x32, 0x28)
CREAM = RGBColor(0xF6, 0xF1, 0xE8)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
INK = RGBColor(0x1A, 0x1A, 0x1A)
MUTED = RGBColor(0x5C, 0x64, 0x5E)
OK = RGBColor(0x3D, 0x8B, 0x6E)
FLAG = RGBColor(0xC4, 0x5C, 0x26)
LINE = RGBColor(0xD9, 0xD2, 0xC5)

W = Inches(13.333)
H = Inches(7.5)
MARGIN = Inches(0.7)


def set_run(run, *, size=18, bold=False, color=INK, font="Calibri"):
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    run.font.name = font


def add_text(box, text, *, size=18, bold=False, color=INK, align=PP_ALIGN.LEFT, font="Calibri"):
    tf = box.text_frame
    tf.clear()
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    set_run(run, size=size, bold=bold, color=color, font=font)
    return tf


def add_para(tf, text, *, size=16, bold=False, color=INK, space_before=6, space_after=0, font="Calibri"):
    p = tf.add_paragraph()
    p.space_before = Pt(space_before)
    p.space_after = Pt(space_after)
    run = p.add_run()
    run.text = text
    set_run(run, size=size, bold=bold, color=color, font=font)
    return p


def fill(shape, color):
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()


def rect(slide, l, t, w, h, color):
    s = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, l, t, w, h)
    fill(s, color)
    return s


def round_rect(slide, l, t, w, h, color):
    s = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, l, t, w, h)
    fill(s, color)
    return s


def kicker(slide, text, top=Inches(0.38), color=GREEN):
    box = slide.shapes.add_textbox(MARGIN, top, Inches(10), Inches(0.35))
    add_text(box, text.upper(), size=12, bold=True, color=color, font="Calibri")


def title(slide, text, top=Inches(0.65), width=Inches(12)):
    box = slide.shapes.add_textbox(MARGIN, top, width, Inches(0.7))
    add_text(box, text, size=32, bold=True, color=GREEN, font="Georgia")
    return box


def footer(slide, page, total):
    bar = rect(slide, 0, Inches(7.22), W, Inches(0.28), GREEN)
    box = slide.shapes.add_textbox(MARGIN, Inches(7.22), Inches(10), Inches(0.28))
    tf = add_text(box, "Silvia  ·  internes Pitch-Deck  ·  vertraulich", size=11, color=WHITE)
    num = slide.shapes.add_textbox(Inches(11.6), Inches(7.22), Inches(1.2), Inches(0.28))
    add_text(num, f"{page} / {total}", size=11, color=WHITE, align=PP_ALIGN.RIGHT)


def blank(prs, cream=True):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    if cream:
        rect(slide, 0, 0, W, H, CREAM)
    else:
        rect(slide, 0, 0, W, H, WHITE)
    return slide


def card(slide, l, t, w, h, heading, body, *, heading_size=16, body_size=13):
    round_rect(slide, l, t, w, h, WHITE)
    accent = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, l, t, Inches(0.08), h)
    fill(accent, GREEN)
    hb = slide.shapes.add_textbox(l + Inches(0.28), t + Inches(0.16), w - Inches(0.4), Inches(0.4))
    add_text(hb, heading, size=heading_size, bold=True, color=GREEN)
    bb = slide.shapes.add_textbox(l + Inches(0.28), t + Inches(0.52), w - Inches(0.4), h - Inches(0.68))
    add_text(bb, body, size=body_size, color=INK)


def bullets(slide, items, *, left=MARGIN, top=Inches(1.55), width=Inches(12), size=16):
    box = slide.shapes.add_textbox(left, top, width, Inches(5.3))
    tf = box.text_frame
    tf.word_wrap = True
    tf.clear()
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.level = 0
        p.space_after = Pt(10)
        run = p.add_run()
        run.text = "·  " + item
        set_run(run, size=size, color=INK)


def build():
    prs = Presentation()
    prs.slide_width = W
    prs.slide_height = H
    slides = []

    def done(s):
        slides.append(s)
        return s

    # 1 Title
    s = blank(prs, cream=False)
    rect(s, 0, 0, W, H, GREEN)
    rect(s, 0, 0, Inches(0.18), H, OK)
    k = s.shapes.add_textbox(MARGIN, Inches(1.7), Inches(11), Inches(0.4))
    add_text(k, "INTERNES PITCH-DECK  ·  FÜR DAS TEAM", size=13, bold=True, color=OK)
    t = s.shapes.add_textbox(MARGIN, Inches(2.15), Inches(12), Inches(1.4))
    add_text(t, "Silvia kennt ihre Katze\nwie ihre Westentasche.", size=40, bold=True, color=WHITE, font="Georgia")
    sub = s.shapes.add_textbox(MARGIN, Inches(4.7), Inches(11), Inches(1.1))
    add_text(
        sub,
        "KI-Rezeption für österreichische Tierordinationen.\nWas live ist, wo man klickt, was noch Roadmap ist.",
        size=18,
        color=CREAM,
    )
    foot = s.shapes.add_textbox(MARGIN, Inches(6.55), Inches(11), Inches(0.4))
    add_text(foot, "Gebaut in Wien  ·  alle neun Bundesländer  ·  Demo und Abnahme nach Vereinbarung", size=14, color=OK)
    done(s)

    # 1b Kollegen-Paket
    s = blank(prs)
    kicker(s, "Versendung")
    title(s, "Was du dem Kollegen schickst")
    items = [
        ("1  PowerPoint", "Silvia-Pitch-Kollegen.pptx – internes Deck. Live vs. Roadmap, zehn Minuten klicken."),
        ("2  Werbefilm", "Silvia-Werbefilm-32-Sekunden.mp4 – 32 s, 1080p, mit Ton. Steht auf der Startseite unter „Der Film“."),
        ("3  Demo", "Silvia-Demo-Startseite-und-Film.mp4 – Homepage, Telefon Huber, Produktfilm im Browser."),
    ]
    for i, (h, b) in enumerate(items):
        card(s, MARGIN, Inches(1.5) + i * Inches(1.7), Inches(12), Inches(1.55), h, b, heading_size=20, body_size=16)
    done(s)

    # 2 Worum es geht
    s = blank(prs)
    kicker(s, "In einer Minute")
    title(s, "Was Silvia ist – und was nicht")
    card(
        s,
        MARGIN,
        Inches(1.55),
        Inches(5.8),
        Inches(4.7),
        "Rezeptionistin am Apparat",
        "Silvia nimmt Anrufe an, spricht österreichisches Deutsch (Grüß Gott, Jänner, Ordination, Nachtdienst), legt Termine in hinterlegten Zeiten, triagiert Notfälle und schreibt ein Protokoll an die Frau Doktor.\n\nSie kennt die Ordination: Adresse, Öffnungszeiten, Nachtdienst, WhatsApp, E-Mail – und was man ihr am Telefon beigebracht hat.",
        heading_size=18,
        body_size=15,
    )
    card(
        s,
        Inches(6.85),
        Inches(1.55),
        Inches(5.8),
        Inches(4.7),
        "Keine tierärztliche Beratung",
        "Keine Diagnose, kein Rezept, keine Medikamente, keine amtliche Meldung (Heimtierdatenbank, Hundeabgabe).\n\nDas bleibt bei der Kammer und bei der Ordination. Silvia ist Software für die Kassa – nicht für den Behandlungsraum.",
        heading_size=18,
        body_size=15,
    )
    done(s)

    # 3 Problem
    s = blank(prs)
    kicker(s, "Das Loch")
    title(s, "In Österreich geht das Telefon oft ins Leere")
    items = [
        ("Verpasste Anrufe", "Mittagssperre, OP, Hausbesuch – die 1-Stern-Bewertung heißt oft: niemand geht ans Telefon."),
        ("WhatsApp ungelesen", "Klientel schreibt. Die Kassa kann nicht mithalten."),
        ("Nacht ohne Netz", "Mobilbox statt Triage, bis die Klinik aufsperrt."),
        ("Import aus DE", "Hallo, Januar, Notdienst, zweiter Weihnachtstag – klingt nicht nach Josefstadt."),
    ]
    for i, (h, b) in enumerate(items):
        col, row = i % 2, i // 2
        card(s, MARGIN + col * Inches(6.05), Inches(1.55) + row * Inches(2.35), Inches(5.8), Inches(2.15), h, b)
    done(s)

    # 4 Architektur
    s = blank(prs)
    kicker(s, "Produktbild")
    title(s, "Ein Anruf, drei Schichten")
    steps = [
        ("1  Anrufer", "Homepage, /sprechen oder der öffentliche Link /leitung/… – Silvia geht ans Telefon. Stimme oder Tastatur."),
        ("2  Silvia", "Kennt Zeiten, Nachtdienst, Akte, gelernte Hinweise. Bucht, triagiert, fragt nach dem Tier. Kein Hallo."),
        ("3  Ordination", "Praxistafel: Anruf, Termin, Notfall, Akte, WhatsApp- und Mail-Entwürfe. Einstellungen steuern die Stimme."),
    ]
    for i, (h, b) in enumerate(steps):
        card(s, MARGIN + i * Inches(4.05), Inches(1.6), Inches(3.85), Inches(4.5), h, b, heading_size=20, body_size=15)
    done(s)

    # 5 Zwei Welten
    s = blank(prs)
    kicker(s, "Wichtig fürs Testen")
    title(s, "Demo ist Verkauf. /app ist die Ordination.")
    card(
        s,
        MARGIN,
        Inches(1.55),
        Inches(5.8),
        Inches(4.8),
        "Demo  ·  /demo  und Homepage",
        "Tierordination Huber, 8. Bezirk. Fritz (nur in der Box), Wastl (Chip 040098100123456). Zustand + localStorage im Browser.\n\nDie Homepage-Leitung ist bewusst Demo-Huber – auch wenn jemand eingeloggt ist. Trainieren dort merkt sich Silvia im Browser.\n\nGut zum Zeigen. Verschwindet nicht in der echten Tafel.",
        heading_size=18,
        body_size=15,
    )
    card(
        s,
        Inches(6.85),
        Inches(1.55),
        Inches(5.8),
        Inches(4.8),
        "Live  ·  /app  nach Registrieren",
        "Eigenes Konto, Cookie silvia.session (nicht Better Auth). Anrufe, Termine, Akte, Protokoll liegen in der Datenbank.\n\nEinstellungen gelten für Silvia. Trainieren auf /sprechen schreibt in „Was Silvia gelernt hat“.\n\nOhne DATABASE_URL: PGLite im Speicher – Restart löscht Testordinationen.",
        heading_size=18,
        body_size=15,
    )
    done(s)

    # 6 Feature map
    s = blank(prs)
    kicker(s, "Live im Produkt")
    title(s, "Feature-Karte – alles, was man heute klicken kann")
    features = [
        ("Anrufen", "Homepage und /sprechen – echtes Gespräch, nicht Playback."),
        ("Trainieren", "Dieselbe Leitung. Hinweise merken, dann nachfragen."),
        ("Öffentliche Leitung", "/leitung/{slug} – Anrufer ohne Login."),
        ("Praxistafel", "/app – Heute, Anrufe, Kalender, Protokoll, Notfall, Akte."),
        ("Einstellungen", "Adresse, Zeiten, Nachtdienst, WhatsApp, E-Mail, Link kopieren."),
        ("Akte", "Patienten aus Gesprächen. Demo: Fritz und Wastl."),
        ("Kalender", "Nächster Slot nur in hinterlegten Fenstern, nie an AT-Feiertagen."),
        ("Notfall", "Triage, Nachtdienst je Bundesland, Protokoll geht mit."),
        ("Protokoll", "Interner Thread + wa.me und mailto an die Frau Doktor."),
        ("Stimme & Gesicht", "Fünf Avatare, fünf Stimmen, Grüß Gott statt Hallo."),
        ("AT-Wissen", "Chip, Heimtierdatenbank, Hundeabgabe, U2, Stefanitag."),
        ("Konto", "Registrieren und anmelden. Vertrags- und Testumfang werden vorab abgestimmt."),
    ]
    for i, (h, b) in enumerate(features):
        col, row = i % 3, i // 3
        card(
            s,
            MARGIN + col * Inches(4.05),
            Inches(1.42) + row * Inches(1.35),
            Inches(3.85),
            Inches(1.22),
            h,
            b,
            heading_size=14,
            body_size=12,
        )
    done(s)

    # 7 Anrufen
    s = blank(prs)
    kicker(s, "Leitung")
    title(s, "Silvia wirklich anrufen")
    bullets(
        s,
        [
            "Auf der Startseite sitzt das Telefon im Hero – Anrufen ist kein Link mehr, sondern die Leitung.",
            "Gleicher Baustein auf /sprechen (volle Seite) und im App-Menü „Silvia anrufen“.",
            "Klingeln, Grüß Gott, Mikrofon oder Tippen. Vorschläge: Fritz, Impfung, Atemnot, Rückruf.",
            "Eingeloggt auf /sprechen: Silvia spricht mit den Zeiten und dem Nachtdienst dieser Ordination – nicht Huber.",
            "Ohne Session: Demo-Huber. Homepage bleibt immer Demo, damit Fritz zum Zeigen da ist.",
            "Nach dem Gespräch: Akte, Protokoll, Praxistafel – in der Demo lokal, live in der Datenbank.",
        ],
    )
    done(s)

    # 8 Trainieren
    s = blank(prs)
    kicker(s, "Schulung")
    title(s, "Silvia über denselben Weg trainieren")
    bullets(
        s,
        [
            "Am Telefon umschalten: Anrufen | Trainieren. Dann „Schulung starten“.",
            "Sagen, wie DIESE Ordination arbeitet – z. B. „Mittwoch nur Kastrationen.“ oder „Fritz nur in der Box.“",
            "Silvia wiederholt, was sie sich merkt, und fragt nach dem nächsten Hinweis.",
            "Demo (Homepage): merkt sich das im Browser. Danach Anrufen und nachfragen.",
            "Live (/sprechen, eingeloggt): landet unter Einstellungen → „Was Silvia gelernt hat“. Löschen geht dort.",
            "Öffentliche Anrufer-URL /leitung/… hat kein Trainieren – Klientel soll die Ordination nicht umprogrammieren.",
        ],
    )
    done(s)

    # 9 Praxistafel
    s = blank(prs)
    kicker(s, "Arbeitsplatz der Kassa")
    title(s, "Die Praxistafel – /app")
    rows = [
        ("Heute", "/app", "Zähler und Überblick: Anrufe, Termine, Notfälle des Tages."),
        ("Anrufe", "/app/anrufe", "Kanal, Anrufer, Tier, Anliegen, Status, Transkript."),
        ("Kalender", "/app/kalender", "Slots, Walk-in, bestätigen/absagen. SMS- und WhatsApp-Entwürfe für die Halterin."),
        ("Protokoll", "/app/nachrichten", "Intern an die Frau Doktor (wa.me / mailto). Bestätigung an die Klientel."),
        ("Notfall", "/app/notfall", "Triage. Kassa ruft Nachtdienst an (tel / SMS / WhatsApp aus den Einstellungen)."),
        ("Akte", "/app/akte", "Patienten dieser Ordination – nicht Fritz aus der Demo."),
        ("Einstellungen", "/app/einstellungen", "Stammdaten, Zeiten, Nachtdienst, Leitungslink, Gelerntes."),
    ]
    box = s.shapes.add_textbox(MARGIN, Inches(1.5), Inches(12), Inches(5.4))
    tf = box.text_frame
    tf.word_wrap = True
    tf.clear()
    for i, (name, path, desc) in enumerate(rows):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(8)
        r1 = p.add_run()
        r1.text = f"{name}   "
        set_run(r1, size=16, bold=True, color=GREEN)
        r2 = p.add_run()
        r2.text = f"{path}   "
        set_run(r2, size=14, color=MUTED)
        r3 = p.add_run()
        r3.text = desc
        set_run(r3, size=15, color=INK)
    done(s)

    # 10 Einstellungen
    s = blank(prs)
    kicker(s, "Tenant")
    title(s, "Einstellungen machen Silvia zur eigenen")
    bullets(
        s,
        [
            "Name, Inhaberin, Straße, PLZ, Ort, Bundesland.",
            "Telefon, WhatsApp, E-Mail, Praxissoftware (vetera, easyVET, pentavèt, Animondo, …).",
            "Ordinationszeiten je Tag – Silvia legt nur in diesen Fenstern. Format 8:00–12:00, 14:00–18:00.",
            "Nachtdienst: Stelle, Telefon, Hinweis. Default je Bundesland (Wien: Vetmeduni).",
            "Interne Notiz + gelernte Fakten vom Trainieren.",
            "Öffentliche Leitung: Link /leitung/{slug} kopieren – Anrufer brauchen kein Konto. Gespräche landen auf der Tafel.",
        ],
    )
    done(s)

    # 11 Öffentliche Leitung
    s = blank(prs)
    kicker(s, "Anrufer ohne Login")
    title(s, "Die öffentliche Leitung")
    bullets(
        s,
        [
            "Jede Ordination bekommt einen Slug (z. B. tierordination-murtal).",
            "URL: https://…/leitung/<slug> – teilen wie eine Nummer.",
            "Der Slug gewinnt vor einer Staff-Session: wer eingeloggt eine fremde Leitung anruft, schreibt nicht auf die eigene Tafel.",
            "Kanal im Board: web (nicht telefon) – damit man sieht, woher der Anruf kam.",
            "Das ist die Brücke zur echten Nummer: erst der Link, später PSTN (Twilio o. ä.) mit Keys.",
        ],
    )
    done(s)

    # 12 Akte
    s = blank(prs)
    kicker(s, "Sonderedition")
    title(s, "Akte: Silvia kennt Fritz")
    card(
        s,
        MARGIN,
        Inches(1.55),
        Inches(5.8),
        Inches(4.8),
        "In der Demo",
        "Fritz, Kater von Mag. Eva Berger – nur in der Transportbox. Wastl mit Chip 040098100123456. Chip nachschlagen auf der Startseite.\n\nOhne Akte sagt Silvia ehrlich: Standard-Leitung, keine Kartei. Mit Akte liest sie letzten Besuch, Impfung, Warnungen.",
        heading_size=18,
        body_size=15,
    )
    card(
        s,
        Inches(6.85),
        Inches(1.55),
        Inches(5.8),
        Inches(4.8),
        "In der Live-Ordination",
        "Keine Demo-Tiere. Die Kartei füllt sich aus Gesprächen (Name, Spezies, Chip, Notiz). Leere Akte: Silvia sagt das und legt trotzdem einen Slot.\n\nPreis und Umfang der Akte werden separat vereinbart; die Integration in Praxissoftware braucht eine eigene technische Abnahme.",
        heading_size=18,
        body_size=15,
    )
    done(s)

    # 13 Notfall & Kalender
    s = blank(prs)
    kicker(s, "Klinisch relevant, ohne zu behandeln")
    title(s, "Notfall und Kalender")
    card(
        s,
        MARGIN,
        Inches(1.55),
        Inches(5.8),
        Inches(4.8),
        "Notfall",
        "Atemnot, blaue Schleimhäute, Blutung, Krampf, Gift, Unfall, aufgeblähter Bauch, Stachel, Geburt, Trauma.\n\nSilvia triagiert und schreibt das Protokoll. Auf /app/notfall ruft die Kassa den hinterlegten Nachtdienst an (tel, SMS, WhatsApp – Wien default Vetmeduni). Kein medizinischer Rat.",
        heading_size=18,
        body_size=15,
    )
    card(
        s,
        Inches(6.85),
        Inches(1.55),
        Inches(5.8),
        Inches(4.8),
        "Kalender",
        "Nächster freier Slot aus den hinterlegten Fenstern. 20 Minuten. Nie an gesetzlichen Feiertagen (Stefanitag, nicht 2. Weihnachtstag; Karfreitag in AT kein gesetzlicher Feiertag).\n\nMittag 12–14 oft zu – Silvia sagt die hinterlegten Zeiten, nicht das Wort Mittagssperre als Gesetz.",
        heading_size=18,
        body_size=15,
    )
    done(s)

    # 14 Protokoll
    s = blank(prs)
    kicker(s, "An die Frau Doktor")
    title(s, "WhatsApp und E-Mail – Entwürfe, kein Versand")
    bullets(
        s,
        [
            "Nach dem Gespräch liegt ein internes Protokoll plus optional eine Bestätigung an die Klientel.",
            "Intern (/app/nachrichten): wa.me und mailto an die Frau Doktor aus den Einstellungen. Ohne WhatsApp-Nummer bleibt der Senden-Knopf weg.",
            "An die Halterin: auf Heute, Kalender, Akte und Anrufe – „SMS an Halterin“ und „WhatsApp an Halterin“ auf patients.phone (sms:+43… / wa.me).",
            "Silvia sendet nichts selbst. Das ist kein WhatsApp-Business-API, kein SMTP, keine SMS-Zentrale – der Entwurf öffnet sich auf dem Handy der Kassa.",
            "Live-Anruf: Silvia fragt nach Name und Handy der Halterin. Chipnummern werden nicht als Handy gelesen.",
        ],
    )
    done(s)

    # 15 AT
    s = blank(prs)
    kicker(s, "Nur in Österreich")
    title(s, "Was eine DE-Lösung nicht mitbringt")
    rows = [
        ("Sprache", "Ordination, Jänner, Handy, Nachtdienst, Grüß Gott, heuer, Stefanitag, Spital, Kassa, Klientel, Frau Doktor"),
        ("Kalender", "Heilige Drei Könige, Fronleichnam, Mariä Empfängnis, Nationalfeiertag 26. Oktober. Karfreitag kein gesetzlicher Feiertag."),
        ("Nachtdienst", "Neun Bundesländer, Wien typisch Vetmeduni. Hinterlegbar in den Einstellungen."),
        ("Register", "Chippflicht Hund seit 2010, Heimtierdatenbank. Silvia nimmt die Nummer, sie meldet nicht selbst."),
        ("Wien", "U2 Rathaus, Maulkorb in den Linien außer Box, Kurzparkzone / Parkpickerl, Hundeabgabe MA 6."),
        ("Reise", "EU-Heimtierausweis, Tollwut, Slot vor Italien / Kroatien / Ungarn / Slowenien."),
    ]
    box = s.shapes.add_textbox(MARGIN, Inches(1.48), Inches(12), Inches(5.4))
    tf = box.text_frame
    tf.word_wrap = True
    tf.clear()
    for i, (name, desc) in enumerate(rows):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(10)
        r1 = p.add_run()
        r1.text = f"{name}   "
        set_run(r1, size=16, bold=True, color=GREEN)
        r2 = p.add_run()
        r2.text = desc
        set_run(r2, size=15, color=INK)
    done(s)

    # 16 Stimme
    s = blank(prs)
    kicker(s, "Marke")
    title(s, "Immer Silvia. Gesicht und Stimme wählbar.")
    bullets(
        s,
        [
            "Fünf Gesichter (Wien, Graz, Linz, Innsbruck, Salzburg) – AvatarPicker auf Start und /sprechen.",
            "Lokale Piper-Stimme für den Praxisbetrieb; die separate Live-Demo nutzt eine Cloud-Stimme nur mit erfundenen Inhalten.",
            "Ton: erfahrene Rezeptionistin, Siezen, knapp, 2–5 Sätze. Kein Dialekt-Theater, kein Oida, kein Hallo.",
            "Das ist das Verkaufsargument: nicht ein Chatbot, sondern die Stimme am Apparat.",
        ],
    )
    done(s)

    # 17 Preise
    s = blank(prs)
    kicker(s, "Zahlen")
    title(s, "Zwei ehrliche Varianten – Umfang und Preis nach Abnahme")
    plans = [
        ("Silvia Premium", "Preis nach Abstimmung", "Lokaler Trainingsdialog, österreichische Begrüßung, Praxiswissen und Korrektur. Demo verfügbar."),
        ("Silvia Live", "Nur nach Freigabe", "Getrennte GPT-Live-1-Demo mit Marin und erfundenen Inhalten. Nicht für echte Praxisdaten."),
    ]
    for i, (name, price, body) in enumerate(plans):
        card(
            s,
            MARGIN + i * Inches(6.05),
            Inches(1.5),
            Inches(5.8),
            Inches(3.4),
            f"{name}   {price}",
            body,
            heading_size=18,
            body_size=14,
        )
    note = s.shapes.add_textbox(MARGIN, Inches(5.15), Inches(12), Inches(1.5))
    add_text(
        note,
        "Preise, Einrichtung, Telefonie, Minuten und optionale PMS-Anbindung werden vor dem Start gemeinsam festgelegt.\nPremium ist die lokale Praxisvariante. Live bleibt eine getrennte Demo mit erfundenen Inhalten und wird nicht für echte Praxisdaten freigegeben.",
        size=14,
        color=MUTED,
    )
    done(s)

    # 18 Live vs Roadmap
    s = blank(prs)
    kicker(s, "Ehrlich zum Kollegen")
    title(s, "Heute belegbar  vs.  noch offen")
    card(
        s,
        MARGIN,
        Inches(1.5),
        Inches(5.8),
        Inches(5.0),
        "Kann man zeigen",
        "Gespräch · Trainieren · Demo-Huber · Registrieren und Praxistafel · Einstellungen steuern Silvia · öffentliche /leitung · Anrufe mit Transkript · Kalender bestätigen/absagen/Walk-in · SMS- und WhatsApp-Entwürfe an die Halterin · Akte mit Name und Handy aus dem Satz · Notfall: Nachtdienst anrufen (tel / wa.me) · Protokoll per wa.me und mailto (kein Versand) · AT-Sprache, Zeiten, Feiertage · Avatare.",
        heading_size=18,
        body_size=15,
    )
    card(
        s,
        Inches(6.85),
        Inches(1.5),
        Inches(5.8),
        Inches(5.0),
        "Braucht Keys / kommt als Nächstes",
        "Echte PSTN-Nummer (Twilio o. ä.) · WhatsApp Business API · SMTP · PMS-Live-Sync (vetera, easyVET, …) · Web-Buchungswidget · SMS-Bestätigung · Englisch am Apparat · mehrere Standorte · dauerhaftes Postgres (DATABASE_URL). Diese Punkte brauchen eigene Freigabe und Abnahme.",
        heading_size=18,
        body_size=15,
    )
    done(s)

    # 19 Klickpfad
    s = blank(prs)
    kicker(s, "Selbst durchklicken")
    title(s, "Zehn Minuten für den Kollegen")
    steps = [
        "1.  Startseite öffnen. Rechts das Telefon: Anrufen. Nach Fritz fragen.",
        "2.  Umschalten auf Trainieren. Sagen: „Mittwoch nur Kastrationen.“ Auflegen.",
        "3.  Wieder Anrufen: „Was gilt mittwochs?“ – sie muss es wissen.",
        "4.  /demo öffnen: Praxistafel der Huber-Sandbox (localStorage).",
        "5.  /registrieren: eigene Ordination. Dann /app – leere Tafel, eigene Silvia.",
        "6.  /app/einstellungen: Zeiten und Nachtdienst ändern, Leitungslink kopieren.",
        "7.  Abmelden. Den Link /leitung/… als Anrufer öffnen. Etwas sagen. Wieder anmelden: der Anruf liegt auf der Tafel.",
        "8.  /app/kalender: Walk-in legen, bestätigen. „SMS an Halterin“ und „WhatsApp an Halterin“ (öffnet Entwurf, sendet nicht).",
        "9.  /app/notfall: hinterlegten Nachtdienst anrufen / WhatsApp. /app/nachrichten: wa.me und mailto intern.",
        "10. /preise nur zum Lesen. Ohne XAI_API_KEY reicht Tippen. VITE_AUTH_ENABLED bleibt false.",
    ]
    bullets(s, steps, size=15, top=Inches(1.48))
    done(s)

    # 20 URLs
    s = blank(prs)
    kicker(s, "Landkarte")
    title(s, "Routen, die zählen")
    rows = [
        ("/", "Verkauf + echte Demo-Leitung (Anrufen / Trainieren)"),
        ("/sprechen", "Volle Leitung; eingeloggt = Tenant, sonst Huber"),
        ("/leitung/$slug", "Öffentliche Anrufer-URL der Ordination"),
        ("/registrieren  /login", "Konto. Session-Cookie silvia.session"),
        ("/app/…", "Heute, Anrufe, Kalender, Protokoll, Notfall, Akte, Einstellungen"),
        ("/demo/…", "Huber-Sandbox, nicht die Live-Tafel"),
        ("/preise  /werkzeuge", "Tarife, Killer-Features, Chip-Suche"),
        ("Dev", "npm run dev → Port 8080. Neue migrations/*.sql: Vite neu starten."),
    ]
    box = s.shapes.add_textbox(MARGIN, Inches(1.48), Inches(12), Inches(5.4))
    tf = box.text_frame
    tf.word_wrap = True
    tf.clear()
    for i, (name, desc) in enumerate(rows):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(9)
        r1 = p.add_run()
        r1.text = f"{name}     "
        set_run(r1, size=16, bold=True, color=GREEN)
        r2 = p.add_run()
        r2.text = desc
        set_run(r2, size=16, color=INK)
    done(s)

    # 21 Close
    s = blank(prs, cream=False)
    rect(s, 0, 0, W, H, GREEN)
    rect(s, 0, 0, Inches(0.18), H, OK)
    k = s.shapes.add_textbox(MARGIN, Inches(2.0), Inches(11), Inches(0.4))
    add_text(k, "NÄCHSTER SCHRITT", size=13, bold=True, color=OK)
    t = s.shapes.add_textbox(MARGIN, Inches(2.5), Inches(12), Inches(1.6))
    add_text(t, "Demo zeigen.\nAbnahme festlegen.", size=36, bold=True, color=WHITE, font="Georgia")
    sub = s.shapes.add_textbox(MARGIN, Inches(4.5), Inches(11.5), Inches(1.6))
    add_text(
        sub,
        "Nächster Schritt: den Klickpfad mit synthetischen Daten prüfen und anschließend\nPSTN, WhatsApp Business oder PMS nur mit eigener Freigabe beauftragen.",
        size=18,
        color=CREAM,
    )
    foot = s.shapes.add_textbox(MARGIN, Inches(6.5), Inches(11), Inches(0.4))
    add_text(foot, "silvia  ·  Wien  ·  Premium lokal  ·  Live-Demo getrennt", size=14, color=OK)
    done(s)

    total = len(slides)
    for i, sl in enumerate(slides, 1):
        # skip full-bleed title/close
        bg = sl.shapes[0]
        try:
            fill_rgb = bg.fill.fore_color.rgb
        except Exception:
            fill_rgb = CREAM
        if fill_rgb == GREEN:
            continue
        footer(sl, i, total)

    out_docs = Path("/workspace/docs/Silvia-Pitch-Kollegen.pptx")
    out_art = Path("/opt/cursor/artifacts/Silvia-Pitch-Kollegen.pptx")
    prs.save(out_docs)
    prs.save(out_art)
    print(f"wrote {out_docs} ({out_docs.stat().st_size} bytes), {total} slides")


if __name__ == "__main__":
    build()
