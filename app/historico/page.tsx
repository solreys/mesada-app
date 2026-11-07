'use client';

import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabaseBrowser } from '@/lib/supabase';
import type { Fechamento, ItemRegra, Lancamento, Perfil } from '@/lib/types';
import {
  CORES_CRIANCA,
  SALDO_INICIAL_MES,
  buscarTudo,
  formatarReal,
  mesAtual,
  mesCurto,
  mesDe,
  somarMes,
} from '@/lib/calculos';
import { usePerfil } from '@/lib/usePerfil';
import AbasHistorico from '@/components/AbasHistorico';

type Lanc = Pick<Lancamento, 'crianca_id' | 'item_id' | 'descricao' | 'valor' | 'criado_em'>;
type Periodo = 6 | 12 | 0; // 0 = tudo
type Filtro = 'todos' | 'punicao' | 'bonus';

const PREFIXO_ESTORNO = 'Estorno: ';

// Minigráfico de barras da quantidade por mês.
function Barrinhas({ valores, cor }: { valores: number[]; cor: string }) {
  const max = Math.max(1, ...valores.map(Math.abs));
  return (
    <svg viewBox={`0 0 ${valores.length * 6} 20`} className="h-5 w-full" preserveAspectRatio="none" aria-hidden>
      {valores.map((v, i) => {
        const h = Math.max(v === 0 ? 0 : 2, (Math.abs(v) / max) * 20);
        return <rect key={i} x={i * 6 + 1} y={20 - h} width={4} height={h} rx={1} fill={cor} opacity={v === 0 ? 0 : 0.85} />;
      })}
    </svg>
  );
}

export default function HistoricoPage() {
  const { perfil } = usePerfil(true);
  const souCrianca = perfil?.papel === 'crianca';
  const [criancas, setCriancas] = useState<Perfil[]>([]);
  const [lancs, setLancs] = useState<Lanc[]>([]);
  const [itens, setItens] = useState<ItemRegra[]>([]);
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([]);
  const [quem, setQuem] = useState<string>('todos');
  const [periodo, setPeriodo] = useState<Periodo>(6);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [verValor, setVerValor] = useState(false);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    if (!perfil) return;
    const supabase = supabaseBrowser();
    (async () => {
      const [p, i, f, l] = await Promise.all([
        supabase.from('perfis').select('*').eq('papel', 'crianca').order('nome', { ascending: false }),
        supabase.from('itens_regras').select('*'),
        supabase.from('fechamentos_mensais').select('*'),
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
      setItens(i.data ?? []);
      setFechamentos(f.data ?? []);
      setLancs(l);
      if (perfil.papel === 'crianca') setQuem(perfil.id);
      setCarregado(true);
    })();
  }, [perfil]);

  const visiveis = souCrianca ? criancas.filter((c) => c.id === perfil?.id) : criancas;
  const selecionadas = quem === 'todos' ? visiveis : visiveis.filter((c) => c.id === quem);
  const ids = new Set(selecionadas.map((c) => c.id));

  // Meses do período: do mais antigo lançamento (ou N meses atrás) até o mês atual.
  const meses = useMemo(() => {
    const atual = mesAtual();
    const primeiro = lancs.length ? mesDe(lancs[0].criado_em) : atual;
    const lista: string[] = [];
    for (let m = atual; ; m = somarMes(m, -1)) {
      lista.unshift(m);
      if (m <= primeiro || (periodo && lista.length >= periodo) || lista.length >= 60) break;
    }
    return lista;
  }, [lancs, periodo]);

  const doFiltro = lancs.filter((l) => ids.has(l.crianca_id));

  // ---------- Evolução mensal ----------
  const porMes = meses.map((m) => {
    const linha: Record<string, number | string> = { mes: mesCurto(m) };
    selecionadas.forEach((c) => {
      const soma = doFiltro
        .filter((l) => l.crianca_id === c.id && mesDe(l.criado_em) === m)
        .reduce((a, l) => a + Number(l.valor), 0);
      linha[c.nome] = Number((SALDO_INICIAL_MES + soma).toFixed(2));
    });
    return linha;
  });

  const resumoMeses = [...meses].reverse().map((m) => {
    const doMes = doFiltro.filter((l) => mesDe(l.criado_em) === m);
    const bonus = doMes.filter((l) => l.valor > 0).reduce((a, l) => a + Number(l.valor), 0);
    const punicoes = doMes.filter((l) => l.valor < 0).reduce((a, l) => a + Number(l.valor), 0);
    const fech = fechamentos.filter((f) => ids.has(f.crianca_id) && f.mes_referencia.slice(0, 7) === m);
    return {
      mes: m,
      bonus,
      punicoes,
      resultado: SALDO_INICIAL_MES * selecionadas.length + bonus + punicoes,
      poupanca: fech.length === selecionadas.length && fech.length > 0
        ? fech.reduce((a, f) => a + Number(f.poupanca_depois), 0)
        : null,
    };
  });

  // ---------- Por item ----------
  const nomeItem = new Map(itens.map((i) => [i.id, i]));
  const grupos = new Map<
    string,
    { nome: string; negativo: boolean; porMes: Map<string, { qtd: number; valor: number }>; qtd: number; valor: number }
  >();
  doFiltro.forEach((l) => {
    const estorno = l.descricao.startsWith(PREFIXO_ESTORNO);
    const desc = estorno ? l.descricao.slice(PREFIXO_ESTORNO.length) : l.descricao;
    const chave = l.item_id ?? `txt:${desc.trim().toLowerCase()}`;
    const item = l.item_id ? nomeItem.get(l.item_id) : undefined;
    if (!grupos.has(chave)) {
      const valorBase = item ? Number(item.valor) : estorno ? -Number(l.valor) : Number(l.valor);
      grupos.set(chave, { nome: item?.descricao ?? desc, negativo: valorBase < 0, porMes: new Map(), qtd: 0, valor: 0 });
    }
    const g = grupos.get(chave)!;
    const qtd = estorno ? -1 : 1;
    const m = mesDe(l.criado_em);
    const cel = g.porMes.get(m) ?? { qtd: 0, valor: 0 };
    cel.qtd += qtd;
    cel.valor += Number(l.valor);
    g.porMes.set(m, cel);
    g.qtd += qtd;
    g.valor += Number(l.valor);
  });
  const linhasItens = Array.from(grupos.entries())
    .map(([chave, g]) => ({ chave, ...g }))
    .filter((g) => g.qtd !== 0 || g.valor !== 0)
    .filter((g) => filtro === 'todos' || (filtro === 'punicao' ? g.negativo : !g.negativo))
    .map((g) => ({ ...g, noPeriodo: meses.reduce((a, m) => a + (g.porMes.get(m)?.qtd ?? 0), 0) }))
    .sort((a, b) => b.noPeriodo - a.noPeriodo || b.qtd - a.qtd);

  const fmtCel = (c?: { qtd: number; valor: number }) =>
    !c || (c.qtd === 0 && c.valor === 0) ? '·' : verValor ? formatarReal(c.valor).replace('R$', '').trim() : `${c.qtd}`;

  return (
    <main className="max-w-3xl mx-auto p-4 pb-28 space-y-5">
      <header className="pt-4 space-y-3">
        <AbasHistorico ativa="historico" />
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
          {([6, 12, 0] as Periodo[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`flex-1 rounded-md py-1.5 font-semibold ${periodo === p ? 'bg-slate-600' : 'text-slate-300'}`}
            >
              {p ? `${p} meses` : 'Tudo'}
            </button>
          ))}
        </div>
      </header>

      {!carregado && <p className="text-sm text-slate-400">Carregando…</p>}

      <section className="rounded-2xl bg-slate-900 p-5 border border-slate-800">
        <h3 className="text-sm uppercase tracking-wide text-slate-400 mb-3">Resultado de cada mês</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={porMes} margin={{ left: -10, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="mes" stroke="#64748b" fontSize={12} />
            <YAxis stroke="#64748b" fontSize={12} domain={['auto', 'auto']} />
            <ReferenceLine y={SALDO_INICIAL_MES} stroke="#475569" strokeDasharray="4 4" />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
              formatter={(v: number, nome: string) => [formatarReal(v), nome]}
            />
            {selecionadas.length > 1 && <Legend />}
            {selecionadas.map((c) => (
              <Line key={c.id} type="linear" dataKey={c.nome} stroke={CORES_CRIANCA[c.nome] ?? '#2563eb'} strokeWidth={2} dot={{ r: 3 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <p className="mt-1 text-xs text-slate-500">Linha tracejada = {formatarReal(SALDO_INICIAL_MES)} (ponto de partida).</p>

        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="py-1 pr-2 font-normal">Mês</th>
                <th className="py-1 pr-2 font-normal text-right">Bônus</th>
                <th className="py-1 pr-2 font-normal text-right">Punições</th>
                <th className="py-1 pr-2 font-normal text-right">Resultado</th>
                <th className="py-1 font-normal text-right">Poupança*</th>
              </tr>
            </thead>
            <tbody>
              {resumoMeses.map((r) => (
                <tr key={r.mes} className="border-b border-slate-800/60">
                  <td className="py-1.5 pr-2 text-slate-400">{mesCurto(r.mes)}</td>
                  <td className="py-1.5 pr-2 text-right text-emerald-400 whitespace-nowrap">{formatarReal(r.bonus)}</td>
                  <td className="py-1.5 pr-2 text-right text-red-400 whitespace-nowrap">{formatarReal(r.punicoes)}</td>
                  <td className={`py-1.5 pr-2 text-right font-semibold whitespace-nowrap ${r.resultado < 0 ? 'text-red-400' : ''}`}>
                    {formatarReal(r.resultado)}
                  </td>
                  <td className="py-1.5 text-right text-slate-300 whitespace-nowrap">{r.poupanca === null ? '—' : formatarReal(r.poupanca)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-slate-500">* Poupança registrada no fechamento do mês (— = mês não fechado).</p>
        </div>
      </section>

      <section className="rounded-2xl bg-slate-900 p-5 border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm uppercase tracking-wide text-slate-400">Por item</h3>
          <button onClick={() => setVerValor(!verValor)} className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-medium">
            Ver {verValor ? 'quantidade' : 'em R$'}
          </button>
        </div>
        <div className="flex rounded-lg bg-slate-800 p-1 text-sm">
          {(['todos', 'punicao', 'bonus'] as Filtro[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`flex-1 rounded-md py-1.5 font-semibold ${
                filtro === f ? (f === 'punicao' ? 'bg-red-600' : f === 'bonus' ? 'bg-emerald-600' : 'bg-slate-600') : 'text-slate-300'
              }`}
            >
              {f === 'todos' ? 'Todos' : f === 'punicao' ? 'Punições' : 'Bônus'}
            </button>
          ))}
        </div>

        {linhasItens.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum lançamento no filtro.</p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-800">
                  <th className="sticky left-0 bg-slate-900 py-1 px-2 text-left font-normal min-w-[10rem]">Item</th>
                  <th className="py-1 px-1 font-normal w-16">Evolução</th>
                  {meses.map((m) => (
                    <th key={m} className="py-1 px-1 font-normal text-center whitespace-nowrap">
                      {mesCurto(m)}
                    </th>
                  ))}
                  <th className="py-1 px-2 font-normal text-right whitespace-nowrap">Geral</th>
                </tr>
              </thead>
              <tbody>
                {linhasItens.map((g) => (
                  <tr key={g.chave} className="border-b border-slate-800/60">
                    <td className="sticky left-0 bg-slate-900 py-1.5 px-2 leading-snug">
                      <span className={`mr-1 ${g.negativo ? 'text-red-400' : 'text-emerald-400'}`}>{g.negativo ? '−' : '+'}</span>
                      {g.nome}
                    </td>
                    <td className="py-1.5 px-1">
                      <Barrinhas valores={meses.map((m) => g.porMes.get(m)?.qtd ?? 0)} cor={g.negativo ? '#f87171' : '#34d399'} />
                    </td>
                    {meses.map((m) => (
                      <td key={m} className="py-1.5 px-1 text-center text-slate-300 whitespace-nowrap">
                        {fmtCel(g.porMes.get(m))}
                      </td>
                    ))}
                    <td className="py-1.5 px-2 text-right whitespace-nowrap">
                      <span className="font-semibold">{g.qtd}×</span>
                      <span className={`block text-[11px] ${g.valor < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {formatarReal(g.valor)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-500">
          Quantidade de vezes em cada mês (estornos descontam). “Geral” = desde o primeiro lançamento.
        </p>
      </section>
    </main>
  );
}
