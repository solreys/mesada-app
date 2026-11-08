'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import type { Fechamento, ItemRegra, Lancamento, Meta, Perfil, Saldo } from '@/lib/types';
import { progresso } from '@/lib/metas';
import {
  pctCdi,
  primeiroMesFechamento,
  valorMesada,
  formatarReal,
  intervaloMes,
  lerValor,
  mesAtual,
  nomeMes,
  primeiroDia,
  somarMes,
} from '@/lib/calculos';
import { usePerfil } from '@/lib/usePerfil';

type Destino = 'poupanca' | 'pago';

const ROTULO_DESTINO: Record<string, string> = {
  poupanca: 'guardado na poupança',
  pago: 'pago em dinheiro',
  debito_poupanca: 'descontado da poupança',
};

export default function FechamentoPage() {
  const { perfil } = usePerfil(true);
  const souResponsavel = perfil?.papel === 'responsavel';
  const [mes, setMes] = useState(somarMes(mesAtual(), -1));
  const [criancas, setCriancas] = useState<Perfil[]>([]);
  const [saldos, setSaldos] = useState<Record<string, Saldo>>({});
  const [lancs, setLancs] = useState<Lancamento[]>([]);
  const [historico, setHistorico] = useState<Fechamento[]>([]);
  const [cdi, setCdi] = useState('');
  const [rendimentoJaAplicado, setRendimentoJaAplicado] = useState(false);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [itens, setItens] = useState<ItemRegra[]>([]);
  const [destinos, setDestinos] = useState<Record<string, Destino>>({});
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ texto: string; erro?: boolean } | null>(null);

  const proximo = primeiroDia(somarMes(mes, 1));

  const carregar = useCallback(async () => {
    const supabase = supabaseBrowser();
    const { inicio, fim } = intervaloMes(mes);
    const [p, s, l, h, cfg, rend, mt, it] = await Promise.all([
      supabase.from('perfis').select('*').eq('papel', 'crianca').order('nome', { ascending: false }),
      supabase.from('saldos').select('*'),
      supabase.from('lancamentos').select('*').neq('status', 'rejeitado').gte('criado_em', inicio).lt('criado_em', fim),
      supabase.from('fechamentos_mensais').select('*').order('mes_referencia', { ascending: false }).limit(24),
      supabase.from('config_financeira').select('*').eq('mes_referencia', proximo).maybeSingle(),
      supabase.from('rendimentos_historico').select('id', { count: 'exact', head: true }).eq('mes_referencia', proximo),
      supabase.from('metas').select('*').eq('ativo', true),
      supabase.from('itens_regras').select('*'),
    ]);
    setMetas(mt.data ?? []);
    setItens(it.data ?? []);
    if (p.data) setCriancas(p.data);
    if (s.data) setSaldos(Object.fromEntries(s.data.map((x) => [x.crianca_id, x])));
    if (l.data) setLancs(l.data);
    if (h.data) setHistorico(h.data);
    setCdi(cfg.data ? String(cfg.data.taxa_cdi_pct).replace('.', ',') : '');
    setRendimentoJaAplicado((rend.count ?? 0) > 0);
  }, [mes, proximo]);

  useEffect(() => {
    if (perfil) carregar();
  }, [carregar, perfil]);

  const fechadosDoMes = historico.filter((f) => f.mes_referencia === primeiroDia(mes));
  const jaFechado = fechadosDoMes.length > 0;
  const pendentes = lancs.filter((l) => l.status === 'pendente');
  const taxa = lerValor(cdi);
  const taxaOk = !isNaN(taxa) && taxa >= 0 && taxa <= 5;

  const previa = criancas.map((c) => {
    const aprovados = lancs.filter((l) => l.crianca_id === c.id && l.status === 'aprovado');
    const bonus = aprovados.filter((l) => l.valor > 0).reduce((a, l) => a + Number(l.valor), 0);
    const punicoes = aprovados.filter((l) => l.valor < 0).reduce((a, l) => a + Number(l.valor), 0);
    const metasCrianca = progresso(metas, lancs, new Map(itens.map((i) => [i.id, i])), c.id, mes);
    const bonusMetas = metasCrianca.filter((m) => m.ok).reduce((a, m) => a + Number(m.meta.bonus), 0);
    const final = valorMesada() + bonus + punicoes + bonusMetas;
    const poupanca = Number(saldos[c.id]?.saldo_poupanca ?? 0);
    const rendimento =
      !rendimentoJaAplicado && taxaOk && poupanca > 0 ? Number((poupanca * (taxa / 100) * (pctCdi() / 100)).toFixed(2)) : 0;
    const destino: Destino | 'debito_poupanca' = final < 0 ? 'debito_poupanca' : destinos[c.id] ?? 'poupanca';
    const para = destino === 'pago' ? 0 : final;
    return { c, bonus, punicoes, metasCrianca, bonusMetas, final, poupanca, rendimento, destino, depois: poupanca + rendimento + para };
  });

  async function fechar() {
    if (!taxaOk) return setMensagem({ texto: 'Informe o CDI do mês, ex.: 1,08', erro: true });
    const resumo = previa
      .map((p) => `${p.c.nome}: ${formatarReal(p.final)} ${ROTULO_DESTINO[p.destino]} → poupança ${formatarReal(p.depois)}`)
      .join('\n');
    if (!window.confirm(`Fechar ${nomeMes(mes)}?\n\n${resumo}\n\nDepois de fechado, o mês não pode ser alterado.`)) return;
    setSalvando(true);
    setMensagem(null);
    const { error } = await supabaseBrowser().rpc('fechar_mes', {
      p_mes: primeiroDia(mes),
      p_cdi_pct: taxa,
      p_destinos: destinos,
    });
    setSalvando(false);
    setMensagem(error ? { texto: error.message, erro: true } : { texto: `${nomeMes(mes)} fechado. O relatório está na lista abaixo.` });
    carregar();
  }

  const opcoesMes = [1, 2, 3].map((n) => somarMes(mesAtual(), -n)).filter((m) => m >= primeiroMesFechamento());

  return (
    <main className="max-w-lg mx-auto p-4 pb-28 space-y-5">
      <header className="pt-4">
        <h1 className="text-xl font-bold">Fechamento do mês</h1>
        <p className="text-sm text-slate-400">
          Congela o mês, aplica o CDI na poupança uma única vez e recomeça a mesada em {formatarReal(valorMesada())}.
        </p>
      </header>

      {perfil && !souResponsavel && <p className="text-sm text-slate-400">Apenas responsáveis podem fechar o mês.</p>}

      {souResponsavel && (
        <section className="rounded-2xl bg-slate-900 p-4 border border-slate-800 space-y-4">
          <div className="flex gap-2">
            {opcoesMes.map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMes(m);
                  setMensagem(null);
                }}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold ${mes === m ? 'bg-blue-600' : 'bg-slate-800 text-slate-300'}`}
              >
                {nomeMes(m).split(' ')[0]}
              </button>
            ))}
          </div>

          {jaFechado ? (
            <p className="rounded-lg bg-emerald-950/50 border border-emerald-800 px-3 py-2 text-sm text-emerald-300">
              {nomeMes(mes)} já está fechado. Veja o resumo abaixo.
            </p>
          ) : (
            <>
              {pendentes.length > 0 && (
                <a
                  href="/aprovacoes"
                  className="block rounded-lg bg-amber-950/50 border border-amber-800 px-3 py-2 text-sm text-amber-200"
                >
                  {pendentes.length} item(ns) de {nomeMes(mes)} aguardando auditoria. Resolva antes de fechar →
                </a>
              )}

              <label className="block space-y-1">
                <span className="text-sm text-slate-300">CDI de {nomeMes(mes)} (% no mês)</span>
                <input
                  value={cdi}
                  onChange={(e) => setCdi(e.target.value)}
                  disabled={rendimentoJaAplicado}
                  inputMode="decimal"
                  placeholder="Ex.: 1,08"
                  className="w-full rounded-lg bg-slate-800 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
                {rendimentoJaAplicado && (
                  <span className="block text-xs text-amber-300">
                    O rendimento deste período já foi aplicado antes (virada manual). Não será aplicado de novo.
                  </span>
                )}
              </label>

              <ul className="space-y-3">
                {previa.map((p) => (
                  <li key={p.c.id} className="rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-2 text-sm">
                    <div className="flex justify-between font-semibold">
                      <span>{p.c.nome}</span>
                      <span className={p.final < 0 ? 'text-red-400' : ''}>{formatarReal(p.final)}</span>
                    </div>
                    <p className="text-xs text-slate-400">
                      {formatarReal(valorMesada())} · bônus {formatarReal(p.bonus)} · punições {formatarReal(p.punicoes)}
                      {p.metasCrianca.length > 0 && ` · metas ${formatarReal(p.bonusMetas)}`}
                    </p>
                    {p.metasCrianca.length > 0 && (
                      <ul className="text-xs space-y-0.5">
                        {p.metasCrianca.map((m) => (
                          <li key={m.meta.id} className={m.ok ? 'text-emerald-400' : 'text-slate-500'}>
                            {m.ok ? '✓' : '✗'} {m.alvo.texto} ({m.feito}/{m.meta.limite}){m.ok ? ` +${formatarReal(Number(m.meta.bonus))}` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                    {p.destino === 'debito_poupanca' ? (
                      <p className="text-xs text-red-300">Saldo negativo: {formatarReal(p.final)} sai da poupança.</p>
                    ) : (
                      <div className="flex rounded-lg bg-slate-800 p-1">
                        {(['poupanca', 'pago'] as const).map((d) => (
                          <button
                            key={d}
                            onClick={() => setDestinos({ ...destinos, [p.c.id]: d })}
                            className={`flex-1 rounded-md py-1.5 text-xs font-semibold ${p.destino === d ? 'bg-blue-600' : 'text-slate-300'}`}
                          >
                            {d === 'poupanca' ? 'Guardar na poupança' : 'Pagar em dinheiro'}
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-slate-400">
                      Poupança {formatarReal(p.poupanca)} + rendimento {formatarReal(p.rendimento)}
                      {p.destino !== 'pago' && ` ${p.final < 0 ? '−' : '+'} ${formatarReal(Math.abs(p.final))}`} ={' '}
                      <strong className={p.depois < 0 ? 'text-red-400' : 'text-emerald-400'}>{formatarReal(p.depois)}</strong>
                    </p>
                  </li>
                ))}
              </ul>

              <button
                onClick={fechar}
                disabled={salvando || pendentes.length > 0 || !taxaOk || mes >= mesAtual()}
                className="w-full rounded-lg bg-blue-600 py-3 font-semibold disabled:opacity-40"
              >
                {salvando ? 'Fechando…' : `Fechar ${nomeMes(mes)}`}
              </button>
            </>
          )}
          {mensagem && <p className={`text-sm ${mensagem.erro ? 'text-red-400' : 'text-emerald-400'}`}>{mensagem.texto}</p>}
        </section>
      )}

      {historico.length > 0 && (
        <section className="rounded-2xl bg-slate-900 p-4 border border-slate-800">
          <h3 className="text-sm uppercase tracking-wide text-slate-400 mb-2">Meses fechados</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                  <th className="py-1 pr-2 font-normal">Mês</th>
                  <th className="py-1 pr-2 font-normal">Criança</th>
                  <th className="py-1 pr-2 font-normal text-right">Resultado</th>
                  <th className="py-1 pr-2 font-normal text-right">CDI</th>
                  <th className="py-1 font-normal text-right">Poupança</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((f) => (
                  <tr key={f.id} className="border-b border-slate-800/60">
                    <td className="py-1.5 pr-2 whitespace-nowrap">
                      <a href={`/relatorio?mes=${f.mes_referencia.slice(0, 7)}`} className="text-blue-300 underline">
                        {nomeMes(f.mes_referencia.slice(0, 7))}
                      </a>
                    </td>
                    <td className="py-1.5 pr-2">{criancas.find((c) => c.id === f.crianca_id)?.nome ?? '—'}</td>
                    <td className={`py-1.5 pr-2 text-right whitespace-nowrap ${f.saldo_final < 0 ? 'text-red-400' : ''}`}>
                      {formatarReal(Number(f.saldo_final))}
                      <span className="block text-[10px] text-slate-500">{ROTULO_DESTINO[f.destino]}</span>
                    </td>
                    <td className="py-1.5 pr-2 text-right text-emerald-400 whitespace-nowrap">+{formatarReal(Number(f.rendimento))}</td>
                    <td className="py-1.5 text-right whitespace-nowrap">{formatarReal(Number(f.poupanca_depois))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
