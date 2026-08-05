do $$
declare
  intervalo_atual integer;
  data_local date;
begin
  select configuracoes.intervalo_minutos,
         (now() at time zone configuracoes.timezone)::date
    into intervalo_atual, data_local
    from public.configuracoes
   where id = 1;

  if intervalo_atual is null then
    raise exception 'A configuração da agenda não foi encontrada.';
  end if;

  if exists (
    select 1
      from public.agendamentos a
      join public.agendamentos b
        on b.data = a.data
       and b.id > a.id
       and b.status = 'agendado'
     where a.status = 'agendado'
       and a.data >= data_local
       and tsrange(
             a.data + a.hora,
             a.data + a.hora + make_interval(mins => intervalo_atual),
             '[)'
           ) && tsrange(
             b.data + b.hora,
             b.data + b.hora + make_interval(mins => intervalo_atual),
             '[)'
           )
  ) then
    raise exception 'Existem reservas futuras que se sobreporiam usando o intervalo atual da agenda. Ajuste-as antes de executar esta migração.';
  end if;

  update public.agendamentos
     set duracao_minutos = intervalo_atual,
         google_sync_status = 'pendente',
         google_sync_error = null
   where status = 'agendado'
     and data >= data_local
     and duracao_minutos <> intervalo_atual;
end
$$;
