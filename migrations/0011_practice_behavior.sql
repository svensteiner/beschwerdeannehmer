-- AP 51: Freitext-Verhalten je Praxis — die Inhaberin kann in eigenen Worten
-- festlegen, wie Silvia sich verhalten soll (Tonfall, Tabus, Besonderheiten).
-- Der Text landet unverändert als eigener Block im System-Prompt, nach den Fakten.
alter table practices add column if not exists behavior text not null default '';
