'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import type { Perfil, Saldo, Lancamento, Fechamento, ItemRegra, Meta, ObjetivoPoupanca } from '@/lib/types';
import SaldoCard from '@/components/SaldoCard';
import ExtratoTable from '@/components/ExtratoTable';
import GraficoEvolucao from '@/components/GraficoEvolucao';
import RankingCard from '@/components/RankingCard';
import PendentesLista from '@/components/PendentesLista';
import MetasCard from '@/components/MetasCard';
import ObjetivoCard from '@/components/ObjetivoCard';
import CalendarioMes from '@/components/CalendarioMes';
import { progresso } from '@/lib/metas';
import {
  CORES_CRIANCA,
  SALDO_INICIAL_MES,
  formatarReal,
  intervaloMes,
  mesAtual,
  nomeMes,
  primeiroDia,
  somarMes,
} from '@/lib/calculos';
import { usePerfil } from '@/lib/usePerfil';

interface LinhaRanking {
  crianca_id: string;
  nome: string;
  movimento: number;
}

export default function DashboardPage() {
  const { perfil } = usePerfil(true);
  const [criancas, setCriancas] = useState<Perfil[]>([]);
  const [saldos, setSaldos] = useState<Record<string, Saldo>>({});
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [pendentes, setPendentes] = useState<Lancamento[]>([]);
  const [ranking, setRanking] = useState<LinhaRanking[]>([]);
  const [fechamentos, setFechamentos] = useState<Record<string, Fechamento>>({});
  const [anteriorFechado, setAnteriorFechado] = useState(true);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [itens, setItens] = useState<ItemRegra[]>([]);
  const [objetivos, setObjetivos] = useState<Record<string, ObjetivoPoupanca>>({});
  const [fechHist, setFechHist] = useState<Fechamento[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [mes, setMes] = useState(mesAtual());
  const [diaSel, setDiaSel] = useState<number | null>(null);

  // Ao trocar de mês ou de criança, limpa o filtro de dia do calendário.
  useEffect(() => setDiaSel(null), [mes, selecionado]);

  const souCrianca = perfil?.papel === 'crianca';
  const souResponsavel = perfil?.papel === 'responsavel';

  const carregar = useCallback(async () => {
    if (!perfil) return;
    const supabase = supabaseBrowser();
    const { inicio, fim } = intervaloMes(mes);
    const anterior = primeiroDia(somarMes(mesAtual(), -1));
    // O banco (RLS) já devolve só os dados da própria criança quando ela está logada.
    const [perfis, saldosData, lancData, pendData, rank, fech, fechAnt, metasData, itensData, objData, histData] = await Promise.all([
      supabase.from('perfis').select('*').eq('papel', 'crianca').order('nome', { ascending: false }),
      supabase.from('saldos').select('*'),
      supabase
        .from('lancamentos')
        .select('*')
        .eq('status', 'aprovado')
        .gte('criado_em', inicio)
        .lt('criado_em', fim)
        .order('criado_em', { ascending: false }),
      supabase.from('lancamentos').select('*').eq('status', 'pendente').order('criado_em', { ascending: true }),
      supabase.rpc('ranking_mes', { p_mes: primeiroDia(mes) }),
      supabase.from('fechamentos_mensais').select('*').eq('mes_referencia', primeiroDia(mes)),
      supabase.from('fechamentos_mensais').select('id', { count: 'exact', head: true }).eq('mes_referencia', anterior),
      supabase.from('metas').select('*').eq('ativo', true),
      supabase.from('itens_regras').select('*'),
      supabase.from('objetivos_poupanca').select('*').eq('ativo', true),
      supabase.from('fechamentos_mensais').select('*').order('mes_referencia', { ascending: false }).limit(12),
    ]);
    setObjetivos(Object.fromEntries((objData.data ?? []).map((o) => [o.crianca_id, o])));
    setFechHist(histData.data ?? []);
    if (metasData.data) setMetas(metasData.data);
    if (itensData.data) setItens(itensData.data);

    if (perfis.data) {
      const visiveis = perfil.papel === 'crianca' ? perfis.data.filter((p) => p.id === perfil.id) : perfis.data;
      setCriancas(perfis.data);
      setSelecionado((atual) => (perfil.papel === 'crianca' ? perfil.id : atual ?? visiveis[0]?.id ?? null));
    }
    if (saldosData.data) {
      const map: Record<string, Saldo> = {};
      saldosData.data.forEach((s) => (map[s.crianca_id] = s));
      setSaldos(map);
    }
    if (lancData.data) setLancamentos(lancData.data);
    if (pendData.data) setPendentes(pendData.data);
    if (rank.data) setRanking(rank.data as LinhaRanking[]);
    if (fech.data) {
      const map: Record<string, Fechamento> = {};
      fech.data.forEach((f) => (map[f.crianca_id] = f));
      setFechamentos(map);
    }
    setAnteriorFechado((fechAnt.count ?? 0) > 0);
  }, [mes, perfil]);

  useEffect(() => {
    if (!perfil) return;
    carregar();
    const supabase = supabaseBrowser();
    // Realtime: lançamentos, saldos e fechamentos atualizam o painel na hora em todos os aparelhos.
    const canal = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lancamentos' }, carregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saldos' }, carregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fechamentos_mensais' }, carregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'metas' }, carregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'objetivos_poupanca' }, carregar)
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [carregar, perfil]);

  if (!perfil) {
    return <main className="max-w-3xl mx-auto p-4 pt-8 text-slate-400">Carregando…</main>;
  }

  const nomes = Object.fromEntries(criancas.map((c) => [c.id, c.nome]));
  const cartoes = souCrianca ? criancas.filter((c) => c.id === perfil.id) : criancas;
  const criancaAtual = criancas.find((c) => c.id === selecionado);
  const lancamentosCrianca = lancamentos.filter((l) => l.crianca_id === selecionado);
  const somaMes = (id: string) =>
    lancamentos.filter((l) => l.crianca_id === id).reduce((acc, l) => acc + Number(l.valor), 0);
  const ehMesAtual = mes === mesAtual();
  const extrato = diaSel
    ? lancamentosCrianca.filter((l) => new Date(l.ocorrido_em ?? l.criado_em).getDate() === diaSel)
    : lancamentosCrianca;
  // Quanto entrou na poupança por mês, em média, nos últimos 3 fechamentos (sobra/desconto + rendimento).
  const ritmoPoupanca = (id: string): number | null => {
    const ult = fechHist.filter((f) => f.crianca_id === id).slice(0, 3);
    if (ult.length === 0) return null;
    return ult.reduce((a, f) => a + Number(f.valor_para_poupanca) + Number(f.rendimento), 0) / ult.length;
  };
  const mesAnterior = somarMes(mesAtual(), -1);

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
      <header className="pt-4">
        <h1 className="text-2xl font-bold">{souCrianca ? `Mesada do ${perfil.nome}` : 'Mesada Zon & Ettore'}</h1>
        <p className="text-sm text-slate-400">
          Olá, {perfil.nome} ·{' '}
          <a href="/ajuda" className="underline">
            como funciona
          </a>
        </p>
      </header>

      {souResponsavel && !anteriorFechado && (
        <a
          href="/fechamento"
          className="block rounded-xl bg-blue-950/60 border border-blue-800 px-4 py-3 text-sm text-blue-200"
        >
          {nomeMes(mesAnterior)} ainda não foi fechado — toque para fechar →
        </a>
      )}

      <PendentesLista pendentes={pendentes} nomes={nomes} perfil={perfil} onMudou={carregar} />

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

      <div className={`grid gap-3 ${cartoes.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {cartoes.map((c) => {
          const f = fechamentos[c.id];
          return (
            <button
              key={c.id}
              onClick={() => setSelecionado(c.id)}
              className={`text-left rounded-2xl ${selecionado === c.id && cartoes.length > 1 ? 'ring-2 ring-blue-500' : ''}`}
            >
              <SaldoCard
                nome={c.nome}
                rotuloMes={ehMesAtual ? 'Mesada do mês' : `Resultado de ${nomeMes(mes).split(' ')[0].toLowerCase()}`}
                saldoMes={f ? Number(f.saldo_final) : SALDO_INICIAL_MES + somaMes(c.id)}
                rotuloPoupanca={f ? 'Poupança no fechamento' : 'Poupança hoje (rende CDI)'}
                saldoPoupanca={Number(f ? f.poupanca_depois : saldos[c.id]?.saldo_poupanca ?? 0)}
                rodape={
                  f
                    ? f.destino === 'pago'
                      ? `Fechado · ${formatarReal(Number(f.saldo_final))} pago`
                      : `Fechado · ${formatarReal(Number(f.valor_para_poupanca))} na poupança`
                    : !ehMesAtual
                      ? 'Mês ainda não fechado'
                      : undefined
                }
                corAccent={CORES_CRIANCA[c.nome] ?? '#64748b'}
                mostrarBarra={ehMesAtual && !f}
              />
            </button>
          );
        })}
      </div>

      <RankingCard
        titulo={`Ranking — ${nomeMes(mes)}`}
        itens={ranking.map((r) => ({
          nome: r.nome,
          resultado: SALDO_INICIAL_MES + Number(r.movimento),
          movimento: Number(r.movimento),
          cor: CORES_CRIANCA[r.nome] ?? '#64748b',
        }))}
      />

      {criancaAtual && (
        <ObjetivoCard
          criancaId={criancaAtual.id}
          nome={criancaAtual.nome}
          objetivo={objetivos[criancaAtual.id] ?? null}
          poupanca={Number(saldos[criancaAtual.id]?.saldo_poupanca ?? 0)}
          ritmoMensal={ritmoPoupanca(criancaAtual.id)}
          podeEditar={souResponsavel || perfil.id === criancaAtual.id}
          onMudou={carregar}
        />
      )}

      {criancaAtual && !fechamentos[criancaAtual.id] && (
        <MetasCard
          nome={criancaAtual.nome}
          lista={progresso(metas, lancamentos, new Map(itens.map((i) => [i.id, i])), criancaAtual.id, mes)}
        />
      )}

      {Object.keys(fechamentos).length > 0 && (
        <a
          href={`/relatorio?mes=${mes}`}
          className="block rounded-xl bg-slate-900 border border-slate-800 px-4 py-3 text-sm text-blue-300"
        >
          📄 Ver relatório de {nomeMes(mes)} →
        </a>
      )}

      {criancaAtual && (
        <CalendarioMes mes={mes} lancamentos={lancamentosCrianca} selecionado={diaSel} onSelecionar={setDiaSel} />
      )}

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
          Extrato — {criancaAtual?.nome ?? ''}
          {diaSel ? ` · dia ${String(diaSel).padStart(2, '0')}/${m}` : ''} · {extrato.length} lançamento(s)
        </h3>
        {diaSel && (
          <button onClick={() => setDiaSel(null)} className="mb-2 rounded-lg bg-slate-800 px-3 py-1 text-xs">
            Ver o mês todo ✕
          </button>
        )}
        <ExtratoTable lancamentos={extrato} />
      </section>
    </main>
  );
}
