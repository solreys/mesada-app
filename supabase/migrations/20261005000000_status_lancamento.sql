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
