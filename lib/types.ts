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
