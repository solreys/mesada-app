'use client';

import { formatarReal } from '@/lib/calculos';
import { textoRegra, type ProgressoMeta } from '@/lib/metas';

// Progresso das metas do mês de uma criança.
export default function MetasCard({ nome, lista, mesFechado }: { nome: string; lista: ProgressoMeta[]; mesFechado?: boolean }) {
  if (lista.length === 0) return null;
  const ganho = lista.filter((p) => p.ok).reduce((a, p) => a + Number(p.meta.bonus), 0);
  return (
    <section className="rounded-2xl bg-slate-900 p-5 shadow-lg border border-slate-800 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm uppercase tracking-wide text-slate-400">Metas do mês — {nome}</h3>
        <span className="text-xs text-emerald-400 whitespace-nowrap">
          {mesFechado ? 'ganhou' : 'garantindo'} {formatarReal(ganho)}
        </span>
      </div>
      <ul className="space-y-3">
        {lista.map(({ meta, alvo, feito, ok }) => {
          const maximo = meta.tipo === 'maximo';
          // Máximo: barra mostra quanto do limite já foi usado. Mínimo: quanto falta para chegar.
          const base = Math.max(meta.limite, 1);
          const pct = Math.min(100, (Math.max(feito, 0) / base) * 100);
          const estourou = maximo && feito > meta.limite;
          const cor = maximo ? (estourou ? 'bg-red-500' : feito === meta.limite ? 'bg-amber-400' : 'bg-emerald-500') : ok ? 'bg-emerald-500' : 'bg-blue-500';
          const status = maximo
            ? estourou
              ? 'perdeu'
              : meta.limite - feito === 0
                ? 'no limite'
                : `pode ${meta.limite - feito}× ainda`
            : ok
              ? 'conseguiu!'
              : `faltam ${meta.limite - feito}`;
          return (
            <li key={meta.id} className="space-y-1">
              <div className="flex items-start justify-between gap-2 text-sm">
                <span className="leading-snug">
                  {alvo.icone && <span className="mr-1">{alvo.icone}</span>}
                  {alvo.texto}
                  <span className="block text-xs text-slate-500">
                    {textoRegra(meta)} → +{formatarReal(Number(meta.bonus))}
                  </span>
                </span>
                <span className={`text-xs whitespace-nowrap font-semibold ${estourou ? 'text-red-400' : ok ? 'text-emerald-400' : 'text-slate-300'}`}>
                  {feito}/{meta.limite} · {status}
                </span>
              </div>
              <div className="h-2 w-full rounded bg-slate-800">
                <div className={`h-2 rounded ${cor}`} style={{ width: `${maximo && meta.limite === 0 ? (feito > 0 ? 100 : 0) : pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
