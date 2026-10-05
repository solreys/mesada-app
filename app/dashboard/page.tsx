'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import type { Perfil, Saldo, Lancamento } from '@/lib/types';
import SaldoCard from '@/components/SaldoCard';
import ExtratoTable from '@/components/ExtratoTable';
import GraficoEvolucao from '@/components/GraficoEvolucao';
import RankingCard from '@/components/RankingCard';

const CORES: Record<string, string> = { Zon: '#2563eb', Ettore: '#16a34a' };

export default function DashboardPage() {
  const [criancas, setCriancas] = useState<Perfil[]>([]);
  const [saldos, setSaldos] = useState<Record<string, Saldo>>({});
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [papel, setPapel] = useState<string | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();

    async function carregar() {
      const { data: perfis } = await supabase.from('perfis').select('*').eq('papel', 'crianca');
      const { data: saldosData } = await supabase.from('saldos').select('*');
      const { data: lancData } = await supabase
        .from('lancamentos')
        .select('*')
        .order('criado_em', { ascending: false })
        .limit(100);

      if (perfis) {
        setCriancas(perfis);
        if (!selecionado && perfis.length > 0) setSelecionado(perfis[0].id);
      }
      if (saldosData) {
        const map: Record<string, Saldo> = {};
        saldosData.forEach((s) => (map[s.crianca_id] = s));
        setSaldos(map);
      }
      if (lancData) setLancamentos(lancData);
    }

    carregar();
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { data: meu } = await supabase
          .from('perfis')
          .select('papel')
          .eq('auth_user_id', u.user.id)
          .maybeSingle();
        setPapel(meu?.papel ?? null);
      }
    })();

    // Realtime: qualquer lançamento ou mudança de saldo atualiza o dashboard na hora,
    // em qualquer dispositivo conectado.
    const canal = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lancamentos' }, carregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saldos' }, carregar)
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [selecionado]);

  const criancaAtual = criancas.find((c) => c.id === selecionado);
  const lancamentosCrianca = lancamentos.filter(
    (l) => l.crianca_id === selecionado && l.status === 'aprovado'
  );
  const pendentes = lancamentos.filter((l) => l.status === 'pendente');

  const pontosGrafico = [...lancamentosCrianca]
    .reverse()
    .reduce((acc: { data: string; saldo: number }[], l) => {
      const ultimo = acc.length > 0 ? acc[acc.length - 1].saldo : 0;
      acc.push({
        data: new Date(l.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        saldo: Number((ultimo + l.valor).toFixed(2)),
      });
      return acc;
    }, []);

  return (
    <main className="max-w-3xl mx-auto p-4 pb-24 space-y-6">
      <header className="pt-4">
        <h1 className="text-2xl font-bold">Mesada Zon &amp; Ettore</h1>
        <p className="text-sm text-slate-400">Dashboard atualizado em tempo real</p>
      </header>

      {pendentes.length > 0 && (
        <a
          href={papel === 'responsavel' ? '/aprovacoes' : '/lancamento'}
          className="block rounded-xl bg-amber-900/40 border border-amber-700 px-4 py-3 text-sm text-amber-200"
        >
          {pendentes.length} lançamento(s) aguardando aprovação
          {papel === 'responsavel' ? ' — toque para revisar →' : ''}
        </a>
      )}

      <div className="grid grid-cols-2 gap-3">
        {criancas.map((c) => {
          const s = saldos[c.id];
          return (
            <button
              key={c.id}
              onClick={() => setSelecionado(c.id)}
              className={`text-left ${selecionado === c.id ? 'ring-2 ring-blue-500 rounded-2xl' : ''}`}
            >
              <SaldoCard
                nome={c.nome}
                saldoMes={s?.saldo_mes ?? 0}
                saldoPoupanca={s?.saldo_poupanca ?? 0}
                corAccent={CORES[c.nome] ?? '#64748b'}
              />
            </button>
          );
        })}
      </div>

      <RankingCard
        itens={criancas.map((c) => ({
          nome: c.nome,
          saldoTotal: (saldos[c.id]?.saldo_mes ?? 0) + (saldos[c.id]?.saldo_poupanca ?? 0),
          cor: CORES[c.nome] ?? '#64748b',
        }))}
      />

      {criancaAtual && (
        <section className="rounded-2xl bg-slate-900 p-5 shadow-lg border border-slate-800">
          <h3 className="text-sm uppercase tracking-wide text-slate-400 mb-3">
            Evolução — {criancaAtual.nome}
          </h3>
          <GraficoEvolucao pontos={pontosGrafico} cor={CORES[criancaAtual.nome] ?? '#2563eb'} />
        </section>
      )}

      <section className="rounded-2xl bg-slate-900 p-5 shadow-lg border border-slate-800">
        <h3 className="text-sm uppercase tracking-wide text-slate-400 mb-3">
          Extrato — {criancaAtual?.nome ?? ''}
        </h3>
        <ExtratoTable lancamentos={lancamentosCrianca} />
      </section>

      <a
        href="/lancamento"
        className="fixed bottom-6 right-6 rounded-full bg-blue-600 px-6 py-3 font-semibold shadow-lg hover:bg-blue-500"
      >
        + Lançar
      </a>
    </main>
  );
}
