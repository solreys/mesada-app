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
