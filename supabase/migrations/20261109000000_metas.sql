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
  descricao text not null,   -- snapshot: "Gritar (forte) ≤ 2×"
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
