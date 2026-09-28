'use client';

import { formatarReal } from '@/lib/calculos';

interface Props {
  nome: string;
  saldoMes: number;
  saldoPoupanca: number;
  corAccent: string;
}

export default function SaldoCard({ nome, saldoMes, saldoPoupanca, corAccent }: Props) {
  return (
    <div className="rounded-2xl bg-slate-900 p-5 shadow-lg border border-slate-800">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">{nome}</h3>
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: corAccent }} />
      </div>
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-slate-400">Mesada do mês</p>
        <p className={`text-3xl font-bold ${saldoMes < 0 ? 'text-red-400' : 'text-slate-50'}`}>
          {formatarReal(saldoMes)}
        </p>
      </div>
      <div className="mt-4 pt-4 border-t border-slate-800">
        <p className="text-xs uppercase tracking-wide text-slate-400">Poupança (rende CDI)</p>
        <p className="text-xl font-semibold text-emerald-400">{formatarReal(saldoPoupanca)}</p>
      </div>
    </div>
  );
}
