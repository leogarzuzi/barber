begin;

create table if not exists public.clientes_bloqueados (
  id uuid primary key default gen_random_uuid(),
  whatsapp text not null unique constraint clientes_bloqueados_whatsapp check (whatsapp ~ '^55[0-9]{10,11}$'),
  motivo text not null default '' constraint clientes_bloqueados_motivo check (length(motivo) <= 300),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

drop trigger if exists clientes_bloqueados_atualizado_em on public.clientes_bloqueados;
create trigger clientes_bloqueados_atualizado_em
  before update on public.clientes_bloqueados
  for each row execute function public.definir_atualizado_em();

alter table public.clientes_bloqueados enable row level security;

drop policy if exists "dono gerencia clientes bloqueados" on public.clientes_bloqueados;
create policy "dono gerencia clientes bloqueados"
  on public.clientes_bloqueados
  for all
  to authenticated
  using ((select public.usuario_e_dono()))
  with check ((select public.usuario_e_dono()));

revoke all on table public.clientes_bloqueados from anon;
grant select, insert, update, delete on table public.clientes_bloqueados to authenticated;

commit;
