'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import type { Lancamento, Perfil } from '@/lib/types';
import { formatarReal } from '@/lib/calculos';

export default function AprovacoesPage() {
  const [pendentes, setPendentes] = useState<Lancamento[]>([]);
  const [perfis, setPerfis] = useState<Record<string, Perfil>>({});
  const [meuId, setMeuId] = useState<string | null>(null);
  const [souResponsavel, setSouResponsavel] = useState<boolean | null>(null);

  async function carregar() {
    const supabase = supabaseBrowser();
    const { data: u } = await supabase.auth.getUser();
    const { data: todos } = await supabase.from('perfis').select('*');
    const map: Record<string, Perfil> = {};
    (todos ?? []).forEach((p) => (map[p.id] = p));
    setPerfis(map);
    const meu = (todos ?? []).find((p) => p.auth_user_id === u.user?.id);
    setMeuId(meu?.id ?? null);
    setSouResponsavel(meu?.papel === 'responsavel');
    const { data } = await supabase
      .from('lancamentos')
      .select('*')
      .eq('status', 'pendente')
      .order('criado_em', { ascending: true });
    setPendentes(data ?? []);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function decidir(id: string, status: 'aprovado' | 'rejeitado') {
    const supabase = supabaseBrowser();
    await supabase
      .from('lancamentos')
      .update({ status, aprovado_por: meuId, aprovado_em: new Date().toISOString() })
      .eq('id', id);
    carregar();
  }

  return (
    <main className="max-w-lg mx-auto p-4 pb-24 space-y-4">
      <header className="pt-4 flex items-center gap-3">
        <a href="/dashboard" className="text-slate-400">←</a>
        <h1 className="text-xl font-bold">Aprovações pendentes</h1>
      </header>

      {souResponsavel === false && (
        <p className="text-sm text-slate-400">Apenas responsáveis podem aprovar. Entre com sua conta.</p>
      )}
      {souResponsavel && pendentes.length === 0 && (
        <p className="text-sm text-slate-500">Nada pendente.</p>
      )}

      {pendentes.map((l) => (
        <div key={l.id} className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-3">
          <div className="flex justify-between gap-3">
            <div>
              <p className="font-medium">{perfis[l.crianca_id]?.nome ?? '—'}</p>
              <p className="text-sm text-slate-400">{l.descricao}</p>
              <p className="text-xs text-slate-500">
                por {perfis[l.lancado_por]?.nome ?? '—'} · {new Date(l.criado_em).toLocaleString('pt-BR')}
              </p>
            </div>
            <span className={`font-semibold whitespace-nowrap ${l.valor < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {formatarReal(l.valor)}
            </span>
          </div>
          {souResponsavel && (
            <div className="flex gap-2">
              <button onClick={() => decidir(l.id, 'aprovado')} className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold">
                Aprovar
              </button>
              <button onClick={() => decidir(l.id, 'rejeitado')} className="flex-1 rounded-lg bg-slate-700 py-2 text-sm font-semibold">
                Rejeitar
              </button>
            </div>
          )}
        </div>
      ))}
    </main>
  );
}
