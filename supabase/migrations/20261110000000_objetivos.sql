-- ============================================================
-- Migração 10/11/2026: objetivo de poupança de cada criança (ela mesma cadastra).
-- Um objetivo ativo por criança. Concluir só marca como conquistado: não mexe no saldo.
-- Idempotente.
-- ============================================================
create table if not exists objetivos_poupanca (
  id uuid primary key default gen_random_uuid(),
  crianca_id uuid not null references perfis(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 60),
  icone text,
  valor_alvo numeric(10,2) not null check (valor_alvo > 0 and valor_alvo <= 100000),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  concluido_em timestamptz
);
create unique index if not exists objetivos_um_ativo on objetivos_poupanca (crianca_id) where ativo;
alter table objetivos_poupanca enable row level security;

-- Responsável vê e mexe em todos; criança só nos dela.
drop policy if exists "leitura_objetivos" on objetivos_poupanca;
create policy "leitura_objetivos" on objetivos_poupanca for select
  using (meu_papel() = 'responsavel' or crianca_id = meu_perfil_id());

drop policy if exists "escrita_objetivos" on objetivos_poupanca;
create policy "escrita_objetivos" on objetivos_poupanca for all
  using (meu_papel() = 'responsavel' or crianca_id = meu_perfil_id())
  with check (meu_papel() = 'responsavel' or crianca_id = meu_perfil_id());

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'objetivos_poupanca') then
    alter publication supabase_realtime add table public.objetivos_poupanca;
  end if;
end $$;
