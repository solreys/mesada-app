'use client';

import type { Lancamento } from '@/lib/types';
import { formatarReal } from '@/lib/calculos';

interface Props {
  mes: string; // 'AAAA-MM'
  lancamentos: Lancamento[]; // aprovados da criança no mês
  selecionado: number | null;
  onSelecionar: (dia: number | null) => void;
}

const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

// Calendário do mês: verde = dia sem punição, vermelho = teve punição, ponto verde = teve bônus.
export default function CalendarioMes({ mes, lancamentos, selecionado, onSelecionar }: Props) {
  const [ano, m] = mes.split('-').map(Number);
  const primeiroDiaSemana = new Date(ano, m - 1, 1).getDay();
  const diasNoMes = new Date(ano, m, 0).getDate();
  const hoje = new Date();
  const ehMesAtual = hoje.getFullYear() === ano && hoje.getMonth() + 1 === m;
  const ultimoDiaPassado = ehMesAtual ? hoje.getDate() : new Date(ano, m - 1, 1) > hoje ? 0 : diasNoMes;

  const porDia = new Map<number, { pun: number; bon: number; soma: number }>();
  lancamentos.forEach((l) => {
    const d = new Date(l.ocorrido_em ?? l.criado_em);
    if (d.getFullYear() !== ano || d.getMonth() + 1 !== m) return;
    const dia = d.getDate();
    const x = porDia.get(dia) ?? { pun: 0, bon: 0, soma: 0 };
    const estorno = l.descricao.startsWith('Estorno: ');
    if (!estorno) {
      if (Number(l.valor) < 0) x.pun++;
      else x.bon++;
    }
    x.soma += Number(l.valor);
    porDia.set(dia, x);
  });

  const livres = Array.from({ length: ultimoDiaPassado }, (_, i) => i + 1).filter((d) => !(porDia.get(d)?.pun)).length;
  const celulas: (number | null)[] = [...Array(primeiroDiaSemana).fill(null), ...Array.from({ length: diasNoMes }, (_, i) => i + 1)];

  return (
    <section className="rounded-2xl bg-slate-900 p-5 shadow-lg border border-slate-800">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm uppercase tracking-wide text-slate-400">Calendário</h3>
        <span className="text-xs text-slate-400">
          <strong className="text-emerald-400">{livres}</strong> de {ultimoDiaPassado} dias sem punição
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {SEMANA.map((s, i) => (
          <span key={i} className="text-[10px] text-slate-500">
            {s}
          </span>
        ))}
        {celulas.map((dia, i) => {
          if (dia === null) return <span key={`v${i}`} />;
          const info = porDia.get(dia);
          const futuro = dia > ultimoDiaPassado;
          const cor = futuro
            ? 'bg-slate-800/40 text-slate-600'
            : info?.pun
              ? 'bg-red-900/70 text-red-100'
              : 'bg-emerald-900/60 text-emerald-100';
          return (
            <button
              key={dia}
              disabled={futuro}
              onClick={() => onSelecionar(selecionado === dia ? null : dia)}
              className={`relative aspect-square rounded-lg text-xs font-medium ${cor} ${selecionado === dia ? 'ring-2 ring-blue-400' : ''}`}
              aria-label={`Dia ${dia}${info ? `: ${formatarReal(info.soma)}` : ''}`}
            >
              {dia}
              {info?.pun ? <span className="absolute bottom-0.5 left-1 text-[9px]">{info.pun}</span> : null}
              {info?.bon ? <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-emerald-400" /> : null}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Verde: sem punição · vermelho: teve punição (número = quantas) · ponto verde: ganhou bônus. Toque num dia para filtrar o extrato.
      </p>
    </section>
  );
}
