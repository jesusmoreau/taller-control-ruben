-- Ejecutar una sola vez en Supabase: SQL Editor → New query → pegar → Run.

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  plate       text not null,                 -- normalizada: 1234BCD
  occurred_at timestamptz not null default now(),
  description text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists events_plate_idx on public.events (plate, occurred_at desc);

create table if not exists public.photos (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  path       text not null,                  -- ruta dentro del bucket "photos"
  kind       text not null default 'car' check (kind in ('plate', 'car')),
  created_at timestamptz not null default now()
);

create index if not exists photos_event_idx on public.photos (event_id);

-- RLS activado y sin políticas: solo el servidor (secret key) puede leer y escribir.
alter table public.events enable row level security;
alter table public.photos enable row level security;

-- Bucket privado para las fotos. Se accede con URLs firmadas.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;
