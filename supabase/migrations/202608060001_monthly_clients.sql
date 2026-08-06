alter table public.clientes
  add column if not exists mensalista boolean not null default false,
  add column if not exists mensalidade_centavos integer not null default 16000;

alter table public.clientes
  drop constraint if exists clientes_mensalidade_valor;

alter table public.clientes
  add constraint clientes_mensalidade_valor
  check (mensalidade_centavos > 0);

alter table public.agendamentos
  add column if not exists coberto_por_mensalidade boolean not null default false;

alter table public.agendamentos
  drop constraint if exists agendamentos_valor;

alter table public.agendamentos
  add constraint agendamentos_valor check (valor_centavos >= 0);

create index if not exists clientes_mensalistas_idx
  on public.clientes (mensalista)
  where mensalista = true;

create index if not exists agendamentos_mensalidade_idx
  on public.agendamentos (data, coberto_por_mensalidade)
  where coberto_por_mensalidade = true;
