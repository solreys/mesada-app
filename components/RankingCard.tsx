'use client';

import { formatarReal } from '@/lib/calculos';

interface Item {
  nome: string;
  resultado: number; // saldo inicial do mês + lançamentos aprovados
  movimento: number; // só a soma dos lançamentos
  cor: string;
}

export default function RankingCard({ titulo, itens }: { titulo: string; itens: Item[] }) {
  const ordenado = [...itens].sort((a, b) => b.resultado - a.resultado);

  return (
    <div className="rounded-2xl bg-slate-900 p-5 shadow-lg border border-slate-800">
      <h3 className="text-sm uppercase tracking-wide text-slate-400 mb-4">{titulo}</h3>
      <ol className="space-y-3">
        {ordenado.map((item, i) => (
          <li key={item.nome} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold w-5 text-center">{i === 0 ? '🏆' : i + 1}</span>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.cor }} />
              <span>{item.nome}</span>
            </div>
            <div className="text-right">
              <span className={`font-semibold ${item.resultado < 0 ? 'text-red-400' : ''}`}>
                {formatarReal(item.resultado)}
              </span>
              <span
                className={`block text-xs ${
                  item.movimento < 0 ? 'text-red-400' : item.movimento > 0 ? 'text-emerald-400' : 'text-slate-500'
                }`}
              >
                {item.movimento > 0 ? '+' : ''}
                {formatarReal(item.movimento)} no mês
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
