alter table public.agendamentos
  add column google_event_id text,
  add column google_sync_status text not null default 'pendente',
  add column google_sync_error text,
  add column google_sincronizado_em timestamptz,
  add constraint agendamentos_google_sync_status_check
    check (google_sync_status in ('pendente', 'sincronizado', 'erro', 'removido'));

update public.agendamentos
set google_sync_status = 'removido'
where status = 'cancelado';

create index agendamentos_google_sync_status_idx
  on public.agendamentos (google_sync_status)
  where google_sync_status in ('pendente', 'erro');

create table public.google_calendar_conexoes (
  id smallint primary key default 1
    constraint google_calendar_conexoes_unica check (id = 1),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  google_email text not null,
  calendar_id text not null,
  calendar_nome text not null default 'PH10 — Reservas',
  refresh_token_criptografado text,
  conectado boolean not null default false,
  conectado_em timestamptz,
  atualizado_em timestamptz not null default now()
);

create trigger google_calendar_conexoes_atualizado_em
before update on public.google_calendar_conexoes
for each row execute function public.definir_atualizado_em();

alter table public.google_calendar_conexoes enable row level security;

revoke all on table public.google_calendar_conexoes from anon, authenticated;
