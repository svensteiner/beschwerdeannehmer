-- AP 20: Ersteinrichtung aus der Praxissoftware. Freitext-Listen für Ärzte/Räume,
-- übernommen (nach Review-Bestätigung) aus dem Connector, sonst von Hand gepflegt.
alter table practices add column if not exists vets text not null default '';
alter table practices add column if not exists resources text not null default '';
