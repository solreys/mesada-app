// Cálculos puros da tela de Análise (sem acesso ao banco).
import type { ItemRegra, Lancamento } from '@/lib/types';
import { SEM_AREA } from '@/lib/calculos';

export type Lanc = Pick<Lancamento, 'crianca_id' | 'item_id' | 'descricao' | 'valor' | 'criado_em' | 'ocorrido_em'>;

// Quando aconteceu (se informado) ou quando foi registrado.
export function quandoAconteceu(l: Pick<Lancamento, 'criado_em' | 'ocorrido_em'>): string {
  return l.ocorrido_em ?? l.criado_em;
}

export const PREFIXO_ESTORNO = 'Estorno: ';
const DIA = 86_400_000;

export interface Contagem {
  chave: string;
  nome: string;
  negativo: boolean; // punição
  area: string;
  icone: string | null;
  qtd: number; // estornos descontam 1
  valor: number;
}

// Agrupa por item do catálogo (ou pela descrição, se foi "Outro"); estorno conta -1 no item original.
export function contarPorItem(lancs: Lanc[], itens: Map<string, ItemRegra>): Map<string, Contagem> {
  const mapa = new Map<string, Contagem>();
  lancs.forEach((l) => {
    const estorno = l.descricao.startsWith(PREFIXO_ESTORNO);
    const desc = estorno ? l.descricao.slice(PREFIXO_ESTORNO.length) : l.descricao;
    const item = l.item_id ? itens.get(l.item_id) : undefined;
    const chave = item ? item.id : `txt:${desc.trim().toLowerCase()}`;
    let c = mapa.get(chave);
    if (!c) {
      const base = item ? Number(item.valor) : estorno ? -Number(l.valor) : Number(l.valor);
      c = {
        chave,
        nome: item?.descricao ?? desc,
        negativo: base < 0,
        area: item?.area ?? SEM_AREA,
        icone: item?.icone ?? null,
        qtd: 0,
        valor: 0,
      };
      mapa.set(chave, c);
    }
    c.qtd += estorno ? -1 : 1;
    c.valor += Number(l.valor);
  });
  return mapa;
}

export function noIntervalo(lancs: Lanc[], inicio: number, fim: number): Lanc[] {
  return lancs.filter((l) => {
    const t = new Date(quandoAconteceu(l)).getTime();
    return t >= inicio && t < fim;
  });
}

export interface Totais {
  punicoesQtd: number;
  punicoesValor: number;
  bonusQtd: number;
  bonusValor: number;
}

export function totais(contagens: Iterable<Contagem>): Totais {
  const t = { punicoesQtd: 0, punicoesValor: 0, bonusQtd: 0, bonusValor: 0 };
  for (const c of Array.from(contagens)) {
    if (c.negativo) {
      t.punicoesQtd += c.qtd;
      t.punicoesValor += c.valor;
    } else {
      t.bonusQtd += c.qtd;
      t.bonusValor += c.valor;
    }
  }
  return t;
}

export interface Tendencia {
  chave: string;
  nome: string;
  negativo: boolean;
  antes: number;
  agora: number;
  melhora: number; // > 0 melhorou (punição caiu ou bônus subiu)
}

// Compara a quantidade de cada item entre o período anterior e o atual (mesmo tamanho).
// Ignora itens com menos de `minimo` ocorrências somando os dois períodos, para evitar ruído.
export function tendencias(atual: Map<string, Contagem>, anterior: Map<string, Contagem>, minimo = 2): Tendencia[] {
  const chaves = new Set([...Array.from(atual.keys()), ...Array.from(anterior.keys())]);
  const lista: Tendencia[] = [];
  chaves.forEach((k) => {
    const a = atual.get(k);
    const b = anterior.get(k);
    const agora = Math.max(0, a?.qtd ?? 0);
    const antes = Math.max(0, b?.qtd ?? 0);
    if (agora + antes < minimo || agora === antes) return;
    const ref = (a ?? b)!;
    lista.push({
      chave: k,
      nome: ref.nome,
      negativo: ref.negativo,
      antes,
      agora,
      melhora: ref.negativo ? antes - agora : agora - antes,
    });
  });
  return lista;
}

// Dia local 'AAAA-MM-DD'.
export function diaLocal(t: number | string): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Dias sem punição dentro da janela e sequência atual (até hoje) sem punição.
export function diasSemPunicao(lancs: Lanc[], itens: Map<string, ItemRegra>, inicio: number, fim: number) {
  const comPunicao = new Set<string>();
  lancs.forEach((l) => {
    const item = l.item_id ? itens.get(l.item_id) : undefined;
    const negativo = item ? Number(item.valor) < 0 : Number(l.valor) < 0;
    if (negativo && !l.descricao.startsWith(PREFIXO_ESTORNO)) comPunicao.add(diaLocal(quandoAconteceu(l)));
  });
  let total = 0;
  let livres = 0;
  for (let t = fim - 1; t >= inicio; t -= DIA) {
    total++;
    if (!comPunicao.has(diaLocal(t))) livres++;
  }
  let sequencia = 0;
  for (let t = fim - 1; t >= inicio && !comPunicao.has(diaLocal(t)); t -= DIA) sequencia++;
  return { total, livres, sequencia };
}

// Projeção do resultado do mês corrente mantendo o ritmo diário até agora.
export function projecaoMes(somaAteAgora: number, agora: Date, inicial: number) {
  const diasMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
  const diasPassados = agora.getDate();
  const ritmo = somaAteAgora / diasPassados;
  return { diasMes, diasPassados, atual: inicial + somaAteAgora, projetado: inicial + ritmo * diasMes };
}

export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Punições por dia da semana e por período do dia (pela hora do registro no app).
export function padroes(lancs: Lanc[], itens: Map<string, ItemRegra>) {
  const semana = [0, 0, 0, 0, 0, 0, 0];
  const turno = { Manhã: 0, Tarde: 0, Noite: 0 };
  lancs.forEach((l) => {
    if (l.descricao.startsWith(PREFIXO_ESTORNO)) return;
    const item = l.item_id ? itens.get(l.item_id) : undefined;
    const negativo = item ? Number(item.valor) < 0 : Number(l.valor) < 0;
    if (!negativo) return;
    const d = new Date(quandoAconteceu(l));
    semana[d.getDay()]++;
    const h = d.getHours();
    if (h >= 5 && h < 12) turno['Manhã']++;
    else if (h >= 12 && h < 18) turno['Tarde']++;
    else turno['Noite']++;
  });
  return { semana, turno };
}

export interface PorArea {
  area: string;
  punicoes: number;
  punicoesValor: number;
  bonus: number;
  bonusValor: number;
  punicoesAntes: number;
}

// Totais por área de comportamento no período atual, com as punições do período anterior para comparar.
export function porArea(atual: Map<string, Contagem>, anterior: Map<string, Contagem>): PorArea[] {
  const mapa = new Map<string, PorArea>();
  const pegar = (area: string) => {
    if (!mapa.has(area)) mapa.set(area, { area, punicoes: 0, punicoesValor: 0, bonus: 0, bonusValor: 0, punicoesAntes: 0 });
    return mapa.get(area)!;
  };
  atual.forEach((c) => {
    const a = pegar(c.area);
    if (c.negativo) {
      a.punicoes += c.qtd;
      a.punicoesValor += c.valor;
    } else {
      a.bonus += c.qtd;
      a.bonusValor += c.valor;
    }
  });
  anterior.forEach((c) => {
    if (c.negativo) pegar(c.area).punicoesAntes += c.qtd;
  });
  return Array.from(mapa.values())
    .filter((a) => a.punicoes || a.bonus || a.punicoesAntes)
    .sort((x, y) => y.punicoes - x.punicoes || y.bonus - x.bonus);
}

export interface Par {
  a: string;
  b: string;
  iconeA: string | null;
  iconeB: string | null;
  juntos: number; // dias em que os dois aconteceram (mesma criança, mesmo dia)
  diasA: number;
  diasB: number;
}

// Punições que andam juntas: pares de itens que aparecem no mesmo dia para a mesma criança.
export function punicoesJuntas(lancs: Lanc[], itens: Map<string, ItemRegra>, minimo = 2): Par[] {
  const dias = new Map<string, Set<string>>(); // "crianca|dia" -> itens punidos
  lancs.forEach((l) => {
    if (l.descricao.startsWith(PREFIXO_ESTORNO) || !l.item_id) return;
    const item = itens.get(l.item_id);
    if (!item || Number(item.valor) >= 0) return;
    const k = `${l.crianca_id}|${diaLocal(quandoAconteceu(l))}`;
    if (!dias.has(k)) dias.set(k, new Set());
    dias.get(k)!.add(item.id);
  });
  const diasPorItem = new Map<string, number>();
  const pares = new Map<string, number>();
  dias.forEach((set) => {
    const ids = Array.from(set).sort();
    ids.forEach((id) => diasPorItem.set(id, (diasPorItem.get(id) ?? 0) + 1));
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const k = `${ids[i]}|${ids[j]}`;
        pares.set(k, (pares.get(k) ?? 0) + 1);
      }
  });
  return Array.from(pares.entries())
    .filter(([, n]) => n >= minimo)
    .map(([k, n]) => {
      const [a, b] = k.split('|');
      const ia = itens.get(a)!;
      const ib = itens.get(b)!;
      return {
        a: ia.descricao,
        b: ib.descricao,
        iconeA: ia.icone,
        iconeB: ib.icone,
        juntos: n,
        diasA: diasPorItem.get(a) ?? 0,
        diasB: diasPorItem.get(b) ?? 0,
      };
    })
    .sort((x, y) => y.juntos - x.juntos);
}
