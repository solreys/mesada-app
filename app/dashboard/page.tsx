'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import type { Perfil, Saldo, Lancamento } from '@/lib/types';
import SaldoCard from '@/components/SaldoCard';
import ExtratoTable from '@/components/ExtratoTable';
import GraficoEvolucao from '@/components/GraficoEvolucao';
import RankingCard from '@/components/RankingCard';
import {
  CORES_CRIANCA,
  SALDO_INICIAL_MES,
  intervaloMes,
  mesAtual,
  nomeMes,
  somarMes,
} from '@/lib/calculos';
import { usePerfil } from '@/lib/usePerfil';

export default function DashboardPage() {
  const { perfil } = usePerfil();
  const [criancas, setCriancas] = useState<Perfil[]>([]);
  const [saldos, setSaldos] = useState<Record<string, Saldo>>({});
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [pendentes, setPendentes] = useState(0);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [mes, setMes] = useState(mesAtual());

  const carregar = useCallback(async () => {
    const supabase = supabaseBrowser();
    const { inicio, fim } = intervaloMes(mes);
    const [{ data: perfis }, { data: saldosData }, { data: lancData }, { count }] = await Promise.all([
      supabase.from('perfis').select('*').eq('papel', 'crianca').order('nome', { ascending: false }),
      supabase.from('saldos').select('*'),
      supabase
        .from('lancamentos')
        .select('*')
        .eq('status', 'aprovado')
        .gte('criado_em', inicio)
        .lt('criado_em', fim)
        .order('criado_em', { ascending: false }),
      supabase.from('lancamentos').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
    ]);

    if (perfis) {
      setCriancas(perfis);
      setSelecionado((atual) => atual ?? perfis[0]?.id ?? null);
    }
    if (saldosData) {
      const map: Record<string, Saldo> = {};
      saldosData.forEach((s) => (map[s.crianca_id] = s));
      setSaldos(map);
    }
    if (lancData) setLancamentos(lancData);
    setPendentes(count ?? 0);
  }, [mes]);

  useEffect(() => {
    carregar();
    const supabase = supabaseBrowser();
    // Realtime: qualquer lançamento ou mudança de saldo atualiza o painel na hora,
    // em qualquer dispositivo conectado.
    const canal = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lancamentos' }, carregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saldos' }, carregar)
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [carregar]);

  const criancaAtual = criancas.find((c) => c.id === selecionado);
  const lancamentosCrianca = lancamentos.filter((l) => l.crianca_id === selecionado);
  const somaMes = (id: string) =>
    lancamentos.filter((l) => l.crianca_id === id).reduce((acc, l) => acc + Number(l.valor), 0);
  const ehMesAtual = mes === mesAtual();

  // Evolução diária: começa o mês em R$ 120 e acumula os lançamentos aprovados de cada dia.
  const porDia = new Map<string, number>();
  [...lancamentosCrianca].reverse().forEach((l) => {
    const dia = new Date(l.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    porDia.set(dia, (porDia.get(dia) ?? 0) + Number(l.valor));
  });
  const [ano, m] = mes.split('-');
  const pontosGrafico = [{ data: `01/${m}`, saldo: SALDO_INICIAL_MES }];
  porDia.forEach((valor, dia) => {
    const ultimo = pontosGrafico[pontosGrafico.length - 1];
    const saldo = Number((ultimo.saldo + valor).toFixed(2));
    if (ultimo.data === dia) ultimo.saldo = saldo;
    else pontosGrafico.push({ data: dia, saldo });
  });

  return (
    <main className="max-w-3xl mx-auto p-4 pb-28 space-y-5">
      <header className="pt-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mesada Zon &amp; Ettore</h1>
          <p className="text-sm text-slate-400">
            {perfil ? `Olá, ${perfil.nome}` : 'Somente leitura — entre para lançar'}
          </p>
        </div>
      </header>

      {pendentes > 0 && (
        <a
          href={perfil?.papel === 'responsavel' ? '/aprovacoes' : '/lancamento'}
          className="block rounded-xl bg-amber-900/40 border border-amber-700 px-4 py-3 text-sm text-amber-200"
        >
          {pendentes} lançamento(s) aguardando aprovação
          {perfil?.papel === 'responsavel' ? ' — toque para revisar →' : ''}
        </a>
      )}

      <div className="grid grid-cols-2 gap-3">
        {criancas.map((c) => {
          const s = saldos[c.id];
          return (
            <button
              key={c.id}
              onClick={() => setSelecionado(c.id)}
              className={`text-left rounded-2xl ${selecionado === c.id ? 'ring-2 ring-blue-500' : ''}`}
            >
              <SaldoCard
                nome={c.nome}
                saldoMes={Number(s?.saldo_mes ?? 0)}
                saldoPoupanca={Number(s?.saldo_poupanca ?? 0)}
                corAccent={CORES_CRIANCA[c.nome] ?? '#64748b'}
              />
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded-xl bg-slate-900 border border-slate-800 px-2 py-1">
        <button onClick={() => setMes(somarMes(mes, -1))} className="px-3 py-2 text-slate-300" aria-label="Mês anterior">
          ‹
        </button>
        <span className="font-semibold">{nomeMes(mes)}</span>
        <button
          onClick={() => setMes(somarMes(mes, 1))}
          disabled={ehMesAtual}
          className="px-3 py-2 text-slate-300 disabled:opacity-20"
          aria-label="Próximo mês"
        >
          ›
        </button>
      </div>

      <RankingCard
        titulo={`Ranking — ${nomeMes(mes)}`}
        itens={criancas.map((c) => ({
          nome: c.nome,
          resultado: SALDO_INICIAL_MES + somaMes(c.id),
          movimento: somaMes(c.id),
          cor: CORES_CRIANCA[c.nome] ?? '#64748b',
        }))}
      />

      {criancaAtual && (
        <section className="rounded-2xl bg-slate-900 p-5 shadow-lg border border-slate-800">
          <h3 className="text-sm uppercase tracking-wide text-slate-400 mb-3">
            Evolução do mês — {criancaAtual.nome}
          </h3>
          <GraficoEvolucao
            pontos={pontosGrafico}
            cor={CORES_CRIANCA[criancaAtual.nome] ?? '#2563eb'}
            referencia={SALDO_INICIAL_MES}
          />
          <p className="mt-1 text-xs text-slate-500">
            Começa em R$ {SALDO_INICIAL_MES},00 no dia 1º/{m}/{ano}. Não inclui poupança.
          </p>
        </section>
      )}

      <section className="rounded-2xl bg-slate-900 p-5 shadow-lg border border-slate-800">
        <h3 className="text-sm uppercase tracking-wide text-slate-400 mb-3">
          Extrato — {criancaAtual?.nome ?? ''} · {lancamentosCrianca.length} lançamento(s)
        </h3>
        <ExtratoTable lancamentos={lancamentosCrianca} />
      </section>
    </main>
  );
}
