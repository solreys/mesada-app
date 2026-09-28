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
