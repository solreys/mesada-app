// Áreas de comportamento usadas para agrupar os itens do catálogo.
export const AREAS = [
  'Autocontrole',
  'Casa',
  'Escola e atividades',
  'Hábitos',
  'Honestidade',
  'Irmão e família',
  'Respeito',
  'Responsabilidade',
];
export const SEM_AREA = 'Outros';

// Primeiro mês fechado pelo app (até setembro/2026 a virada foi manual).
export const PRIMEIRO_MES_FECHAMENTO = '2026-10';

// Valor com que cada criança começa o mês em saldo_mes.
export const SALDO_INICIAL_MES = 120;

export const CORES_CRIANCA: Record<string, string> = { Zon: '#2563eb', Ettore: '#16a34a' };

// Início do mês e do mês seguinte (horário local, em ISO), para filtrar por criado_em.
export function intervaloMes(mes: string): { inicio: string; fim: string } {
  const [ano, m] = mes.split('-').map(Number);
  return {
    inicio: new Date(ano, m - 1, 1).toISOString(),
    fim: new Date(ano, m, 1).toISOString(),
  };
}

// 'AAAA-MM' do mês corrente.
export function mesAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 'AAAA-MM' deslocado em n meses.
export function somarMes(mes: string, n: number): string {
  const [ano, m] = mes.split('-').map(Number);
  const d = new Date(ano, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function nomeMes(mes: string): string {
  const [ano, m] = mes.split('-').map(Number);
  const nome = new Date(ano, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

// Converte "1,50", "-2", "R$ 1.234,00" ou "1.5" em número. Retorna NaN se inválido.
export function lerValor(texto: string): number {
  let limpo = texto.replace(/R\$|\s/g, '');
  if (limpo.includes(',')) limpo = limpo.replace(/\./g, '').replace(',', '.');
  return limpo === '' ? NaN : Number(limpo);
}

export function formatarReal(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Calcula o rendimento mensal sobre o saldo guardado (poupança).
// taxaCdiPct: taxa mensal do CDI em % (ex.: 0.90 para 0,90%)
// multiplicador: 1.00 = 100% do CDI
export function calcularRendimento(
  saldoPoupanca: number,
  taxaCdiPct: number,
  multiplicador: number
): number {
  const taxaEfetiva = (taxaCdiPct / 100) * multiplicador;
  return Number((saldoPoupanca * taxaEfetiva).toFixed(2));
}

// 'AAAA-MM' -> 'AAAA-MM-01' (formato de mes_referencia no banco).
export function primeiroDia(mes: string): string {
  return `${mes}-01`;
}

// 'AAAA-MM' de uma data/hora ISO, no horário local.
export function mesDe(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Nome curto do mês: 'out/26'.
export function mesCurto(mes: string): string {
  const [ano, m] = mes.split('-').map(Number);
  const nome = new Date(ano, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return `${nome}/${String(ano).slice(2)}`;
}

// Busca todas as linhas de uma consulta, contornando o limite de 1000 linhas por resposta do Supabase.
export async function buscarTudo<T>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const tamanho = 1000;
  const todas: T[] = [];
  for (let de = 0; ; de += tamanho) {
    const { data, error } = await consulta(de, de + tamanho - 1);
    if (error || !data) break;
    todas.push(...data);
    if (data.length < tamanho) break;
  }
  return todas;
}
