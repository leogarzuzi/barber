create table public.usuarios_painel (
  user_id uuid primary key references auth.users(id) on delete cascade,
  papel text not null constraint usuarios_painel_papel_check
    check (papel in ('proprietario', 'administrador')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null
);

alter table public.usuarios_painel enable row level security;

-- A lista de administradores não é exposta pela API. O acesso é consultado
-- somente pela função SECURITY DEFINER usada nas políticas RLS existentes.
revoke all on table public.usuarios_painel from anon, authenticated;

-- Mantém o proprietário atual explicitamente registrado como membro do painel.
insert into public.usuarios_painel (user_id, papel, criado_por)
select owner_id, 'proprietario', owner_id
from public.configuracoes
where id = 1
on conflict (user_id) do update
set papel = 'proprietario', ativo = true;

-- A função que consulta a lista de acesso fica fora dos schemas expostos pela
-- API. A função pública abaixo é apenas um invólucro sem privilégios elevados,
-- preservando o nome usado pelas políticas RLS existentes.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.usuario_tem_acesso_painel()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.usuarios_painel
      where user_id = (select auth.uid())
        and ativo = true
    );
$$;

revoke all on function private.usuario_tem_acesso_painel() from public;
grant execute on function private.usuario_tem_acesso_painel() to authenticated;

create or replace function public.usuario_e_dono()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.usuario_tem_acesso_painel();
$$;

revoke all on function public.usuario_e_dono() from public;
grant execute on function public.usuario_e_dono() to authenticated;
