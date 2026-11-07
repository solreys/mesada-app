export type Papel = 'responsavel' | 'crianca';
export type CategoriaItem = 'punicao' | 'bonus';
export type StatusLancamento = 'aprovado' | 'pendente' | 'rejeitado';

export interface Perfil {
  id: string;
  auth_user_id: string | null;
  nome: string;
  papel: Papel;
  avatar_url: string | null;
  criado_em: string;
}

export interface ItemRegra {
  id: string;
  categoria: CategoriaItem;
  descricao: string;
  valor: number;
  ativo: boolean;
  icone: string | null;
  area: string | null;
  criado_em: string;
}

export interface Lancamento {
  id: string;
  crianca_id: string;
  item_id: string | null;
  descricao: string;
  valor: number;
  lancado_por: string;
  observacao: string | null;
  status: StatusLancamento;
  aprovado_por: string | null;
  aprovado_em: string | null;
  criado_em: string;
}

export interface Saldo {
  crianca_id: string;
  saldo_mes: number;
  saldo_poupanca: number;
  atualizado_em: string;
}

export interface ConfigFinanceira {
  id: string;
  mes_referencia: string;
  taxa_cdi_pct: number;
  multiplicador: number;
  criado_por: string | null;
  criado_em: string;
}

export interface RendimentoHistorico {
  id: string;
  crianca_id: string;
  mes_referencia: string;
  saldo_base: number;
  taxa_aplicada_pct: number;
  valor_rendimento: number;
  aplicado_em: string;
}

export type DestinoSobra = 'poupanca' | 'pago' | 'debito_poupanca';

export interface Fechamento {
  id: string;
  crianca_id: string;
  mes_referencia: string;
  saldo_inicial: number;
  bonus: number;
  punicoes: number;
  bonus_metas: number;
  saldo_final: number;
  destino: DestinoSobra;
  valor_para_poupanca: number;
  taxa_cdi_pct: number | null;
  poupanca_antes: number;
  rendimento: number;
  poupanca_depois: number;
  fechado_por: string | null;
  fechado_em: string;
}

export type TipoMeta = 'maximo' | 'minimo';

export interface Meta {
  id: string;
  crianca_id: string | null; // null = as duas crianças
  item_id: string | null;
  area: string | null;
  tipo: TipoMeta;
  limite: number;
  bonus: number;
  ativo: boolean;
  criado_por: string | null;
  criado_em: string;
}

export interface MetaResultado {
  id: string;
  meta_id: string | null;
  crianca_id: string;
  mes_referencia: string;
  descricao: string;
  tipo: TipoMeta;
  limite: number;
  realizado: number;
  cumprida: boolean;
  bonus: number;
}

export interface ObjetivoPoupanca {
  id: string;
  crianca_id: string;
  nome: string;
  icone: string | null;
  valor_alvo: number;
  ativo: boolean;
  criado_em: string;
  concluido_em: string | null;
}
