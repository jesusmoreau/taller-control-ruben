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

-- Notas de voz por evento (el audio va en el mismo bucket "photos").
create table if not exists public.audios (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  path        text not null,
  duration_ms integer not null default 0,
  mime        text not null default 'audio/webm',
  created_at  timestamptz not null default now()
);

create index if not exists audios_event_idx on public.audios (event_id);
alter table public.audios enable row level security;

-- Coche: una fila por matrícula. Guarda lo que es del coche y no de un evento,
-- como el semáforo de trabajo (red = bloqueado, yellow = listo para empezar, green = en curso).
create table if not exists public.cars (
  plate      text primary key,               -- normalizada: 1234BCD
  status     text check (status in ('red', 'yellow', 'green')),
  status_at  timestamptz,
  created_at timestamptz not null default now()
);
alter table public.cars enable row level security;

-- Migración de una base existente: crear el coche de cada matrícula con eventos
-- y exigir que cada evento pertenezca a un coche.
insert into public.cars (plate, created_at)
select plate, min(occurred_at) from public.events group by plate
on conflict (plate) do nothing;

do $$ begin
  alter table public.events
    add constraint events_plate_fkey foreign key (plate) references public.cars (plate);
exception when duplicate_object then null;
end $$;
