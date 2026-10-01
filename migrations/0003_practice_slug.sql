alter table practices add column if not exists slug text not null default '';

create unique index if not exists practices_slug_uidx on practices (slug) where slug <> '';
