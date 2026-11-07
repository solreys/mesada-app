'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import type { Fechamento, ItemRegra, Lancamento, Meta, MetaResultado, Perfil } from '@/lib/types';
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
import { contarPorItem, diasSemPunicao, tendencias, type Lanc } from '@/lib/analise';
import { progresso } from '@/lib/metas';
import { usePerfil } from '@/lib/usePerfil';

type L = Lanc & Pick<Lancamento, 'status'>;

const ROTULO_DESTINO: Record<string, string> = {
  poupanca: 'guardado na poupança',
  pago: 'pago em dinheiro',
  debito_poupanca: 'descontado da poupança',
};

export default function RelatorioPage() {
  const { perfil } = usePerfil(true);
  const [mes, setMes] = useState(somarMes(mesAtual(), -1));
  const [criancas, setCriancas] = useState<Perfil[]>([]);
  const [lancs, setLancs] = useState<L[]>([]);
  const [lancsAnt, setLancsAnt] = useState<L[]>([]);
  const [itens, setItens] = useState<ItemRegra[]>([]);
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([]);
  const [resultados, setResultados] = useState<MetaResultado[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [copiado, setCopiado] = useState(false);

  // Mês vem da URL (?mes=AAAA-MM); padrão: mês anterior.
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get('mes');
    if (m && /^\d{4}-\d{2}$/.test(m)) setMes(m);
  }, []);

  useEffect(() => {
    if (!perfil) return;
    const supabase = supabaseBrowser();
    const atual = intervaloMes(mes);
    const ant = intervaloMes(somarMes(mes, -1));
    const campos = 'crianca_id, item_id, descricao, valor, criado_em, status';
    (async () => {
      const [p, l, la, i, f, r, mt] = await Promise.all([
        supabase.from('perfis').select('*').eq('papel', 'crianca').order('nome', { ascending: false }),
        supabase.from('lancamentos').select(campos).eq('status', 'aprovado').gte('criado_em', atual.inicio).lt('criado_em', atual.fim).limit(5000),
        supabase.from('lancamentos').select(campos).eq('status', 'aprovado').gte('criado_em', ant.inicio).lt('criado_em', ant.fim).limit(5000),
        supabase.from('itens_regras').select('*'),
        supabase.from('fechamentos_mensais').select('*').eq('mes_referencia', primeiroDia(mes)),
        supabase.from('metas_resultados').select('*').eq('mes_referencia', primeiroDia(mes)),
        supabase.from('metas').select('*').eq('ativo', true),
      ]);
      const todas = p.data ?? [];
      setCriancas(perfil.papel === 'crianca' ? todas.filter((c) => c.id === perfil.id) : todas);
      setLancs((l.data ?? []) as L[]);
      setLancsAnt((la.data ?? []) as L[]);
      setItens(i.data ?? []);
      setFechamentos(f.data ?? []);
      setResultados(r.data ?? []);
      setMetas(mt.data ?? []);
    })();
  }, [perfil, mes]);

  const mapaItens = new Map(itens.map((i) => [i.id, i]));
  const { inicio, fim } = intervaloMes(mes);
  const fimEfetivo = Math.min(new Date(fim).getTime(), Date.now());

  const relatorios = criancas.map((c) => {
    const meus = lancs.filter((l) => l.crianca_id === c.id);
    const atual = contarPorItem(meus, mapaItens);
    const anterior = contarPorItem(lancsAnt.filter((l) => l.crianca_id === c.id), mapaItens);
    const lista = Array.from(atual.values()).filter((x) => x.qtd > 0);
    const topPun = lista.filter((x) => x.negativo).sort((a, b) => b.qtd - a.qtd).slice(0, 3);
    const topBon = lista.filter((x) => !x.negativo).sort((a, b) => b.qtd - a.qtd).slice(0, 3);
    const tend = tendencias(atual, anterior);
    const melhoras = tend.filter((t) => t.melhora > 0).sort((a, b) => b.melhora - a.melhora).slice(0, 3);
    const pioras = tend.filter((t) => t.melhora < 0).sort((a, b) => a.melhora - b.melhora).slice(0, 3);
    const livres = diasSemPunicao(meus, mapaItens, new Date(inicio).getTime(), fimEfetivo);
    const f = fechamentos.find((x) => x.crianca_id === c.id);
    const bonus = meus.filter((l) => l.valor > 0).reduce((a, l) => a + Number(l.valor), 0);
    const punicoes = meus.filter((l) => l.valor < 0).reduce((a, l) => a + Number(l.valor), 0);
    // Metas: foto do fechamento; se o mês não fechou, prévia com as metas ativas.
    const metasFoto = resultados.filter((r) => r.crianca_id === c.id);
    const metasLista = f
      ? metasFoto.map((r) => ({ texto: r.descricao, feito: r.realizado, ok: r.cumprida, bonus: Number(r.bonus) }))
      : progresso(metas, meus, mapaItens, c.id, mes).map((p) => ({
          texto: `${p.alvo.texto} ${p.meta.tipo === 'maximo' ? '≤' : '≥'} ${p.meta.limite}×`,
          feito: p.feito,
          ok: p.ok,
          bonus: p.ok ? Number(p.meta.bonus) : 0,
        }));
    const bonusMetas = f ? Number(f.bonus_metas ?? 0) : metasLista.reduce((a, m) => a + m.bonus, 0);
    const final = f ? Number(f.saldo_final) : SALDO_INICIAL_MES + bonus + punicoes + bonusMetas;
    return { c, f, bonus, punicoes, bonusMetas, final, topPun, topBon, melhoras, pioras, livres, metasLista };
  });

  function resumoTexto(): string {
    return relatorios
      .map((r) => {
        const linhas = [
          `📄 ${nomeMes(mes)} — ${r.c.nome}`,
          `Resultado: ${formatarReal(r.final)} (${formatarReal(SALDO_INICIAL_MES)} + bônus ${formatarReal(r.bonus)} + punições ${formatarReal(r.punicoes)}${r.bonusMetas ? ` + metas ${formatarReal(r.bonusMetas)}` : ''})`,
          `Dias sem punição: ${r.livres.livres} de ${r.livres.total}`,
        ];
        if (r.topPun.length) linhas.push(`Mais punições: ${r.topPun.map((x) => `${x.nome} (${x.qtd}×)`).join(', ')}`);
        if (r.topBon.length) linhas.push(`Mais bônus: ${r.topBon.map((x) => `${x.nome} (${x.qtd}×)`).join(', ')}`);
        if (r.melhoras.length) linhas.push(`Melhorou: ${r.melhoras.map((t) => `${t.nome} ${t.antes}→${t.agora}`).join(', ')}`);
        if (r.pioras.length) linhas.push(`Piorou: ${r.pioras.map((t) => `${t.nome} ${t.antes}→${t.agora}`).join(', ')}`);
        if (r.metasLista.length) linhas.push(`Metas: ${r.metasLista.map((m) => `${m.ok ? '✓' : '✗'} ${m.texto}`).join(', ')}`);
        if (r.f) linhas.push(`Poupança: ${formatarReal(Number(r.f.poupanca_antes))} + rendimento ${formatarReal(Number(r.f.rendimento))} → ${formatarReal(Number(r.f.poupanca_depois))}`);
        return linhas.join('\n');
      })
      .join('\n\n');
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(resumoTexto());
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      window.prompt('Copie o resumo:', resumoTexto());
    }
  }

  const fechado = fechamentos.length > 0;

  return (
    <main className="max-w-2xl mx-auto p-4 pb-28 space-y-5">
      <header className="pt-4 space-y-2">
        <div className="flex items-center justify-between gap-2 print:hidden">
          <button onClick={() => setMes(somarMes(mes, -1))} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm">‹</button>
          <span className="font-semibold">{nomeMes(mes)}</span>
          <button
            onClick={() => setMes(somarMes(mes, 1))}
            disabled={mes >= mesAtual()}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm disabled:opacity-30"
          >
            ›
          </button>
        </div>
        <h1 className="text-xl font-bold">Relatório de {nomeMes(mes)}</h1>
        {!fechado && (
          <p className="text-xs text-amber-300">Prévia: o mês ainda não foi fechado, os números podem mudar.</p>
        )}
        <div className="flex gap-2 print:hidden">
          <button onClick={() => window.print()} className="flex-1 rounded-lg bg-slate-800 py-2 text-sm font-medium">
            🖨️ Imprimir / PDF
          </button>
          <button onClick={copiar} className="flex-1 rounded-lg bg-slate-800 py-2 text-sm font-medium">
            {copiado ? '✓ Copiado' : '📋 Copiar resumo'}
          </button>
        </div>
      </header>

      {relatorios.map((r) => (
        <section key={r.c.id} className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: CORES_CRIANCA[r.c.nome] ?? '#64748b' }} />
              {r.c.nome}
            </h2>
            <span className={`text-2xl font-bold ${r.final < 0 ? 'text-red-400' : 'text-slate-50'}`}>{formatarReal(r.final)}</span>
          </div>

          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-800">
              <tr><td className="py-1 text-slate-400">Mesada base</td><td className="py-1 text-right">{formatarReal(SALDO_INICIAL_MES)}</td></tr>
              <tr><td className="py-1 text-slate-400">Bônus</td><td className="py-1 text-right text-emerald-400">{formatarReal(r.bonus)}</td></tr>
              <tr><td className="py-1 text-slate-400">Punições</td><td className="py-1 text-right text-red-400">{formatarReal(r.punicoes)}</td></tr>
              {r.metasLista.length > 0 && (
                <tr><td className="py-1 text-slate-400">Bônus das metas</td><td className="py-1 text-right text-emerald-400">{formatarReal(r.bonusMetas)}</td></tr>
              )}
              <tr className="font-semibold"><td className="py-1">Resultado</td><td className="py-1 text-right">{formatarReal(r.final)}</td></tr>
              {r.f && (
                <>
                  <tr><td className="py-1 text-slate-400">Destino</td><td className="py-1 text-right">{ROTULO_DESTINO[r.f.destino]}</td></tr>
                  <tr>
                    <td className="py-1 text-slate-400">Poupança</td>
                    <td className="py-1 text-right">
                      {formatarReal(Number(r.f.poupanca_antes))} + {formatarReal(Number(r.f.rendimento))} CDI →{' '}
                      <strong className="text-emerald-400">{formatarReal(Number(r.f.poupanca_depois))}</strong>
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>

          <p className="text-sm">
            🗓️ <strong>{r.livres.livres}</strong> de {r.livres.total} dias sem punição
          </p>

          {r.metasLista.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Metas</p>
              <ul className="text-sm space-y-0.5">
                {r.metasLista.map((m) => (
                  <li key={m.texto} className={m.ok ? 'text-emerald-400' : 'text-slate-400'}>
                    {m.ok ? '✓' : '✗'} {m.texto} — fez {m.feito}×{m.ok ? ` · +${formatarReal(m.bonus)}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-red-400 mb-1">Mais punições</p>
              {r.topPun.length === 0 ? <p className="text-slate-500">Nenhuma 🎉</p> : r.topPun.map((x) => (
                <p key={x.chave} className="leading-snug">{x.icone} {x.nome} <span className="text-slate-400">{x.qtd}×</span></p>
              ))}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-emerald-400 mb-1">Mais bônus</p>
              {r.topBon.length === 0 ? <p className="text-slate-500">Nenhum</p> : r.topBon.map((x) => (
                <p key={x.chave} className="leading-snug">{x.icone} {x.nome} <span className="text-slate-400">{x.qtd}×</span></p>
              ))}
            </div>
          </div>

          {(r.melhoras.length > 0 || r.pioras.length > 0) && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-emerald-400 mb-1">▲ Melhorou vs. {nomeMes(somarMes(mes, -1)).split(' ')[0].toLowerCase()}</p>
                {r.melhoras.length === 0 ? <p className="text-slate-500">—</p> : r.melhoras.map((t) => (
                  <p key={t.chave} className="leading-snug">{t.nome} <span className="text-slate-400">{t.antes}→{t.agora}</span></p>
                ))}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-red-400 mb-1">▼ Piorou</p>
                {r.pioras.length === 0 ? <p className="text-slate-500">—</p> : r.pioras.map((t) => (
                  <p key={t.chave} className="leading-snug">{t.nome} <span className="text-slate-400">{t.antes}→{t.agora}</span></p>
                ))}
              </div>
            </div>
          )}
        </section>
      ))}
    </main>
  );
}
