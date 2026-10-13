begin;

alter table public.clientes
  add column if not exists aniversario_dia smallint,
  add column if not exists aniversario_mes smallint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clientes_aniversario_valido'
      and conrelid = 'public.clientes'::regclass
  ) then
    alter table public.clientes
      add constraint clientes_aniversario_valido
      check (
        (aniversario_dia is null and aniversario_mes is null)
        or
        (
          aniversario_dia is not null
          and aniversario_mes is not null
          and aniversario_mes between 1 and 12
          and aniversario_dia between 1 and case aniversario_mes
            when 2 then 29
            when 4 then 30
            when 6 then 30
            when 9 then 30
            when 11 then 30
            else 31
          end
        )
      );
  end if;
end
$$;

create index if not exists clientes_aniversario_idx
  on public.clientes (aniversario_mes, aniversario_dia)
  where aniversario_dia is not null and aniversario_mes is not null;

commit;
