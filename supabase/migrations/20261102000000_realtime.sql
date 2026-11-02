-- Habilita Realtime para o painel atualizar na hora. Idempotente.
do $$
declare t text;
begin
  foreach t in array array['lancamentos', 'saldos'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
