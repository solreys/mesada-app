-- ============================================================
-- INSTALAÇÃO COMPLETA — Mesada (banco novo de uma família)
-- Gerado por scripts/gerar-instalar.sh. Não edite à mão.
-- Supabase → SQL Editor → cole tudo → Run. Rode uma vez só, em projeto vazio.
-- ============================================================

-- >>> supabase/schema.sql
-- ============================================================
-- Schema: App de Mesada Dinâmica
-- Postgres / Supabase
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Perfis ----------
create type papel as enum ('responsavel', 'crianca');

create table perfis (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null, -- login do responsável ou da criança
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
-- Ver supabase/migrations/20261005000000_status_lancamento.sql (rode depois deste arquivo).
-- Depois: 20261102000000_realtime.sql e 20261107000000_privacidade_fechamento.sql
-- (esta última substitui as policies de leitura aberta acima: login obrigatório, criança só vê os próprios dados).

-- >>> supabase/rendimento_mensal.sql
-- ============================================================
-- Rendimento mensal sobre a poupança (100% do CDI)
-- Execute este arquivo depois do schema.sql
-- ============================================================

create or replace function aplicar_rendimento_mensal() returns void as $$
declare
  cfg config_financeira%rowtype;
  crianca record;
  rendimento numeric(10,2);
  taxa_efetiva numeric(8,6);
begin
  select * into cfg from config_financeira
  where mes_referencia = date_trunc('month', current_date)
  limit 1;

  if not found then
    raise notice 'Nenhuma taxa CDI configurada para o mês corrente. Cadastre em config_financeira antes de rodar.';
    return;
  end if;

  taxa_efetiva := (cfg.taxa_cdi_pct / 100.0) * cfg.multiplicador;

  for crianca in select crianca_id, saldo_poupanca from saldos loop
    if crianca.saldo_poupanca > 0 then
      rendimento := round(crianca.saldo_poupanca * taxa_efetiva, 2);

      insert into rendimentos_historico (crianca_id, mes_referencia, saldo_base, taxa_aplicada_pct, valor_rendimento)
      values (crianca.crianca_id, cfg.mes_referencia, crianca.saldo_poupanca, cfg.taxa_cdi_pct, rendimento)
      on conflict (crianca_id, mes_referencia) do nothing;

      update saldos
      set saldo_poupanca = saldo_poupanca + rendimento,
          atualizado_em = now()
      where crianca_id = crianca.crianca_id;
    end if;
  end loop;
end;
$$ language plpgsql security definer;

-- ============================================================
-- Agendamento automático (todo dia 1, às 03:00) via pg_cron
-- Ative a extensão pg_cron no painel Supabase: Database > Extensions
-- ============================================================
-- select cron.schedule(
--   'rendimento-mensal',
--   '0 3 1 * *',
--   $$ select aplicar_rendimento_mensal(); $$
-- );

-- Para rodar manualmente uma vez (ex.: testar):
-- select aplicar_rendimento_mensal();

-- >>> supabase/migrations/20261005000000_status_lancamento.sql
-- ============================================================
-- Migração 05/10/2026: lançamentos de criança ficam pendentes até um responsável aprovar.
--
-- Esta migração JÁ FOI APLICADA no banco de produção pelo SQL Editor do Supabase.
-- Este arquivo registra o que foi feito, para recriar o banco do zero (schema.sql + este arquivo).
-- Foi reconstruído a partir das notas da época: confira com as definições reais antes de
-- confiar 100% nele (consulta no fim do arquivo). É idempotente: rodar de novo não quebra nada.
-- ============================================================

-- ---------- Status do lançamento ----------
do $$
begin
  create type status_lancamento as enum ('aprovado', 'pendente', 'rejeitado');
exception when duplicate_object then null;
end $$;

alter table lancamentos add column if not exists status status_lancamento not null default 'aprovado';
alter table lancamentos add column if not exists aprovado_por uuid references perfis(id);
alter table lancamentos add column if not exists aprovado_em timestamptz;

-- ---------- Trigger de inserção: só mexe no saldo se já entrar aprovado ----------
create or replace function aplicar_lancamento() returns trigger as $$
begin
  if new.status = 'aprovado' then
    insert into saldos (crianca_id, saldo_mes)
    values (new.crianca_id, new.valor)
    on conflict (crianca_id)
    do update set saldo_mes = saldos.saldo_mes + new.valor, atualizado_em = now();
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- ---------- Trigger de aprovação: pendente -> aprovado soma o valor ----------
create or replace function aprovar_lancamento() returns trigger as $$
begin
  if old.status = 'pendente' and new.status = 'aprovado' then
    insert into saldos (crianca_id, saldo_mes)
    values (new.crianca_id, new.valor)
    on conflict (crianca_id)
    do update set saldo_mes = saldos.saldo_mes + new.valor, atualizado_em = now();
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_aprovar_lancamento on lancamentos;
create trigger trg_aprovar_lancamento
  after update of status on lancamentos
  for each row execute function aprovar_lancamento();

-- ---------- Policies ----------
-- Criança só insere lançamento pendente, em nome do próprio perfil.
drop policy if exists "escrita_crianca_pendente" on lancamentos;
create policy "escrita_crianca_pendente" on lancamentos for insert
  with check (
    meu_papel() = 'crianca'
    and status = 'pendente'
    and lancado_por = (select id from perfis where auth_user_id = auth.uid() limit 1)
  );

-- Só responsável atualiza (aprova/rejeita).
drop policy if exists "atualiza_responsavel_lancamentos" on lancamentos;
create policy "atualiza_responsavel_lancamentos" on lancamentos for update
  using (meu_papel() = 'responsavel') with check (meu_papel() = 'responsavel');

-- ============================================================
-- Para conferir com o banco real (SQL Editor), rode e compare:
-- select pg_get_functiondef('aplicar_lancamento'::regproc);
-- select pg_get_functiondef('aprovar_lancamento'::regproc);
-- select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'lancamentos'::regclass and not tgisinternal;
-- select policyname, cmd, qual, with_check from pg_policies where tablename = 'lancamentos';
-- ============================================================

-- >>> supabase/migrations/20261102000000_realtime.sql
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

-- >>> supabase/migrations/20261107000000_privacidade_fechamento.sql
-- ============================================================
-- Migração 07/11/2026
--   1. Privacidade: login obrigatório; criança só lê os próprios dados (RLS no banco).
--      O ranking continua visível para todos via função ranking_mes (só nome + total do mês).
--   2. Criança só lança pendente para si mesma.
--   3. Fechamento mensal: tabela fechamentos_mensais + função fechar_mes()
--      (rendimento CDI aplicado uma única vez, sobra -> poupança ou paga, negativo desconta da poupança,
--       mês fechado fica bloqueado para lançamentos).
--   4. aplicar_rendimento_mensal() deixa de aplicar rendimento em dobro se rodar 2x.
-- Idempotente: pode rodar de novo sem quebrar.
-- Rode DEPOIS de 20261102000000_realtime.sql.
-- ============================================================

-- ---------- Helpers ----------
create or replace function meu_perfil_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from perfis where auth_user_id = auth.uid() limit 1;
$$;

-- Primeiro dia do mês no fuso de Brasília (o app é usado no Brasil).
create or replace function mes_brt(ts timestamptz) returns date
language sql immutable as $$
  select date_trunc('month', ts at time zone 'America/Sao_Paulo')::date;
$$;

-- ---------- Fechamentos ----------
create table if not exists fechamentos_mensais (
  id uuid primary key default gen_random_uuid(),
  crianca_id uuid not null references perfis(id) on delete cascade,
  mes_referencia date not null,                 -- 1º dia do mês fechado
  saldo_inicial numeric(10,2) not null,         -- 120
  bonus numeric(10,2) not null,                 -- soma dos lançamentos positivos aprovados
  punicoes numeric(10,2) not null,              -- soma dos negativos (valor negativo)
  saldo_final numeric(10,2) not null,           -- saldo_inicial + bonus + punicoes
  destino text not null check (destino in ('poupanca', 'pago', 'debito_poupanca')),
  valor_para_poupanca numeric(10,2) not null,   -- + guardado, - descontado, 0 se pago
  taxa_cdi_pct numeric(6,4),
  poupanca_antes numeric(10,2) not null,
  rendimento numeric(10,2) not null,
  poupanca_depois numeric(10,2) not null,
  fechado_por uuid references perfis(id),
  fechado_em timestamptz not null default now(),
  unique (crianca_id, mes_referencia)
);
alter table fechamentos_mensais enable row level security;

-- ---------- RLS de leitura ----------
-- Catálogo, perfis e CDI: qualquer usuário logado. Dados financeiros: responsável vê tudo, criança só os seus.
drop policy if exists "leitura_geral_perfis" on perfis;
drop policy if exists "leitura_logado_perfis" on perfis;
create policy "leitura_logado_perfis" on perfis for select using (auth.uid() is not null);

drop policy if exists "leitura_geral_itens" on itens_regras;
drop policy if exists "leitura_logado_itens" on itens_regras;
create policy "leitura_logado_itens" on itens_regras for select using (auth.uid() is not null);

drop policy if exists "leitura_geral_config" on config_financeira;
drop policy if exists "leitura_logado_config" on config_financeira;
create policy "leitura_logado_config" on config_financeira for select using (auth.uid() is not null);

drop policy if exists "leitura_geral_lancamentos" on lancamentos;
drop policy if exists "leitura_propria_lancamentos" on lancamentos;
create policy "leitura_propria_lancamentos" on lancamentos for select
  using (meu_papel() = 'responsavel' or crianca_id = meu_perfil_id());

drop policy if exists "leitura_geral_saldos" on saldos;
drop policy if exists "leitura_propria_saldos" on saldos;
create policy "leitura_propria_saldos" on saldos for select
  using (meu_papel() = 'responsavel' or crianca_id = meu_perfil_id());

drop policy if exists "leitura_geral_transferencias" on transferencias_poupanca;
drop policy if exists "leitura_propria_transferencias" on transferencias_poupanca;
create policy "leitura_propria_transferencias" on transferencias_poupanca for select
  using (meu_papel() = 'responsavel' or crianca_id = meu_perfil_id());

drop policy if exists "leitura_geral_rendimentos" on rendimentos_historico;
drop policy if exists "leitura_propria_rendimentos" on rendimentos_historico;
create policy "leitura_propria_rendimentos" on rendimentos_historico for select
  using (meu_papel() = 'responsavel' or crianca_id = meu_perfil_id());

drop policy if exists "leitura_propria_fechamentos" on fechamentos_mensais;
create policy "leitura_propria_fechamentos" on fechamentos_mensais for select
  using (meu_papel() = 'responsavel' or crianca_id = meu_perfil_id());

-- ---------- Criança lança pendente só para si ----------
drop policy if exists "escrita_crianca_pendente" on lancamentos;
create policy "escrita_crianca_pendente" on lancamentos for insert
  with check (
    meu_papel() = 'crianca'
    and status = 'pendente'
    and lancado_por = meu_perfil_id()
    and crianca_id = meu_perfil_id()
  );

-- ---------- Ranking (nome + total do mês de cada criança, sem extrato) ----------
create or replace function ranking_mes(p_mes date)
returns table (crianca_id uuid, nome text, movimento numeric)
language sql stable security definer set search_path = public as $$
  select p.id, p.nome,
         coalesce(sum(l.valor) filter (where l.status = 'aprovado' and mes_brt(l.criado_em) = date_trunc('month', p_mes)::date), 0)
  from perfis p
  left join lancamentos l on l.crianca_id = p.id
  where p.papel = 'crianca' and auth.uid() is not null
  group by p.id, p.nome;
$$;

-- ---------- Bloqueio de mês fechado ----------
create or replace function bloquear_mes_fechado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Pelo app, o lançamento sempre leva a data/hora do servidor (SQL Editor pode retroagir).
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.criado_em := now();
  end if;
  if exists (select 1 from fechamentos_mensais f
             where f.crianca_id = new.crianca_id and f.mes_referencia = mes_brt(new.criado_em))
     or (tg_op = 'UPDATE' and exists (select 1 from fechamentos_mensais f
             where f.crianca_id = old.crianca_id and f.mes_referencia = mes_brt(old.criado_em))) then
    raise exception 'O mês % já foi fechado e não pode ser alterado.', to_char(mes_brt(new.criado_em), 'MM/YYYY');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_mes_fechado on lancamentos;
create trigger trg_bloquear_mes_fechado
  before insert or update on lancamentos
  for each row execute function bloquear_mes_fechado();

-- ---------- Rendimento manual antigo: não aplica em dobro ----------
create or replace function aplicar_rendimento_mensal() returns void
language plpgsql security definer set search_path = public as $$
declare
  cfg config_financeira%rowtype;
  crianca record;
  rendimento numeric(10,2);
  inseridas int;
begin
  select * into cfg from config_financeira where mes_referencia = date_trunc('month', current_date) limit 1;
  if not found then
    raise notice 'Nenhuma taxa CDI configurada para o mês corrente.';
    return;
  end if;
  for crianca in select crianca_id, saldo_poupanca from saldos loop
    if crianca.saldo_poupanca > 0 then
      rendimento := round(crianca.saldo_poupanca * (cfg.taxa_cdi_pct / 100.0) * cfg.multiplicador, 2);
      insert into rendimentos_historico (crianca_id, mes_referencia, saldo_base, taxa_aplicada_pct, valor_rendimento)
      values (crianca.crianca_id, cfg.mes_referencia, crianca.saldo_poupanca, cfg.taxa_cdi_pct, rendimento)
      on conflict (crianca_id, mes_referencia) do nothing;
      get diagnostics inseridas = row_count;
      if inseridas > 0 then
        update saldos set saldo_poupanca = saldo_poupanca + rendimento, atualizado_em = now()
        where crianca_id = crianca.crianca_id;
      end if;
    end if;
  end loop;
end;
$$;

-- ---------- Fechamento do mês ----------
-- p_mes: qualquer dia do mês a fechar (precisa já ter terminado).
-- p_cdi_pct: CDI do mês fechado, em % (ex.: 1.08). Vira a linha de config_financeira do mês seguinte
--            (mesma convenção de antes: a linha do mês M guarda o CDI de M-1).
-- p_destinos: {"<crianca_id>": "poupanca" | "pago"} para sobra positiva. Padrão: poupanca.
--             Saldo negativo sempre desconta da poupança.
create or replace function fechar_mes(p_mes date, p_cdi_pct numeric, p_destinos jsonb default '{}'::jsonb)
returns setof fechamentos_mensais
language plpgsql security definer set search_path = public as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_prox date := (date_trunc('month', p_mes) + interval '1 month')::date;
  v_atual date := mes_brt(now());
  v_inicial constant numeric := 120;
  v_pend int;
  v_taxa numeric;
  v_mult numeric;
  c record;
  v_bonus numeric;
  v_pun numeric;
  v_final numeric;
  v_destino text;
  v_para numeric;
  v_rend numeric;
  v_ins int;
  v_novo_mes numeric;
  v_linha fechamentos_mensais%rowtype;
begin
  if meu_papel() is distinct from 'responsavel' then
    raise exception 'Apenas responsáveis podem fechar o mês.';
  end if;
  if v_mes >= v_atual then
    raise exception 'Só é possível fechar um mês que já terminou.';
  end if;
  -- Até setembro/2026 a virada foi feita à mão no SQL Editor; fechar de novo duplicaria a sobra.
  if v_mes < date '2026-10-01' then
    raise exception 'Meses antes de outubro/2026 já foram fechados manualmente.';
  end if;
  if p_cdi_pct is null or p_cdi_pct < 0 or p_cdi_pct > 5 then
    raise exception 'Taxa CDI inválida (use %% ao mês, ex.: 1,08).';
  end if;
  if exists (select 1 from fechamentos_mensais where mes_referencia = v_mes) then
    raise exception 'O mês % já foi fechado.', to_char(v_mes, 'MM/YYYY');
  end if;
  select count(*) into v_pend from lancamentos where status = 'pendente' and mes_brt(criado_em) = v_mes;
  if v_pend > 0 then
    raise exception '% lançamento(s) pendente(s) em %. Aprove ou retire antes de fechar.', v_pend, to_char(v_mes, 'MM/YYYY');
  end if;

  -- CDI: se o rendimento do mês seguinte já foi aplicado (virada manual antiga), mantém a taxa usada.
  if not exists (select 1 from rendimentos_historico where mes_referencia = v_prox) then
    insert into config_financeira (mes_referencia, taxa_cdi_pct, multiplicador, criado_por)
    values (v_prox, p_cdi_pct, 1.00, meu_perfil_id())
    on conflict (mes_referencia) do update set taxa_cdi_pct = excluded.taxa_cdi_pct;
  end if;
  select taxa_cdi_pct, multiplicador into v_taxa, v_mult from config_financeira where mes_referencia = v_prox;

  for c in
    select p.id, coalesce(s.saldo_poupanca, 0) as poupanca
    from perfis p left join saldos s on s.crianca_id = p.id
    where p.papel = 'crianca' order by p.nome
  loop
    select coalesce(sum(valor) filter (where valor > 0), 0), coalesce(sum(valor) filter (where valor < 0), 0)
      into v_bonus, v_pun
    from lancamentos
    where crianca_id = c.id and status = 'aprovado' and mes_brt(criado_em) = v_mes;
    v_final := v_inicial + v_bonus + v_pun;

    -- Rendimento sobre a poupança do mês, uma única vez (a sobra entra depois, sem CDI).
    v_rend := 0;
    if c.poupanca > 0 then
      v_rend := round(c.poupanca * (v_taxa / 100.0) * v_mult, 2);
      insert into rendimentos_historico (crianca_id, mes_referencia, saldo_base, taxa_aplicada_pct, valor_rendimento)
      values (c.id, v_prox, c.poupanca, v_taxa, v_rend)
      on conflict (crianca_id, mes_referencia) do nothing;
      get diagnostics v_ins = row_count;
      if v_ins = 0 then v_rend := 0; end if;
    end if;

    if v_final < 0 then
      v_destino := 'debito_poupanca';
      v_para := v_final;
    else
      v_destino := coalesce(p_destinos ->> c.id::text, 'poupanca');
      if v_destino not in ('poupanca', 'pago') then
        raise exception 'Destino inválido: %', v_destino;
      end if;
      v_para := case when v_destino = 'poupanca' then v_final else 0 end;
    end if;

    -- Mês corrente recomeça em 120 + o que já foi aprovado nele (nada do mês fechado entra).
    select v_inicial + coalesce(sum(valor), 0) into v_novo_mes
    from lancamentos where crianca_id = c.id and status = 'aprovado' and mes_brt(criado_em) = v_atual;

    insert into saldos (crianca_id) values (c.id) on conflict (crianca_id) do nothing;
    update saldos
       set saldo_poupanca = saldo_poupanca + v_rend + v_para,
           saldo_mes = v_novo_mes,
           atualizado_em = now()
     where crianca_id = c.id;

    insert into fechamentos_mensais (crianca_id, mes_referencia, saldo_inicial, bonus, punicoes, saldo_final, destino,
                                     valor_para_poupanca, taxa_cdi_pct, poupanca_antes, rendimento, poupanca_depois, fechado_por)
    values (c.id, v_mes, v_inicial, v_bonus, v_pun, v_final, v_destino,
            v_para, v_taxa, c.poupanca, v_rend, c.poupanca + v_rend + v_para, meu_perfil_id())
    returning * into v_linha;
    return next v_linha;
  end loop;
end;
$$;

revoke execute on function fechar_mes(date, numeric, jsonb) from anon;
revoke execute on function ranking_mes(date) from anon;

-- Realtime para o fechamento aparecer na hora nos outros aparelhos.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fechamentos_mensais') then
    alter publication supabase_realtime add table public.fechamentos_mensais;
  end if;
end $$;

-- >>> supabase/migrations/20261108000000_area_icone.sql
-- ============================================================
-- Migração 08/11/2026: ícone e área de comportamento em cada item do catálogo.
-- Preenche só itens ainda sem área/ícone (não sobrescreve o que for editado no app). Idempotente.
-- ============================================================
alter table itens_regras add column if not exists icone text;
alter table itens_regras add column if not exists area text;


-- >>> supabase/migrations/20261109000000_metas.sql
-- ============================================================
-- Migração 09/11/2026: metas mensais com bônus automático no fechamento.
--   metas             : regras recorrentes (todo mês) cadastradas pelos responsáveis
--   metas_resultados  : foto de cada meta em cada fechamento (realizado, cumprida, bônus)
--   fechamentos_mensais.bonus_metas : bônus das metas somado ao resultado do mês
-- Idempotente. Rode depois de 20261107000000_privacidade_fechamento.sql.
-- ============================================================

create table if not exists metas (
  id uuid primary key default gen_random_uuid(),
  crianca_id uuid references perfis(id) on delete cascade,      -- null = vale para as duas crianças
  item_id uuid references itens_regras(id) on delete cascade,   -- alvo: um item...
  area text,                                                    -- ...ou uma área inteira
  tipo text not null check (tipo in ('maximo', 'minimo')),      -- maximo: no máximo N vezes; minimo: pelo menos N vezes
  limite int not null check (limite >= 0),
  bonus numeric(10,2) not null check (bonus >= 0),
  ativo boolean not null default true,
  criado_por uuid references perfis(id),
  criado_em timestamptz not null default now(),
  check ((item_id is null) <> (area is null))
);
alter table metas enable row level security;

create table if not exists metas_resultados (
  id uuid primary key default gen_random_uuid(),
  meta_id uuid references metas(id) on delete set null,
  crianca_id uuid not null references perfis(id) on delete cascade,
  mes_referencia date not null,
  descricao text not null,   -- snapshot, ex.: "Item X ≤ 2×"
  tipo text not null,
  limite int not null,
  realizado int not null,
  cumprida boolean not null,
  bonus numeric(10,2) not null, -- valor pago (0 se não cumpriu)
  unique (meta_id, crianca_id, mes_referencia)
);
alter table metas_resultados enable row level security;

alter table fechamentos_mensais add column if not exists bonus_metas numeric(10,2) not null default 0;

-- ---------- RLS ----------
drop policy if exists "leitura_metas" on metas;
create policy "leitura_metas" on metas for select
  using (meu_papel() = 'responsavel' or crianca_id is null or crianca_id = meu_perfil_id());
drop policy if exists "escrita_responsavel_metas" on metas;
create policy "escrita_responsavel_metas" on metas for all
  using (meu_papel() = 'responsavel') with check (meu_papel() = 'responsavel');

drop policy if exists "leitura_metas_resultados" on metas_resultados;
create policy "leitura_metas_resultados" on metas_resultados for select
  using (meu_papel() = 'responsavel' or crianca_id = meu_perfil_id());

-- ---------- Quantas vezes a meta aconteceu no mês (estorno desconta 1) ----------
create or replace function realizado_meta(p_meta metas, p_crianca uuid, p_mes date) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when l.descricao like 'Estorno: %' then -1 else 1 end), 0)::int
  from lancamentos l
  left join itens_regras i on i.id = l.item_id
  where l.crianca_id = p_crianca
    and l.status = 'aprovado'
    and mes_brt(l.criado_em) = date_trunc('month', p_mes)::date
    and (
      (p_meta.item_id is not null and l.item_id = p_meta.item_id)
      or (p_meta.area is not null and i.area = p_meta.area
          -- área: máximo conta punições, mínimo conta bônus
          and ((p_meta.tipo = 'maximo' and i.valor < 0) or (p_meta.tipo = 'minimo' and i.valor > 0)))
    );
$$;

-- ---------- Fechamento do mês (mesma regra de antes + bônus das metas) ----------
create or replace function fechar_mes(p_mes date, p_cdi_pct numeric, p_destinos jsonb default '{}'::jsonb)
returns setof fechamentos_mensais
language plpgsql security definer set search_path = public as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_prox date := (date_trunc('month', p_mes) + interval '1 month')::date;
  v_atual date := mes_brt(now());
  v_inicial constant numeric := 120;
  v_pend int;
  v_taxa numeric;
  v_mult numeric;
  c record;
  m record;
  v_bonus numeric;
  v_pun numeric;
  v_metas numeric;
  v_real int;
  v_ok boolean;
  v_final numeric;
  v_destino text;
  v_para numeric;
  v_rend numeric;
  v_ins int;
  v_novo_mes numeric;
  v_linha fechamentos_mensais%rowtype;
begin
  if meu_papel() is distinct from 'responsavel' then
    raise exception 'Apenas responsáveis podem fechar o mês.';
  end if;
  if v_mes >= v_atual then
    raise exception 'Só é possível fechar um mês que já terminou.';
  end if;
  -- Até setembro/2026 a virada foi feita à mão no SQL Editor; fechar de novo duplicaria a sobra.
  if v_mes < date '2026-10-01' then
    raise exception 'Meses antes de outubro/2026 já foram fechados manualmente.';
  end if;
  if p_cdi_pct is null or p_cdi_pct < 0 or p_cdi_pct > 5 then
    raise exception 'Taxa CDI inválida (use %% ao mês, ex.: 1,08).';
  end if;
  if exists (select 1 from fechamentos_mensais where mes_referencia = v_mes) then
    raise exception 'O mês % já foi fechado.', to_char(v_mes, 'MM/YYYY');
  end if;
  select count(*) into v_pend from lancamentos where status = 'pendente' and mes_brt(criado_em) = v_mes;
  if v_pend > 0 then
    raise exception '% lançamento(s) pendente(s) em %. Aprove ou retire antes de fechar.', v_pend, to_char(v_mes, 'MM/YYYY');
  end if;

  if not exists (select 1 from rendimentos_historico where mes_referencia = v_prox) then
    insert into config_financeira (mes_referencia, taxa_cdi_pct, multiplicador, criado_por)
    values (v_prox, p_cdi_pct, 1.00, meu_perfil_id())
    on conflict (mes_referencia) do update set taxa_cdi_pct = excluded.taxa_cdi_pct;
  end if;
  select taxa_cdi_pct, multiplicador into v_taxa, v_mult from config_financeira where mes_referencia = v_prox;

  for c in
    select p.id, coalesce(s.saldo_poupanca, 0) as poupanca
    from perfis p left join saldos s on s.crianca_id = p.id
    where p.papel = 'crianca' order by p.nome
  loop
    select coalesce(sum(valor) filter (where valor > 0), 0), coalesce(sum(valor) filter (where valor < 0), 0)
      into v_bonus, v_pun
    from lancamentos
    where crianca_id = c.id and status = 'aprovado' and mes_brt(criado_em) = v_mes;

    -- Metas ativas desta criança (ou das duas): foto do resultado e bônus se cumpriu.
    v_metas := 0;
    for m in
      select mt.*, coalesce(i.descricao, mt.area) as alvo
      from metas mt left join itens_regras i on i.id = mt.item_id
      where mt.ativo and (mt.crianca_id is null or mt.crianca_id = c.id)
        and mes_brt(mt.criado_em) <= v_mes  -- meta vale a partir do mês em que foi criada
    loop
      v_real := realizado_meta((select x from metas x where x.id = m.id), c.id, v_mes);
      v_ok := case when m.tipo = 'maximo' then v_real <= m.limite else v_real >= m.limite end;
      insert into metas_resultados (meta_id, crianca_id, mes_referencia, descricao, tipo, limite, realizado, cumprida, bonus)
      values (m.id, c.id, v_mes,
              m.alvo || case when m.tipo = 'maximo' then ' ≤ ' else ' ≥ ' end || m.limite || '×',
              m.tipo, m.limite, v_real, v_ok, case when v_ok then m.bonus else 0 end)
      on conflict (meta_id, crianca_id, mes_referencia) do nothing;
      if v_ok then v_metas := v_metas + m.bonus; end if;
    end loop;

    v_final := v_inicial + v_bonus + v_pun + v_metas;

    v_rend := 0;
    if c.poupanca > 0 then
      v_rend := round(c.poupanca * (v_taxa / 100.0) * v_mult, 2);
      insert into rendimentos_historico (crianca_id, mes_referencia, saldo_base, taxa_aplicada_pct, valor_rendimento)
      values (c.id, v_prox, c.poupanca, v_taxa, v_rend)
      on conflict (crianca_id, mes_referencia) do nothing;
      get diagnostics v_ins = row_count;
      if v_ins = 0 then v_rend := 0; end if;
    end if;

    if v_final < 0 then
      v_destino := 'debito_poupanca';
      v_para := v_final;
    else
      v_destino := coalesce(p_destinos ->> c.id::text, 'poupanca');
      if v_destino not in ('poupanca', 'pago') then
        raise exception 'Destino inválido: %', v_destino;
      end if;
      v_para := case when v_destino = 'poupanca' then v_final else 0 end;
    end if;

    select v_inicial + coalesce(sum(valor), 0) into v_novo_mes
    from lancamentos where crianca_id = c.id and status = 'aprovado' and mes_brt(criado_em) = v_atual;

    insert into saldos (crianca_id) values (c.id) on conflict (crianca_id) do nothing;
    update saldos
       set saldo_poupanca = saldo_poupanca + v_rend + v_para,
           saldo_mes = v_novo_mes,
           atualizado_em = now()
     where crianca_id = c.id;

    insert into fechamentos_mensais (crianca_id, mes_referencia, saldo_inicial, bonus, punicoes, bonus_metas, saldo_final, destino,
                                     valor_para_poupanca, taxa_cdi_pct, poupanca_antes, rendimento, poupanca_depois, fechado_por)
    values (c.id, v_mes, v_inicial, v_bonus, v_pun, v_metas, v_final, v_destino,
            v_para, v_taxa, c.poupanca, v_rend, c.poupanca + v_rend + v_para, meu_perfil_id())
    returning * into v_linha;
    return next v_linha;
  end loop;
end;
$$;

revoke execute on function fechar_mes(date, numeric, jsonb) from anon;

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'metas') then
    alter publication supabase_realtime add table public.metas;
  end if;
end $$;

-- >>> supabase/migrations/20261110000000_objetivos.sql
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

-- >>> supabase/migrations/20261111000000_ocorrido_em.sql
-- ============================================================
-- Migração 11/11/2026: hora em que o comportamento ACONTECEU (ocorrido_em), separada da hora do registro.
-- Usada só nas análises (padrões de dia/horário, punições que andam juntas, calendário).
-- O dinheiro continua contando pelo mês de criado_em (registro), como antes.
-- Limite: até 7 dias antes do registro, nunca no futuro. Idempotente.
-- ============================================================
alter table lancamentos add column if not exists ocorrido_em timestamptz;
update lancamentos set ocorrido_em = criado_em where ocorrido_em is null;

create or replace function ajustar_ocorrido_em() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.ocorrido_em is null or new.ocorrido_em > new.criado_em then
    new.ocorrido_em := new.criado_em;
  elsif new.ocorrido_em < new.criado_em - interval '7 days' then
    new.ocorrido_em := new.criado_em - interval '7 days';
  end if;
  return new;
end;
$$;

-- Nome começa com "trg_o": roda depois de trg_bloquear_mes_fechado (que fixa criado_em = now()).
drop trigger if exists trg_ocorrido_em on lancamentos;
create trigger trg_ocorrido_em
  before insert or update of ocorrido_em, criado_em on lancamentos
  for each row execute function ajustar_ocorrido_em();

-- >>> supabase/migrations/20261112000000_familia.sql
-- ============================================================
-- Migração 12/11/2026: app genérico para qualquer família.
--   familia_config : nome da família, valor da mesada, % do CDI, primeiro mês fechável, versão do banco
--   perfis.cor     : cor de cada criança (antes fixa no código)
--   Primeiro acesso: configurar_familia() cria o 1º responsável; vincular_membro() liga filhos/outros pais pelo e-mail
--   Login infantil : nomes_login() / email_login() (antes os e-mails ficavam fixos no código)
--   fechar_mes     : usa o valor da mesada e o % do CDI da família
-- Idempotente. Em banco que já existia, mantém tudo como estava (R$ 120, 100% do CDI).
-- ============================================================

create table if not exists familia_config (
  id int primary key default 1 check (id = 1),     -- uma linha só
  nome text,                                        -- ex.: "Família Silva" (opcional)
  valor_mesada numeric(10,2) not null default 120 check (valor_mesada > 0),
  pct_cdi numeric(6,2) not null default 100 check (pct_cdi >= 0 and pct_cdi <= 200),
  primeiro_mes_fechamento date,                     -- meses antes deste não podem ser fechados pelo app
  versao_banco int not null default 0,
  atualizado_em timestamptz not null default now()
);
alter table familia_config enable row level security;

drop policy if exists "leitura_config_familia" on familia_config;
create policy "leitura_config_familia" on familia_config for select using (auth.uid() is not null);
drop policy if exists "escrita_config_familia" on familia_config;
create policy "escrita_config_familia" on familia_config for update
  using (meu_papel() = 'responsavel') with check (meu_papel() = 'responsavel');

-- Banco que já tinha virada manual antes do app: o primeiro mês fechável é o da última virada manual.
insert into familia_config (id, valor_mesada, pct_cdi, primeiro_mes_fechamento)
select 1, 120, 100,
       (select max(r.mes_referencia) from rendimentos_historico r
         where not exists (select 1 from fechamentos_mensais f where f.mes_referencia >= r.mes_referencia))
on conflict (id) do nothing;

-- ---------- Responsável edita nome/cor dos membros ----------
drop policy if exists "escrita_responsavel_perfis" on perfis;
create policy "escrita_responsavel_perfis" on perfis for update
  using (meu_papel() = 'responsavel') with check (meu_papel() = 'responsavel');

-- ---------- Cor por criança ----------
alter table perfis add column if not exists cor text;
with ordem as (
  select id, row_number() over (order by criado_em, nome) as n
  from perfis where papel = 'crianca' and cor is null
)
update perfis p
   set cor = (array['#2563eb','#16a34a','#d946ef','#f59e0b','#06b6d4','#ef4444'])[((o.n - 1) % 6) + 1]
  from ordem o where o.id = p.id;

-- ---------- Primeiro acesso ----------
create or replace function familia_tem_responsavel() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where papel = 'responsavel' and auth_user_id is not null);
$$;

-- O primeiro usuário logado que chamar vira responsável. Depois disso, não funciona mais.
create or replace function configurar_familia(p_seu_nome text, p_nome_familia text, p_valor numeric, p_pct_cdi numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Faça login primeiro.'; end if;
  if familia_tem_responsavel() then raise exception 'Esta família já foi configurada. Peça a um responsável para vincular seu e-mail.'; end if;
  if coalesce(trim(p_seu_nome), '') = '' then raise exception 'Informe seu nome.'; end if;
  insert into perfis (auth_user_id, nome, papel) values (auth.uid(), trim(p_seu_nome), 'responsavel');
  update familia_config
     set nome = nullif(trim(p_nome_familia), ''),
         valor_mesada = coalesce(p_valor, valor_mesada),
         pct_cdi = coalesce(p_pct_cdi, pct_cdi),
         -- Família nova: nada antes do mês de início para fechar.
         primeiro_mes_fechamento = coalesce(primeiro_mes_fechamento, mes_brt(now())),
         atualizado_em = now()
   where id = 1;
end;
$$;

-- Responsável liga um usuário já criado no Supabase (Authentication) a um perfil.
create or replace function vincular_membro(p_email text, p_nome text, p_papel papel, p_cor text default null)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid;
  v_id uuid;
begin
  if meu_papel() is distinct from 'responsavel' then raise exception 'Apenas responsáveis podem vincular membros.'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome.'; end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then
    raise exception 'Não existe usuário com o e-mail %. Crie primeiro em Authentication → Users no Supabase.', p_email;
  end if;
  if exists (select 1 from perfis where auth_user_id = v_uid) then raise exception 'Este e-mail já está vinculado.'; end if;
  insert into perfis (auth_user_id, nome, papel, cor) values (v_uid, trim(p_nome), p_papel, p_cor) returning id into v_id;
  return v_id;
end;
$$;

-- ---------- Login infantil (botões com o nome na tela de entrada) ----------
-- Devolve só o primeiro nome das crianças com login; o e-mail é buscado na hora de entrar.
create or replace function nomes_login() returns table (nome text)
language sql stable security definer set search_path = public as $$
  select p.nome from perfis p where p.papel = 'crianca' and p.auth_user_id is not null order by p.criado_em, p.nome;
$$;

create or replace function email_login(p_nome text) returns text
language sql stable security definer set search_path = public, auth as $$
  select u.email from perfis p join auth.users u on u.id = p.auth_user_id
  where p.papel = 'crianca' and lower(p.nome) = lower(trim(p_nome)) limit 1;
$$;

revoke execute on function configurar_familia(text, text, numeric, numeric) from anon;
revoke execute on function vincular_membro(text, text, papel, text) from anon;

-- ---------- Fechamento usa a configuração da família ----------
create or replace function fechar_mes(p_mes date, p_cdi_pct numeric, p_destinos jsonb default '{}'::jsonb)
returns setof fechamentos_mensais
language plpgsql security definer set search_path = public as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_prox date := (date_trunc('month', p_mes) + interval '1 month')::date;
  v_atual date := mes_brt(now());
  v_inicial numeric;
  v_mult_cfg numeric;
  v_primeiro date;
  v_pend int;
  v_taxa numeric;
  v_mult numeric;
  c record;
  m record;
  v_bonus numeric;
  v_pun numeric;
  v_metas numeric;
  v_real int;
  v_ok boolean;
  v_final numeric;
  v_destino text;
  v_para numeric;
  v_rend numeric;
  v_ins int;
  v_novo_mes numeric;
  v_linha fechamentos_mensais%rowtype;
begin
  select coalesce(valor_mesada, 120), coalesce(pct_cdi, 100) / 100.0, primeiro_mes_fechamento
    into v_inicial, v_mult_cfg, v_primeiro
  from familia_config where id = 1;
  v_inicial := coalesce(v_inicial, 120);
  v_mult_cfg := coalesce(v_mult_cfg, 1);

  if meu_papel() is distinct from 'responsavel' then
    raise exception 'Apenas responsáveis podem fechar o mês.';
  end if;
  if v_mes >= v_atual then
    raise exception 'Só é possível fechar um mês que já terminou.';
  end if;
  if v_primeiro is not null and v_mes < v_primeiro then
    raise exception 'Só dá para fechar a partir de % (início do uso do app ou última virada feita fora dele).', to_char(v_primeiro, 'MM/YYYY');
  end if;
  if p_cdi_pct is null or p_cdi_pct < 0 or p_cdi_pct > 5 then
    raise exception 'Taxa CDI inválida (use %% ao mês, ex.: 1,08).';
  end if;
  if exists (select 1 from fechamentos_mensais where mes_referencia = v_mes) then
    raise exception 'O mês % já foi fechado.', to_char(v_mes, 'MM/YYYY');
  end if;
  select count(*) into v_pend from lancamentos where status = 'pendente' and mes_brt(criado_em) = v_mes;
  if v_pend > 0 then
    raise exception '% lançamento(s) pendente(s) em %. Aprove ou retire antes de fechar.', v_pend, to_char(v_mes, 'MM/YYYY');
  end if;

  if not exists (select 1 from rendimentos_historico where mes_referencia = v_prox) then
    insert into config_financeira (mes_referencia, taxa_cdi_pct, multiplicador, criado_por)
    values (v_prox, p_cdi_pct, v_mult_cfg, meu_perfil_id())
    on conflict (mes_referencia) do update set taxa_cdi_pct = excluded.taxa_cdi_pct, multiplicador = excluded.multiplicador;
  end if;
  select taxa_cdi_pct, multiplicador into v_taxa, v_mult from config_financeira where mes_referencia = v_prox;

  for c in
    select p.id, coalesce(s.saldo_poupanca, 0) as poupanca
    from perfis p left join saldos s on s.crianca_id = p.id
    where p.papel = 'crianca' order by p.nome
  loop
    select coalesce(sum(valor) filter (where valor > 0), 0), coalesce(sum(valor) filter (where valor < 0), 0)
      into v_bonus, v_pun
    from lancamentos
    where crianca_id = c.id and status = 'aprovado' and mes_brt(criado_em) = v_mes;

    v_metas := 0;
    for m in
      select mt.*, coalesce(i.descricao, mt.area) as alvo
      from metas mt left join itens_regras i on i.id = mt.item_id
      where mt.ativo and (mt.crianca_id is null or mt.crianca_id = c.id)
        and mes_brt(mt.criado_em) <= v_mes
    loop
      v_real := realizado_meta((select x from metas x where x.id = m.id), c.id, v_mes);
      v_ok := case when m.tipo = 'maximo' then v_real <= m.limite else v_real >= m.limite end;
      insert into metas_resultados (meta_id, crianca_id, mes_referencia, descricao, tipo, limite, realizado, cumprida, bonus)
      values (m.id, c.id, v_mes,
              m.alvo || case when m.tipo = 'maximo' then ' ≤ ' else ' ≥ ' end || m.limite || '×',
              m.tipo, m.limite, v_real, v_ok, case when v_ok then m.bonus else 0 end)
      on conflict (meta_id, crianca_id, mes_referencia) do nothing;
      if v_ok then v_metas := v_metas + m.bonus; end if;
    end loop;

    v_final := v_inicial + v_bonus + v_pun + v_metas;

    v_rend := 0;
    if c.poupanca > 0 then
      v_rend := round(c.poupanca * (v_taxa / 100.0) * v_mult, 2);
      insert into rendimentos_historico (crianca_id, mes_referencia, saldo_base, taxa_aplicada_pct, valor_rendimento)
      values (c.id, v_prox, c.poupanca, v_taxa, v_rend)
      on conflict (crianca_id, mes_referencia) do nothing;
      get diagnostics v_ins = row_count;
      if v_ins = 0 then v_rend := 0; end if;
    end if;

    if v_final < 0 then
      v_destino := 'debito_poupanca';
      v_para := v_final;
    else
      v_destino := coalesce(p_destinos ->> c.id::text, 'poupanca');
      if v_destino not in ('poupanca', 'pago') then
        raise exception 'Destino inválido: %', v_destino;
      end if;
      v_para := case when v_destino = 'poupanca' then v_final else 0 end;
    end if;

    select v_inicial + coalesce(sum(valor), 0) into v_novo_mes
    from lancamentos where crianca_id = c.id and status = 'aprovado' and mes_brt(criado_em) = v_atual;

    insert into saldos (crianca_id) values (c.id) on conflict (crianca_id) do nothing;
    update saldos
       set saldo_poupanca = saldo_poupanca + v_rend + v_para,
           saldo_mes = v_novo_mes,
           atualizado_em = now()
     where crianca_id = c.id;

    insert into fechamentos_mensais (crianca_id, mes_referencia, saldo_inicial, bonus, punicoes, bonus_metas, saldo_final, destino,
                                     valor_para_poupanca, taxa_cdi_pct, poupanca_antes, rendimento, poupanca_depois, fechado_por)
    values (c.id, v_mes, v_inicial, v_bonus, v_pun, v_metas, v_final, v_destino,
            v_para, v_taxa, c.poupanca, v_rend, c.poupanca + v_rend + v_para, meu_perfil_id())
    returning * into v_linha;
    return next v_linha;
  end loop;
end;
$$;
revoke execute on function fechar_mes(date, numeric, jsonb) from anon;

-- Versão do banco (o app avisa os responsáveis quando o banco está atrás do código).
update familia_config set versao_banco = greatest(versao_banco, 1) where id = 1;
