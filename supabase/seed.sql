-- ============================================================
-- Seed: catálogo real (extraído de Zon_e_Ettore_mesada_crescimento_mensalidade.xlsx)
-- Ajuste livremente aqui e rode novamente para atualizar valores.
-- ============================================================

-- ---------- Perfis iniciais ----------
-- Responsáveis: crie o registro DEPOIS de cada um logar pela 1x via Supabase Auth,
-- então rode: update perfis set papel='responsavel' where auth_user_id = '<uid>';
-- Abaixo, os perfis das crianças (sem login próprio):

insert into perfis (nome, papel) values
  ('Zon', 'crianca'),
  ('Ettore', 'crianca');

-- ---------- Punições ----------
insert into itens_regras (categoria, descricao, valor) values
  ('punicao', 'Falar chorando, perder controle, ficar bravinho', -1.00),
  ('punicao', 'Não fazer as lições da escola / não estudar', -3.00),
  ('punicao', 'Não cuidar do Rocky', -2.00),
  ('punicao', 'Não executar as tarefas, deixar coisas jogadas, reclamar', -1.00),
  ('punicao', 'Testar papai e mamãe e insistir', -2.00),
  ('punicao', 'Não fazer as coisas na hora', -1.00),
  ('punicao', 'Tirar nota baixa na escola (entre 7,0 e 8,0)', -5.00),
  ('punicao', 'Tirar nota baixa na escola (abaixo de 7,0)', -10.00),
  ('punicao', 'Não cuidar de seus objetos ou estragar objetos de casa', -1.00),
  ('punicao', 'Com irmão - atrapalhar, humilhar, não cuidar, bater, irritar, não ajudar', -2.00),
  ('punicao', 'Não prestar atenção', -1.00),
  ('punicao', 'Mentir', -5.00),
  ('punicao', 'Não assumir erro', -3.00),
  ('punicao', 'Responder "não sei" de algo que fez', -3.00),
  ('punicao', 'Responder de forma grosseira, respirar fundo, etc', -2.00),
  ('punicao', 'Jogar bola em casa', -5.00),
  ('punicao', 'Não dar valor ao que tem valor', -3.00),
  ('punicao', 'Deixar de ir ao esporte ou atividades', -10.00);

-- ---------- Bônus / Vantagens ----------
insert into itens_regras (categoria, descricao, valor) values
  ('bonus', 'Tirar nota 10,0', 10.00),
  ('bonus', 'Tirar nota de 9,0 a 9,9', 10.00),
  ('bonus', 'Ler livro', 3.00),
  ('bonus', 'Ser proativo fora das obrigações', 2.00),
  ('bonus', 'Ajudar o irmão nas dificuldades, conversar, elogiar e ajudar', 3.00),
  ('bonus', 'Atender os pedidos de papai e mamãe sem reclamar', 3.00),
  ('bonus', 'Se comportar com excelência fora de casa', 3.00);

-- ---------- Saldo inicial (R$ 120,00 cada, conforme planilha) ----------
insert into saldos (crianca_id, saldo_mes, saldo_poupanca)
select id, 120.00, 0.00 from perfis where nome in ('Zon', 'Ettore');

-- ---------- Config financeira: mês corrente, 100% do CDI ----------
-- IMPORTANTE: taxa_cdi_pct é a taxa MENSAL real do CDI (ex.: 0,90 para 0,90%).
-- Consulte no site do Banco Central / B3 todo início de mês e atualize aqui.
insert into config_financeira (mes_referencia, taxa_cdi_pct, multiplicador) values
  (date_trunc('month', current_date), 1.09, 1.00); -- 1,09% = taxa CDI de agosto/2026 (setembro ainda parcial em 17/09) — atualize em /config quando setembro fechar
