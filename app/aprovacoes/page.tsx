'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import type { Lancamento, Perfil } from '@/lib/types';
import { formatarReal } from '@/lib/calculos';
import { usePerfil } from '@/lib/usePerfil';

export default function AprovacoesPage() {
  const { perfil, carregando } = usePerfil();
  const [pendentes, setPendentes] = useState<Lancamento[]>([]);
  const [perfis, setPerfis] = useState<Record<string, Perfil>>({});
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const souResponsavel = perfil?.papel === 'responsavel';

  async function carregar() {
    const supabase = supabaseBrowser();
    const [{ data: todos }, { data }] = await Promise.all([
      supabase.from('perfis').select('*'),
      supabase.from('lancamentos').select('*').eq('status', 'pendente').order('criado_em', { ascending: true }),
    ]);
    const map: Record<string, Perfil> = {};
    (todos ?? []).forEach((p) => (map[p.id] = p));
    setPerfis(map);
    setPendentes(data ?? []);
  }

  useEffect(() => {
    carregar();
    const supabase = supabaseBrowser();
    const canal = supabase
      .channel('aprovacoes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lancamentos' }, carregar)
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  async function decidir(ids: string[], status: 'aprovado' | 'rejeitado') {
    if (!perfil) return;
    setOcupado(true);
    setErro(null);
    const { error } = await supabaseBrowser()
      .from('lancamentos')
      .update({ status, aprovado_por: perfil.id, aprovado_em: new Date().toISOString() })
      .in('id', ids)
      .eq('status', 'pendente');
    setOcupado(false);
    if (error) setErro('Não foi possível salvar. Tente de novo.');
    carregar();
  }

  return (
    <main className="max-w-lg mx-auto p-4 pb-28 space-y-4">
      <header className="pt-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Aprovações pendentes</h1>
        {souResponsavel && pendentes.length > 1 && (
          <button
            onClick={() => decidir(pendentes.map((l) => l.id), 'aprovado')}
            disabled={ocupado}
            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
          >
            Aprovar todos ({pendentes.length})
          </button>
        )}
      </header>

      {!carregando && !souResponsavel && (
        <p className="text-sm text-slate-400">Apenas responsáveis podem aprovar. Entre com sua conta.</p>
      )}
      {erro && <p className="text-sm text-red-400">{erro}</p>}
      {pendentes.length === 0 && <p className="text-sm text-slate-500">Nada pendente.</p>}

      {pendentes.map((l) => (
        <div key={l.id} className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-3">
          <div className="flex justify-between gap-3">
            <div>
              <p className="font-medium">{perfis[l.crianca_id]?.nome ?? '—'}</p>
              <p className="text-sm text-slate-300">{l.descricao}</p>
              {l.observacao && <p className="text-xs text-slate-400 italic">{l.observacao}</p>}
              <p className="text-xs text-slate-500">
                por {perfis[l.lancado_por]?.nome ?? '—'} · {new Date(l.criado_em).toLocaleString('pt-BR')}
              </p>
            </div>
            <span className={`font-semibold whitespace-nowrap ${l.valor < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {formatarReal(Number(l.valor))}
            </span>
          </div>
          {souResponsavel && (
            <div className="flex gap-2">
              <button
                onClick={() => decidir([l.id], 'aprovado')}
                disabled={ocupado}
                className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold disabled:opacity-40"
              >
                Aprovar
              </button>
              <button
                onClick={() => decidir([l.id], 'rejeitado')}
                disabled={ocupado}
                className="flex-1 rounded-lg bg-slate-700 py-2 text-sm font-semibold disabled:opacity-40"
              >
                Rejeitar
              </button>
            </div>
          )}
        </div>
      ))}
    </main>
  );
}
