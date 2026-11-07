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
