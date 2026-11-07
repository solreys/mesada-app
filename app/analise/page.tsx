'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import type { ItemRegra, Perfil } from '@/lib/types';
import { CORES_CRIANCA, SALDO_INICIAL_MES, buscarTudo, formatarReal, intervaloMes, mesAtual } from '@/lib/calculos';
import {
  DIAS_SEMANA,
  type Lanc,
  contarPorItem,
  diasSemPunicao,
  noIntervalo,
  padroes,
  projecaoMes,
  tendencias,
  totais,
} from '@/lib/analise';
import { usePerfil } from '@/lib/usePerfil';
import AbasHistorico from '@/components/AbasHistorico';

const DIA = 86_400_000;
type Janela = 14 | 30 | 60;

function Variacao({ agora, antes, inverter }: { agora: number; antes: number; inverter?: boolean }) {
  if (antes === 0 && agora === 0) return <span className="text-xs text-slate-500">igual</span>;
  const d = agora - antes;
  const bom = inverter ? d < 0 : d > 0;
  const cor = d === 0 ? 'text-slate-500' : bom ? 'text-emerald-400' : 'text-red-400';
  const pct = antes ? ` (${d > 0 ? '+' : ''}${Math.round((d / antes) * 100)}%)` : '';
  return (
    <span className={`text-xs ${cor}`}>
      {d === 0 ? 'igual' : `${d > 0 ? '▲' : '▼'} ${Math.abs(d)}${pct}`} vs. antes
    </span>
  );
}

function Barra({ valor, max, cor }: { valor: number; max: number; cor: string }) {
  return (
    <div className="h-2 w-full rounded bg-slate-800">
      <div className="h-2 rounded" style={{ width: `${max ? (valor / max) * 100 : 0}%`, backgroundColor: cor }} />
    </div>
  );
}

export default function AnalisePage() {
  const { perfil } = usePerfil(true);
  const souCrianca = perfil?.papel === 'crianca';
  const [criancas, setCriancas] = useState<Perfil[]>([]);
  const [lancs, setLancs] = useState<Lanc[]>([]);
  const [itensLista, setItensLista] = useState<ItemRegra[]>([]);
  const [quem, setQuem] = useState('todos');
  const [janela, setJanela] = useState<Janela>(30);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    if (!perfil) return;
    const supabase = supabaseBrowser();
    (async () => {
      const [p, i, l] = await Promise.all([
        supabase.from('perfis').select('*').eq('papel', 'crianca').order('nome', { ascending: false }),
        supabase.from('itens_regras').select('*'),
        buscarTudo<Lanc>((de, ate) =>
          supabase
            .from('lancamentos')
            .select('crianca_id, item_id, descricao, valor, criado_em')
            .eq('status', 'aprovado')
            .order('criado_em')
            .range(de, ate)
        ),
      ]);
      setCriancas(p.data ?? []);
      setItensLista(i.data ?? []);
      setLancs(l);
      if (perfil.papel === 'crianca') setQuem(perfil.id);
      setCarregado(true);
    })();
  }, [perfil]);

  const itens = new Map(itensLista.map((i) => [i.id, i]));
  const visiveis = souCrianca ? criancas.filter((c) => c.id === perfil?.id) : criancas;
  const selecionadas = quem === 'todos' ? visiveis : visiveis.filter((c) => c.id === quem);
  const ids = new Set(selecionadas.map((c) => c.id));
  const meus = lancs.filter((l) => ids.has(l.crianca_id));

  // Janela atual termina no fim de hoje; a anterior tem o mesmo tamanho, imediatamente antes.
  const hoje = new Date();
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1).getTime();
  const inicio = fim - janela * DIA;
  const inicioAnt = inicio - janela * DIA;
  const atual = contarPorItem(noIntervalo(meus, inicio, fim), itens);
  const anterior = contarPorItem(noIntervalo(meus, inicioAnt, inicio), itens);
  const tAtual = totais(atual.values());
  const tAnt = totais(anterior.values());
  const temHistoricoAnterior = meus.some((l) => new Date(l.criado_em).getTime() < inicio);

  const ranking = Array.from(atual.values()).filter((c) => c.qtd > 0);
  const topPun = ranking.filter((c) => c.negativo).sort((a, b) => b.qtd - a.qtd || a.valor - b.valor).slice(0, 5);
  const topBon = ranking.filter((c) => !c.negativo).sort((a, b) => b.qtd - a.qtd || b.valor - a.valor).slice(0, 5);

  const tend = tendencias(atual, anterior);
  const melhorando = tend.filter((t) => t.melhora > 0).sort((a, b) => b.melhora - a.melhora).slice(0, 5);
  const piorando = tend.filter((t) => t.melhora < 0).sort((a, b) => a.melhora - b.melhora).slice(0, 5);

  const livres = diasSemPunicao(noIntervalo(meus, inicio, fim), itens, inicio, fim);
  const pad = padroes(noIntervalo(meus, inicio, fim), itens);
  const maxSemana = Math.max(...pad.semana);
  const maxTurno = Math.max(...Object.values(pad.turno));

  const { inicio: inicioMes } = intervaloMes(mesAtual());
  const projecoes = selecionadas.map((c) => {
    const soma = lancs
      .filter((l) => l.crianca_id === c.id && l.criado_em >= inicioMes)
      .reduce((a, l) => a + Number(l.valor), 0);
    return { c, ...projecaoMes(soma, hoje, SALDO_INICIAL_MES) };
  });

  // Itens ativos sem nenhum uso nos últimos 60 dias (só para responsáveis).
  const usados60 = contarPorItem(noIntervalo(lancs, fim - 60 * DIA, fim), itens);
  const parados = itensLista.filter((i) => i.ativo && !usados60.has(i.id));

  // ---------- Sugestões (regras simples sobre os números acima) ----------
  const sugestoes: string[] = [];
  if (topPun[0]) {
    const p = topPun[0];
    const share = tAtual.punicoesQtd ? Math.round((p.qtd / tAtual.punicoesQtd) * 100) : 0;
    sugestoes.push(
      `“${p.nome}” é a punição mais frequente: ${p.qtd}× em ${janela} dias (${share}% das punições, ${formatarReal(p.valor)}). Bom ponto para uma conversa ou um combinado específico.`
    );
  }
  piorando
    .filter((t) => t.negativo && t.agora - t.antes >= 2)
    .slice(0, 2)
    .forEach((t) => sugestoes.push(`“${t.nome}” aumentou de ${t.antes} para ${t.agora} vezes em relação ao período anterior.`));
  melhorando
    .filter((t) => t.negativo)
    .slice(0, 2)
    .forEach((t) => sugestoes.push(`“${t.nome}” caiu de ${t.antes} para ${t.agora} vezes. Vale reconhecer a melhora.`));
  if (tAtual.punicoesQtd >= 4) {
    const razao = tAtual.bonusQtd ? tAtual.punicoesQtd / tAtual.bonusQtd : null;
    if (razao === null) sugestoes.push(`Nenhum bônus registrado em ${janela} dias, contra ${tAtual.punicoesQtd} punições. Registrar também os acertos equilibra o quadro.`);
    else if (razao >= 2) sugestoes.push(`Há ${razao.toFixed(1).replace('.', ',')} punições para cada bônus no período. Registrar também os acertos equilibra o quadro.`);
  }
  projecoes
    .filter((p) => p.projetado < SALDO_INICIAL_MES / 2)
    .forEach((p) =>
      sugestoes.push(
        `No ritmo atual, ${p.c.nome} termina o mês em ${formatarReal(p.projetado)}${p.projetado < 0 ? ' (negativo: desconta da poupança no fechamento)' : ''}.`
      )
    );
  if (!souCrianca && parados.length) {
    sugestoes.push(`${parados.length} item(ns) do catálogo não foram usados nos últimos 60 dias. Veja a lista abaixo e decida se mantém.`);
  }

  return (
    <main className="max-w-3xl mx-auto p-4 pb-28 space-y-5">
      <header className="pt-4 space-y-3">
        <AbasHistorico ativa="analise" />
        {!souCrianca && (
          <div className="flex gap-2">
            {[{ id: 'todos', nome: 'Os dois' }, ...visiveis].map((c) => (
              <button
                key={c.id}
                onClick={() => setQuem(c.id)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold ${quem === c.id ? 'bg-blue-600' : 'bg-slate-800 text-slate-300'}`}
              >
                {c.nome}
              </button>
            ))}
          </div>
        )}
        <div className="flex rounded-lg bg-slate-800 p-1 text-sm">
          {([14, 30, 60] as Janela[]).map((j) => (
            <button
              key={j}
              onClick={() => setJanela(j)}
              className={`flex-1 rounded-md py-1.5 font-semibold ${janela === j ? 'bg-slate-600' : 'text-slate-300'}`}
            >
              {j} dias
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Compara os últimos {janela} dias com os {janela} dias anteriores.
          {!temHistoricoAnterior && carregado && ' Ainda não há dados suficientes no período anterior para comparar.'}
        </p>
      </header>

      {!carregado && <p className="text-sm text-slate-400">Carregando…</p>}

      {/* Resumo */}
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Punições</p>
          <p className="text-2xl font-bold text-red-400">{tAtual.punicoesQtd}×</p>
          <p className="text-xs text-slate-400">{formatarReal(tAtual.punicoesValor)}</p>
          <Variacao agora={tAtual.punicoesQtd} antes={tAnt.punicoesQtd} inverter />
        </div>
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Bônus</p>
          <p className="text-2xl font-bold text-emerald-400">{tAtual.bonusQtd}×</p>
          <p className="text-xs text-slate-400">{formatarReal(tAtual.bonusValor)}</p>
          <Variacao agora={tAtual.bonusQtd} antes={tAnt.bonusQtd} />
        </div>
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Dias sem punição</p>
          <p className="text-2xl font-bold">
            {livres.livres}
            <span className="text-sm font-normal text-slate-400"> de {livres.total}</span>
          </p>
          <p className="text-xs text-slate-400">Sequência atual: {livres.sequencia} dia(s)</p>
        </div>
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Saldo do período</p>
          <p className={`text-2xl font-bold ${tAtual.punicoesValor + tAtual.bonusValor < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {formatarReal(tAtual.punicoesValor + tAtual.bonusValor)}
          </p>
          <p className="text-xs text-slate-400">antes: {formatarReal(tAnt.punicoesValor + tAnt.bonusValor)}</p>
        </div>
      </section>

      {/* Sugestões */}
      {sugestoes.length > 0 && (
        <section className="rounded-2xl bg-blue-950/40 border border-blue-900 p-5 space-y-2">
          <h3 className="text-sm uppercase tracking-wide text-blue-300">Pontos de atenção</h3>
          <ul className="space-y-2 text-sm text-slate-200 list-disc pl-5">
            {sugestoes.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="text-[11px] text-slate-500">Gerado por regras simples sobre os números desta tela.</p>
        </section>
      )}

      {/* Mais frequentes */}
      <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
        <h3 className="text-sm uppercase tracking-wide text-slate-400">O que mais acontece ({janela} dias)</h3>
        {[
          { titulo: 'Punições', lista: topPun, cor: '#f87171' },
          { titulo: 'Bônus', lista: topBon, cor: '#34d399' },
        ].map((g) => (
          <div key={g.titulo} className="space-y-2">
            <p className="text-xs font-semibold" style={{ color: g.cor }}>
              {g.titulo}
            </p>
            {g.lista.length === 0 && <p className="text-sm text-slate-500">Nenhum no período.</p>}
            {g.lista.map((c) => (
              <div key={c.chave} className="space-y-1">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="leading-snug">{c.nome}</span>
                  <span className="whitespace-nowrap font-semibold">
                    {c.qtd}× <span className="text-xs font-normal text-slate-400">{formatarReal(c.valor)}</span>
                  </span>
                </div>
                <Barra valor={c.qtd} max={g.lista[0].qtd} cor={g.cor} />
              </div>
            ))}
          </div>
        ))}
      </section>

      {/* Tendência */}
      <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
        <h3 className="text-sm uppercase tracking-wide text-slate-400">Melhorando e piorando</h3>
        {[
          { titulo: '▲ Melhorando', lista: melhorando, cor: 'text-emerald-400' },
          { titulo: '▼ Piorando', lista: piorando, cor: 'text-red-400' },
        ].map((g) => (
          <div key={g.titulo}>
            <p className={`text-xs font-semibold mb-1 ${g.cor}`}>{g.titulo}</p>
            {g.lista.length === 0 ? (
              <p className="text-sm text-slate-500">Nada relevante.</p>
            ) : (
              <ul className="divide-y divide-slate-800">
                {g.lista.map((t) => (
                  <li key={t.chave} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                    <span className="leading-snug">
                      <span className={`mr-1 ${t.negativo ? 'text-red-400' : 'text-emerald-400'}`}>{t.negativo ? '−' : '+'}</span>
                      {t.nome}
                    </span>
                    <span className="whitespace-nowrap text-slate-300">
                      {t.antes} → <strong className={g.cor}>{t.agora}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        <p className="text-[11px] text-slate-500">
          Quantidade de vezes: período anterior → atual. Punição que cai e bônus que sobe contam como melhora. Itens com menos de
          2 ocorrências ficam de fora.
        </p>
      </section>

      {/* Projeção */}
      <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
        <h3 className="text-sm uppercase tracking-wide text-slate-400">Projeção do mês</h3>
        {projecoes.map((p) => (
          <div key={p.c.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CORES_CRIANCA[p.c.nome] ?? '#64748b' }} />
              {p.c.nome}
            </span>
            <span className="text-right">
              hoje {formatarReal(p.atual)} →{' '}
              <strong className={p.projetado < 0 ? 'text-red-400' : p.projetado < SALDO_INICIAL_MES ? 'text-amber-300' : 'text-emerald-400'}>
                {formatarReal(p.projetado)}
              </strong>
            </span>
          </div>
        ))}
        <p className="text-[11px] text-slate-500">
          Mantendo o ritmo dos primeiros {projecoes[0]?.diasPassados ?? 0} dias até o dia {projecoes[0]?.diasMes ?? 0}. É estimativa, não saldo.
        </p>
      </section>

      {/* Padrões */}
      <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
        <h3 className="text-sm uppercase tracking-wide text-slate-400">Quando as punições acontecem</h3>
        <div className="flex items-end gap-2 h-28">
          {pad.semana.map((v, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
              <span className="text-[11px] text-slate-400">{v || ''}</span>
              <div className="w-full rounded-t bg-red-400/80" style={{ height: `${maxSemana ? (v / maxSemana) * 70 : 0}%` }} />
              <span className="text-[11px] text-slate-500">{DIAS_SEMANA[i]}</span>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {Object.entries(pad.turno).map(([nome, v]) => (
            <div key={nome} className="flex items-center gap-3 text-sm">
              <span className="w-14 text-slate-400">{nome}</span>
              <div className="flex-1">
                <Barra valor={v} max={maxTurno} cor="#f87171" />
              </div>
              <span className="w-6 text-right">{v}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">
          Pela data e hora em que o item foi registrado no app. Se vários itens são lançados de uma vez depois, o padrão distorce.
        </p>
      </section>

      {/* Catálogo parado */}
      {!souCrianca && parados.length > 0 && (
        <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-2">
          <h3 className="text-sm uppercase tracking-wide text-slate-400">Itens sem uso em 60 dias</h3>
          <ul className="text-sm space-y-1">
            {parados.map((i) => (
              <li key={i.id} className="flex justify-between gap-3">
                <span className="leading-snug">{i.descricao}</span>
                <span className={`whitespace-nowrap ${Number(i.valor) < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {formatarReal(Number(i.valor))}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-slate-500">
            Punição parada pode ser sinal de que o comportamento sumiu. Bônus parado pode ser oportunidade esquecida. Para tirar da
            tela de lançamento, desmarque “Ativo” em Catálogo.
          </p>
        </section>
      )}
    </main>
  );
}
