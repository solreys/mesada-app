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
