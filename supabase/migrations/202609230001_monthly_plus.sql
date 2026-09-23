begin;

alter table public.clientes
  add column if not exists plano_mensal text not null default 'comum';

update public.clientes
set plano_mensal = 'mensalista'
where mensalista = true
  and plano_mensal = 'comum';

update public.clientes
set mensalidade_centavos = case plano_mensal
  when 'mensalista_plus' then 18000
  else 16000
end;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clientes_plano_mensal_valido'
      and conrelid = 'public.clientes'::regclass
  ) then
    alter table public.clientes
      add constraint clientes_plano_mensal_valido
      check (plano_mensal in ('comum', 'mensalista', 'mensalista_plus'));
  end if;
end
$$;

create index if not exists clientes_plano_mensal_idx
  on public.clientes (plano_mensal)
  where plano_mensal <> 'comum';

commit;
