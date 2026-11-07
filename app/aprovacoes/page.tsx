'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import type { Lancamento } from '@/lib/types';
import PendentesLista from '@/components/PendentesLista';
import { usePerfil } from '@/lib/usePerfil';

export default function AprovacoesPage() {
  const { perfil, carregando } = usePerfil(true);
  const [pendentes, setPendentes] = useState<Lancamento[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const souResponsavel = perfil?.papel === 'responsavel';

  const carregar = useCallback(async () => {
    const supabase = supabaseBrowser();
    const [{ data: todos }, { data }] = await Promise.all([
      supabase.from('perfis').select('id, nome'),
      supabase.from('lancamentos').select('*').eq('status', 'pendente').order('criado_em', { ascending: true }),
    ]);
    setNomes(Object.fromEntries((todos ?? []).map((p) => [p.id, p.nome])));
    setPendentes(data ?? []);
  }, []);

  useEffect(() => {
    if (!perfil) return;
    carregar();
    const supabase = supabaseBrowser();
    const canal = supabase
      .channel('aprovacoes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lancamentos' }, carregar)
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [carregar, perfil]);

  return (
    <main className="max-w-lg mx-auto p-4 pb-28 space-y-4">
      <header className="pt-4">
        <h1 className="text-xl font-bold">Auditoria</h1>
        <p className="text-sm text-slate-400">
          Itens marcados pelas crianças. ✓ aceita e entra no saldo · ✕ retira (fica registrado como rejeitado).
        </p>
      </header>
      {!carregando && perfil && !souResponsavel && (
        <p className="text-sm text-slate-400">Apenas responsáveis podem aprovar.</p>
      )}
      {pendentes.length === 0 && <p className="text-sm text-slate-500">Nada pendente.</p>}
      <PendentesLista pendentes={pendentes} nomes={nomes} perfil={perfil} onMudou={carregar} />
    </main>
  );
}
