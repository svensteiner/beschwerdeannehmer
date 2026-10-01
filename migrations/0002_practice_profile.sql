alter table practices add column if not exists hours_json text not null default '[]';
alter table practices add column if not exists nachtdienst_name text not null default '';
alter table practices add column if not exists nachtdienst_phone text not null default '';
alter table practices add column if not exists nachtdienst_note text not null default '';
alter table practices add column if not exists notes text not null default '';
