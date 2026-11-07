'use client';

import { formatarReal } from '@/lib/calculos';

interface Props {
  nome: string;
  rotuloMes?: string;
  saldoMes: number;
  rotuloPoupanca?: string;
  saldoPoupanca: number;
  rodape?: string;
  corAccent: string;
}

export default function SaldoCard({
  nome,
  rotuloMes = 'Mesada do mês',
  saldoMes,
  rotuloPoupanca = 'Poupança (rende CDI)',
  saldoPoupanca,
  rodape,
  corAccent,
}: Props) {
  return (
    <div className="rounded-2xl bg-slate-900 p-4 sm:p-5 shadow-lg border border-slate-800">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">{nome}</h3>
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: corAccent }} />
      </div>
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-slate-400">{rotuloMes}</p>
        <p className={`text-2xl sm:text-3xl font-bold whitespace-nowrap ${saldoMes < 0 ? 'text-red-400' : 'text-slate-50'}`}>
          {formatarReal(saldoMes)}
        </p>
      </div>
      <div className="mt-4 pt-4 border-t border-slate-800">
        <p className="text-xs uppercase tracking-wide text-slate-400">{rotuloPoupanca}</p>
        <p className={`text-lg sm:text-xl font-semibold whitespace-nowrap ${saldoPoupanca < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
          {formatarReal(saldoPoupanca)}
        </p>
      </div>
      {rodape && <p className="mt-3 text-xs text-slate-500">{rodape}</p>}
    </div>
  );
}
