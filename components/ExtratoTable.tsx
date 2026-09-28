'use client';

import { formatarReal } from '@/lib/calculos';
import type { Lancamento } from '@/lib/types';

export default function ExtratoTable({ lancamentos }: { lancamentos: Lancamento[] }) {
  if (lancamentos.length === 0) {
    return <p className="text-sm text-slate-500 py-4">Nenhum lançamento ainda.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-400 border-b border-slate-800">
            <th className="py-2 pr-2">Data</th>
            <th className="py-2 pr-2">Descrição</th>
            <th className="py-2 text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          {lancamentos.map((l) => (
            <tr key={l.id} className="border-b border-slate-900">
              <td className="py-2 pr-2 text-slate-500 whitespace-nowrap">
                {new Date(l.criado_em).toLocaleDateString('pt-BR')}
              </td>
              <td className="py-2 pr-2">{l.descricao}</td>
              <td className={`py-2 text-right font-medium ${l.valor < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {formatarReal(l.valor)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
