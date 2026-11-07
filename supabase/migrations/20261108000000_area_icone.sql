-- ============================================================
-- Migração 08/11/2026: ícone e área de comportamento em cada item do catálogo.
-- Preenche só itens ainda sem área/ícone (não sobrescreve o que for editado no app). Idempotente.
-- ============================================================
alter table itens_regras add column if not exists icone text;
alter table itens_regras add column if not exists area text;

with proposta(descricao, area, icone) as (values
  -- Punições
  ('Chamar de covarde', 'Respeito', '🗯️'),
  ('Com irmão - atrapalhar, humilhar, não cuidar, bater, irritar, não ajudar', 'Irmão e família', '👊'),
  ('Deboche', 'Respeito', '😏'),
  ('Deixar de ir ao esporte ou atividades', 'Escola e atividades', '⚽'),
  ('Falar chorando, perder controle, ficar bravinho', 'Autocontrole', '😤'),
  ('Fazer meia boca', 'Responsabilidade', '🫤'),
  ('Fraqueza', 'Autocontrole', '😩'),
  ('Gritar (forte)', 'Autocontrole', '📢'),
  ('Gritar (leve)', 'Autocontrole', '🔊'),
  ('Jogar bola em casa', 'Casa', '🏀'),
  ('Mentir', 'Honestidade', '🤥'),
  ('Não assumir erro', 'Honestidade', '🙈'),
  ('Não cuidar de seus objetos ou estragar objetos de casa', 'Casa', '🧸'),
  ('Não cuidar do Rocky', 'Responsabilidade', '🐶'),
  ('Não dar valor ao que tem valor', 'Respeito', '💎'),
  ('Não executar as tarefas, deixar coisas jogadas, reclamar', 'Responsabilidade', '🧹'),
  ('Não fazer as coisas na hora', 'Responsabilidade', '⏰'),
  ('Não fazer as lições da escola / não estudar', 'Escola e atividades', '📚'),
  ('Não obedecer', 'Respeito', '🙉'),
  ('Não prestar atenção', 'Responsabilidade', '👀'),
  ('Responder "não sei" de algo que fez', 'Honestidade', '🤷'),
  ('Responder de forma grosseira, respirar fundo, etc', 'Respeito', '😠'),
  ('Sujar a casa', 'Casa', '🧽'),
  ('Testar papai e mamãe e insistir', 'Respeito', '🔁'),
  ('Tirar nota baixa na escola (abaixo de 7,0)', 'Escola e atividades', '📉'),
  ('Tirar nota baixa na escola (entre 7,0 e 8,0)', 'Escola e atividades', '📝'),
  ('Comer unha', 'Hábitos', '💅'),
  -- Bônus
  ('Ajudar a família', 'Irmão e família', '🤝'),
  ('Ajudar em casa', 'Casa', '🏠'),
  ('Ajudar o irmão nas dificuldades, conversar, elogiar e ajudar', 'Irmão e família', '🫂'),
  ('Assumir o erro', 'Honestidade', '🙋'),
  ('Atender os pedidos de papai e mamãe sem reclamar', 'Respeito', '👍'),
  ('Ler livro', 'Escola e atividades', '📖'),
  ('Se comportar com excelência fora de casa', 'Respeito', '⭐'),
  ('Ser proativo fora das obrigações', 'Responsabilidade', '🚀'),
  ('Tirar nota 10,0', 'Escola e atividades', '🏆'),
  ('Tirar nota de 9,0 a 9,9', 'Escola e atividades', '🥇')
)
update itens_regras i
   set area = coalesce(i.area, p.area),
       icone = coalesce(i.icone, p.icone)
  from proposta p
 where i.descricao = p.descricao
   and (i.area is null or i.icone is null);
