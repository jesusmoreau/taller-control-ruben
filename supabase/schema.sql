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

-- ── Operarios, tiempos de trabajo, motivo del rojo y datos del coche ──

-- Motivo del rojo y datos del coche (a mano).
alter table public.cars
  add column if not exists blocked_reason text,
  add column if not exists blocked_note   text,
  add column if not exists make           text,
  add column if not exists model          text,
  add column if not exists engine         text,
  add column if not exists km             integer check (km >= 0);

-- Operarios del taller.
create table if not exists public.workers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  active     boolean not null default true,
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.workers enable row level security;
insert into public.workers (name, sort) values ('Rubén', 1), ('Max', 2), ('Diego', 3), ('Igor', 4)
on conflict (name) do nothing;

-- Tramos de trabajo: con cronómetro (ended_at null mientras está en marcha) o metidos a mano.
-- plate null = trabajo sin coche.
create table if not exists public.work_sessions (
  id          uuid primary key default gen_random_uuid(),
  worker_id   uuid not null references public.workers (id) on delete cascade,
  plate       text references public.cars (plate),
  event_id    uuid references public.events (id) on delete set null,
  description text not null default '',
  started_at  timestamptz not null,
  ended_at    timestamptz,
  source      text not null default 'timer' check (source in ('timer', 'manual')),
  created_at  timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
alter table public.work_sessions enable row level security;
create index if not exists work_sessions_plate_idx on public.work_sessions (plate, started_at desc);
create index if not exists work_sessions_worker_idx on public.work_sessions (worker_id, started_at desc);
-- Un operario solo puede tener un cronómetro en marcha.
create unique index if not exists work_sessions_one_running on public.work_sessions (worker_id) where ended_at is null;
