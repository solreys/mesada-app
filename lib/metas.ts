// Regras das metas — espelham realizado_meta() e fechar_mes() do banco
// (supabase/migrations/20261109000000_metas.sql). Se mudar lá, mude aqui.
import type { ItemRegra, Lancamento, Meta } from '@/lib/types';
import { mesDe } from '@/lib/calculos';

type Lanc = Pick<Lancamento, 'crianca_id' | 'item_id' | 'descricao' | 'status'>;

// mes: 'AAAA-MM' avaliado. A meta vale a partir do mês em que foi criada (sem bônus retroativo).
export function metaVale(meta: Meta, criancaId: string, mes: string): boolean {
  return (
    meta.ativo &&
    (meta.crianca_id === null || meta.crianca_id === criancaId) &&
    mesDe(meta.criado_em) <= mes
  );
}

export function alvoMeta(meta: Meta, itens: Map<string, ItemRegra>): { texto: string; icone: string | null } {
  if (meta.item_id) {
    const i = itens.get(meta.item_id);
    return { texto: i?.descricao ?? 'Item removido', icone: i?.icone ?? null };
  }
  return { texto: `Área: ${meta.area}`, icone: null };
}

export function textoRegra(meta: Meta): string {
  return `${meta.tipo === 'maximo' ? 'no máximo' : 'pelo menos'} ${meta.limite}×`;
}

// Quantas vezes a meta aconteceu nos lançamentos informados (já filtrados pelo mês). Estorno desconta 1.
export function realizado(meta: Meta, lancs: Lanc[], itens: Map<string, ItemRegra>, criancaId: string): number {
  return lancs
    .filter((l) => l.crianca_id === criancaId && l.status === 'aprovado' && l.item_id)
    .filter((l) => {
      if (meta.item_id) return l.item_id === meta.item_id;
      const i = itens.get(l.item_id!);
      if (!i || i.area !== meta.area) return false;
      return meta.tipo === 'maximo' ? Number(i.valor) < 0 : Number(i.valor) > 0;
    })
    .reduce((a, l) => a + (l.descricao.startsWith('Estorno: ') ? -1 : 1), 0);
}

export function cumprida(meta: Meta, feito: number): boolean {
  return meta.tipo === 'maximo' ? feito <= meta.limite : feito >= meta.limite;
}

export interface ProgressoMeta {
  meta: Meta;
  alvo: { texto: string; icone: string | null };
  feito: number;
  ok: boolean;
}

export function progresso(
  metas: Meta[],
  lancs: Lanc[],
  itens: Map<string, ItemRegra>,
  criancaId: string,
  mes: string
): ProgressoMeta[] {
  return metas
    .filter((m) => metaVale(m, criancaId, mes))
    .map((meta) => {
      const feito = realizado(meta, lancs, itens, criancaId);
      return { meta, alvo: alvoMeta(meta, itens), feito, ok: cumprida(meta, feito) };
    });
}
