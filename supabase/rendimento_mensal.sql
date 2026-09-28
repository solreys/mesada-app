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
