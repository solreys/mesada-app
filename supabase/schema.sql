-- ============================================================
-- Schema: App de Mesada Dinâmica (Zon & Ettore)
-- Postgres / Supabase
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Perfis ----------
create type papel as enum ('responsavel', 'crianca');

create table perfis (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null, -- null para crianças (sem login próprio)
  nome text not null,
  papel papel not null,
  avatar_url text,
  criado_em timestamptz not null default now()
);

-- ---------- Catálogo de regras (punições e bônus) ----------
create type categoria_item as enum ('punicao', 'bonus');

create table itens_regras (
  id uuid primary key default gen_random_uuid(),
  categoria categoria_item not null,
  descricao text not null,
  valor numeric(10,2) not null, -- negativo para punição, positivo para bônus
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------- Lançamentos (extrato / histórico) ----------
create table lancamentos (
  id uuid primary key default gen_random_uuid(),
  crianca_id uuid not null references perfis(id) on delete cascade,
  item_id uuid references itens_regras(id) on delete set null, -- null se for lançamento manual/avulso
  descricao text not null, -- snapshot da descrição no momento do lançamento
  valor numeric(10,2) not null, -- snapshot do valor
  lancado_por uuid not null references perfis(id),
  observacao text,
  criado_em timestamptz not null default now()
);

-- ---------- Saldo (mesada operacional do mês + poupança) ----------
create table saldos (
  crianca_id uuid primary key references perfis(id) on delete cascade,
  saldo_mes numeric(10,2) not null default 0,   -- reseta / ajusta mensalmente com base nos lançamentos
  saldo_poupanca numeric(10,2) not null default 0, -- valor que a criança optou por guardar, rende CDI
  atualizado_em timestamptz not null default now()
);

-- ---------- Transferência para poupança ----------
create table transferencias_poupanca (
  id uuid primary key default gen_random_uuid(),
  crianca_id uuid not null references perfis(id) on delete cascade,
  valor numeric(10,2) not null, -- positivo = mês->poupança, negativo = resgate
  lancado_por uuid not null references perfis(id),
  criado_em timestamptz not null default now()
);

-- ---------- Configuração financeira (taxa CDI mensal) ----------
create table config_financeira (
  id uuid primary key default gen_random_uuid(),
  mes_referencia date not null, -- primeiro dia do mês (ex: 2026-09-01)
  taxa_cdi_pct numeric(6,4) not null, -- % do CDI no mês (ex: 0.90 = 0,90%)
  multiplicador numeric(5,2) not null default 1.00, -- 100% do CDI = 1.00
  criado_por uuid references perfis(id),
  criado_em timestamptz not null default now(),
  unique (mes_referencia)
);

-- ---------- Histórico de rendimento aplicado ----------
create table rendimentos_historico (
  id uuid primary key default gen_random_uuid(),
  crianca_id uuid not null references perfis(id) on delete cascade,
  mes_referencia date not null,
  saldo_base numeric(10,2) not null,
  taxa_aplicada_pct numeric(6,4) not null,
  valor_rendimento numeric(10,2) not null,
  aplicado_em timestamptz not null default now(),
  unique (crianca_id, mes_referencia)
);

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
alter table perfis enable row level security;
alter table itens_regras enable row level security;
alter table lancamentos enable row level security;
alter table saldos enable row level security;
alter table transferencias_poupanca enable row level security;
alter table config_financeira enable row level security;
alter table rendimentos_historico enable row level security;

-- Helper: papel do usuário autenticado
create or replace function meu_papel() returns papel as $$
  select papel from perfis where auth_user_id = auth.uid() limit 1;
$$ language sql stable security definer;

-- Leitura: qualquer perfil autenticado da família vê tudo (dashboard compartilhado)
create policy "leitura_geral_perfis" on perfis for select using (true);
create policy "leitura_geral_itens" on itens_regras for select using (true);
create policy "leitura_geral_lancamentos" on lancamentos for select using (true);
create policy "leitura_geral_saldos" on saldos for select using (true);
create policy "leitura_geral_transferencias" on transferencias_poupanca for select using (true);
create policy "leitura_geral_config" on config_financeira for select using (true);
create policy "leitura_geral_rendimentos" on rendimentos_historico for select using (true);

-- Escrita: só responsável lança pontos, edita catálogo e config
create policy "escrita_responsavel_itens" on itens_regras for all
  using (meu_papel() = 'responsavel') with check (meu_papel() = 'responsavel');

create policy "escrita_responsavel_lancamentos" on lancamentos for insert
  with check (meu_papel() = 'responsavel');

create policy "escrita_responsavel_config" on config_financeira for all
  using (meu_papel() = 'responsavel') with check (meu_papel() = 'responsavel');

create policy "escrita_responsavel_transferencias" on transferencias_poupanca for insert
  with check (meu_papel() = 'responsavel');

-- saldos e rendimentos_historico só são escritos por triggers/functions (security definer), sem policy de insert direta para usuários.

-- ============================================================
-- Trigger: atualizar saldo do mês a cada lançamento
-- ============================================================
create or replace function aplicar_lancamento() returns trigger as $$
begin
  insert into saldos (crianca_id, saldo_mes)
  values (new.crianca_id, new.valor)
  on conflict (crianca_id)
  do update set saldo_mes = saldos.saldo_mes + new.valor, atualizado_em = now();
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_aplicar_lancamento
  after insert on lancamentos
  for each row execute function aplicar_lancamento();

-- ============================================================
-- Trigger: aplicar transferência mês <-> poupança
-- ============================================================
create or replace function aplicar_transferencia() returns trigger as $$
begin
  update saldos
  set saldo_mes = saldo_mes - new.valor,
      saldo_poupanca = saldo_poupanca + new.valor,
      atualizado_em = now()
  where crianca_id = new.crianca_id;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_aplicar_transferencia
  after insert on transferencias_poupanca
  for each row execute function aplicar_transferencia();

-- ============================================================
-- Migração (out/2026): lançamentos de criança ficam pendentes até um responsável aprovar
-- ============================================================
-- create type status_lancamento as enum ('aprovado','pendente','rejeitado');
-- alter table lancamentos add column status status_lancamento not null default 'aprovado';
-- alter table lancamentos add column aprovado_por uuid references perfis(id);
-- alter table lancamentos add column aprovado_em timestamptz;
-- aplicar_lancamento(): só altera saldo se status = 'aprovado'
-- trigger trg_aprovar_lancamento: pendente -> aprovado soma o valor ao saldo_mes
-- policy escrita_crianca_pendente (insert pendente por criança) + atualiza_responsavel_lancamentos (update por responsável)
