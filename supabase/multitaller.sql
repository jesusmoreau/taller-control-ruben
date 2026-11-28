-- ── Varios talleres ───────────────────────────────────────────────────────────
-- Se ejecuta con scripts/migrar-multitaller.mjs (dentro de una transacción).
-- Es idempotente: si ya se aplicó, no cambia nada.
--
-- Cada taller tiene su contraseña: con ella se entra a la app y se ven solo sus datos.
-- Cada tabla de datos lleva workshop_id y el servidor filtra siempre por él (src/lib/session.ts).
-- Como el resto de tablas, RLS activado y sin políticas: solo el servidor (clave secreta) accede.

create table if not exists public.workshops (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  -- scrypt: "scrypt$<salt hex>$<hash hex>". La contraseña nunca se guarda en claro.
  password_hash text not null,
  -- El taller de las sesiones abiertas antes de haber varios talleres (cookie antigua).
  legacy        boolean not null default false,
  created_at    timestamptz not null default now()
);
create unique index if not exists workshops_one_legacy on public.workshops (legacy) where legacy;
alter table public.workshops enable row level security;

-- Pasar los datos existentes al primer taller (solo la primera vez).
do $$
declare
  w uuid;
  t text;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cars' and column_name = 'workshop_id'
  ) then
    return;
  end if;

  insert into public.workshops (name, password_hash, legacy)
  values (
    coalesce(nullif(current_setting('app.taller', true), ''), 'Mi taller'),
    current_setting('app.password_hash'),
    true
  )
  returning id into w;

  foreach t in array array['cars', 'events', 'photos', 'audios', 'workers', 'work_sessions'] loop
    execute format('alter table public.%I add column workshop_id uuid references public.workshops (id) on delete cascade', t);
    execute format('update public.%I set workshop_id = $1', t) using w;
    execute format('alter table public.%I alter column workshop_id set not null', t);
  end loop;

  -- La matrícula es única dentro de cada taller, no en general: dos talleres pueden tener el mismo coche.
  alter table public.events drop constraint events_plate_fkey;
  alter table public.work_sessions drop constraint work_sessions_plate_fkey;
  alter table public.cars drop constraint cars_pkey;
  alter table public.cars add primary key (workshop_id, plate);

  -- Claves compuestas: una fila nunca puede apuntar a datos de otro taller.
  alter table public.events add constraint events_workshop_id_key unique (workshop_id, id);
  alter table public.workers add constraint workers_workshop_id_key unique (workshop_id, id);

  alter table public.events
    add constraint events_car_fkey foreign key (workshop_id, plate) references public.cars (workshop_id, plate);
  alter table public.work_sessions
    add constraint work_sessions_car_fkey foreign key (workshop_id, plate) references public.cars (workshop_id, plate);

  alter table public.photos drop constraint photos_event_id_fkey;
  alter table public.photos
    add constraint photos_event_fkey foreign key (workshop_id, event_id) references public.events (workshop_id, id) on delete cascade;
  alter table public.audios drop constraint audios_event_id_fkey;
  alter table public.audios
    add constraint audios_event_fkey foreign key (workshop_id, event_id) references public.events (workshop_id, id) on delete cascade;

  alter table public.work_sessions drop constraint work_sessions_worker_id_fkey;
  alter table public.work_sessions
    add constraint work_sessions_worker_fkey foreign key (workshop_id, worker_id) references public.workers (workshop_id, id) on delete cascade;
  alter table public.work_sessions drop constraint work_sessions_event_id_fkey;
  alter table public.work_sessions
    add constraint work_sessions_event_fkey foreign key (workshop_id, event_id) references public.events (workshop_id, id)
    on delete set null (event_id);

  -- El nombre de un operario es único dentro de su taller.
  alter table public.workers drop constraint workers_name_key;
  alter table public.workers add constraint workers_workshop_name_key unique (workshop_id, name);
end $$;

-- Índices por taller (las consultas siempre filtran por él).
create index if not exists events_workshop_plate_idx on public.events (workshop_id, plate, occurred_at desc);
create index if not exists events_workshop_time_idx on public.events (workshop_id, occurred_at desc);
create index if not exists work_sessions_workshop_time_idx on public.work_sessions (workshop_id, started_at desc);
create index if not exists cars_workshop_status_idx on public.cars (workshop_id) where status is not null;
create index if not exists workers_workshop_idx on public.workers (workshop_id);
