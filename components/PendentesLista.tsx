'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import { formatarReal } from '@/lib/calculos';
import type { Lancamento, Perfil } from '@/lib/types';

interface Props {
  pendentes: Lancamento[];
  nomes: Record<string, string>;
  perfil: Perfil | null;
  onMudou?: () => void;
}

// Itens marcados pela criança aguardando auditoria. Responsável: ✓ aceita / ✕ retira, um toque cada.
export default function PendentesLista({ pendentes, nomes, perfil, onMudou }: Props) {
  const [decididos, setDecididos] = useState<Record<string, 'aprovado' | 'rejeitado'>>({});
  const [erro, setErro] = useState<string | null>(null);
  const podeDecidir = perfil?.papel === 'responsavel';
  const visiveis = pendentes.filter((l) => !decididos[l.id]);

  async function decidir(ids: string[], status: 'aprovado' | 'rejeitado') {
    if (!perfil) return;
    setErro(null);
    // Some da lista na hora; volta se der erro.
    setDecididos((d) => ({ ...d, ...Object.fromEntries(ids.map((id) => [id, status])) }));
    if (navigator.vibrate) navigator.vibrate(20);
    const { error } = await supabaseBrowser()
      .from('lancamentos')
      .update({ status, aprovado_por: perfil.id, aprovado_em: new Date().toISOString() })
      .in('id', ids)
      .eq('status', 'pendente');
    if (error) {
      setDecididos((d) => {
        const novo = { ...d };
        ids.forEach((id) => delete novo[id]);
        return novo;
      });
      setErro(error.message.includes('fechado') ? error.message : 'Não foi possível salvar. Tente de novo.');
    }
    onMudou?.();
  }

  if (visiveis.length === 0) return null;

  return (
    <section className="rounded-2xl bg-amber-950/40 border border-amber-800 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm uppercase tracking-wide text-amber-300">
          {podeDecidir ? 'Para auditar' : 'Aguardando aprovação'} ({visiveis.length})
        </h3>
        {podeDecidir && visiveis.length > 1 && (
          <button
            onClick={() => decidir(visiveis.map((l) => l.id), 'aprovado')}
            className="rounded-lg bg-emerald-700 px-3 py-1 text-xs font-semibold"
          >
            ✓ Aceitar todos
          </button>
        )}
      </div>
      {erro && <p className="text-sm text-red-400">{erro}</p>}
      <ul className="space-y-2">
        {visiveis.map((l) => (
          <li key={l.id} className="flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-snug">
                {podeDecidir && <strong>{nomes[l.crianca_id] ?? '—'} · </strong>}
                {l.descricao}
              </p>
              <p className="text-xs text-slate-500">
                {new Date(l.criado_em).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {l.observacao ? ` · ${l.observacao}` : ''}
              </p>
            </div>
            <span className={`text-sm font-semibold whitespace-nowrap ${l.valor < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {formatarReal(Number(l.valor))}
            </span>
            {podeDecidir && (
              <>
                <button
                  onClick={() => decidir([l.id], 'aprovado')}
                  aria-label="Aceitar"
                  className="h-10 w-10 shrink-0 rounded-full bg-emerald-600 text-lg font-bold active:scale-95"
                >
                  ✓
                </button>
                <button
                  onClick={() => decidir([l.id], 'rejeitado')}
                  aria-label="Retirar"
                  className="h-10 w-10 shrink-0 rounded-full bg-slate-700 text-lg font-bold active:scale-95"
                >
                  ✕
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
