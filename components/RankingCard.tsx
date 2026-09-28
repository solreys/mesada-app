'use client';

import { formatarReal } from '@/lib/calculos';

interface Item {
  nome: string;
  saldoTotal: number;
  cor: string;
}

export default function RankingCard({ itens }: { itens: Item[] }) {
  const ordenado = [...itens].sort((a, b) => b.saldoTotal - a.saldoTotal);

  return (
    <div className="rounded-2xl bg-slate-900 p-5 shadow-lg border border-slate-800">
      <h3 className="text-sm uppercase tracking-wide text-slate-400 mb-4">Ranking do mês</h3>
      <ol className="space-y-3">
        {ordenado.map((item, i) => (
          <li key={item.nome} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold w-5 text-center">{i === 0 ? '🏆' : i + 1}</span>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.cor }} />
              <span>{item.nome}</span>
            </div>
            <span className="font-semibold">{formatarReal(item.saldoTotal)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
