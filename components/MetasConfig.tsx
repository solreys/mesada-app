'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import type { ItemRegra, Meta, Perfil, TipoMeta } from '@/lib/types';
import { AREAS, formatarReal, lerValor } from '@/lib/calculos';
import { alvoMeta, textoRegra } from '@/lib/metas';

// Cadastro de metas mensais (só responsáveis). Bônus é pago no fechamento do mês se a meta for cumprida.
export default function MetasConfig({ itens, perfil }: { itens: ItemRegra[]; perfil: Perfil }) {
  const [metas, setMetas] = useState<Meta[]>([]);
  const [criancas, setCriancas] = useState<Perfil[]>([]);
  const [para, setPara] = useState<string>('');
  const [alvo, setAlvo] = useState<'item' | 'area'>('item');
  const [itemId, setItemId] = useState('');
  const [area, setArea] = useState(AREAS[0]);
  const [tipoArea, setTipoArea] = useState<TipoMeta>('maximo');
  const [limite, setLimite] = useState('');
  const [bonus, setBonus] = useState('');
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);

  async function carregar() {
    const supabase = supabaseBrowser();
    const [m, p] = await Promise.all([
      supabase.from('metas').select('*').order('criado_em'),
      supabase.from('perfis').select('*').eq('papel', 'crianca').order('nome', { ascending: false }),
    ]);
    setMetas(m.data ?? []);
    setCriancas(p.data ?? []);
  }

  useEffect(() => {
    carregar();
  }, []);

  const mapaItens = new Map(itens.map((i) => [i.id, i]));
  const ativos = itens.filter((i) => i.ativo);
  const itemSel = mapaItens.get(itemId);
  // Item de punição: "no máximo"; item de bônus: "pelo menos". Área: escolhe.
  const tipo: TipoMeta = alvo === 'item' ? (itemSel && Number(itemSel.valor) > 0 ? 'minimo' : 'maximo') : tipoArea;
  const nomeCrianca = (id: string | null) => (id ? criancas.find((c) => c.id === id)?.nome ?? '—' : 'Os dois');

  async function adicionar() {
    const lim = Number(limite);
    const b = lerValor(bonus);
    if (alvo === 'item' && !itemId) return setMsg({ texto: 'Escolha o item.', erro: true });
    if (!Number.isInteger(lim) || lim < 0) return setMsg({ texto: 'Limite precisa ser um número inteiro (0 ou mais).', erro: true });
    if (isNaN(b) || b < 0) return setMsg({ texto: 'Informe o bônus em R$ (ex.: 5,00).', erro: true });
    const { error } = await supabaseBrowser()
      .from('metas')
      .insert({
        crianca_id: para || null,
        item_id: alvo === 'item' ? itemId : null,
        area: alvo === 'area' ? area : null,
        tipo,
        limite: lim,
        bonus: b,
        criado_por: perfil.id,
      });
    if (error) return setMsg({ texto: 'Erro ao salvar a meta.', erro: true });
    setLimite('');
    setBonus('');
    setMsg({ texto: 'Meta criada. Vale a partir do mês atual.' });
    carregar();
  }

  async function alternar(m: Meta) {
    await supabaseBrowser().from('metas').update({ ativo: !m.ativo }).eq('id', m.id);
    carregar();
  }

  async function excluir(m: Meta) {
    if (!window.confirm('Excluir esta meta? Os resultados dos meses já fechados continuam no histórico.')) return;
    await supabaseBrowser().from('metas').delete().eq('id', m.id);
    carregar();
  }

  return (
    <section className="rounded-2xl bg-slate-900 p-4 border border-slate-800 space-y-3">
      <h3 className="text-sm uppercase tracking-wide text-slate-400">Metas do mês</h3>
      <p className="text-xs text-slate-500">
        Valem todo mês. No fechamento, cada meta cumprida soma o bônus ao resultado do mês. Estorno desconta da contagem.
      </p>

      {metas.length === 0 && <p className="text-sm text-slate-500">Nenhuma meta ainda.</p>}
      <ul className="divide-y divide-slate-800">
        {metas.map((m) => {
          const a = alvoMeta(m, mapaItens);
          return (
            <li key={m.id} className={`flex items-center gap-2 py-2 ${m.ativo ? '' : 'opacity-40'}`}>
              <div className="flex-1 min-w-0 text-sm leading-snug">
                {a.icone && <span className="mr-1">{a.icone}</span>}
                {a.texto}
                <span className="block text-xs text-slate-400">
                  {nomeCrianca(m.crianca_id)} · {textoRegra(m)} → <span className="text-emerald-400">+{formatarReal(Number(m.bonus))}</span>
                </span>
              </div>
              <label className="flex items-center gap-1 text-[11px] text-slate-400">
                <input type="checkbox" checked={m.ativo} onChange={() => alternar(m)} className="accent-blue-600" />
                ativa
              </label>
              <button onClick={() => excluir(m)} aria-label="Excluir meta" className="h-8 w-8 rounded-full bg-slate-800 text-sm">
                ✕
              </button>
            </li>
          );
        })}
      </ul>

      <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-2">
        <p className="text-xs font-semibold text-slate-400">Nova meta</p>
        <div className="flex gap-1 rounded-lg bg-slate-800 p-1 text-xs">
          {[{ id: '', nome: 'Os dois' }, ...criancas].map((c) => (
            <button
              key={c.id}
              onClick={() => setPara(c.id)}
              className={`flex-1 rounded-md py-1.5 font-semibold ${para === c.id ? 'bg-blue-600' : 'text-slate-300'}`}
            >
              {c.nome}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-800 p-1 text-xs">
          {(['item', 'area'] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAlvo(a)}
              className={`flex-1 rounded-md py-1.5 font-semibold ${alvo === a ? 'bg-slate-600' : 'text-slate-300'}`}
            >
              {a === 'item' ? 'Um item' : 'Uma área inteira'}
            </button>
          ))}
        </div>
        {alvo === 'item' ? (
          <select
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            className="w-full rounded-lg bg-slate-800 px-2 py-2 text-sm outline-none"
          >
            <option value="">Escolha o item…</option>
            <optgroup label="Punições (no máximo N vezes)">
              {ativos.filter((i) => Number(i.valor) < 0).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.icone ? `${i.icone} ` : ''}
                  {i.descricao}
                </option>
              ))}
            </optgroup>
            <optgroup label="Bônus (pelo menos N vezes)">
              {ativos.filter((i) => Number(i.valor) > 0).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.icone ? `${i.icone} ` : ''}
                  {i.descricao}
                </option>
              ))}
            </optgroup>
          </select>
        ) : (
          <div className="flex gap-2">
            <select value={area} onChange={(e) => setArea(e.target.value)} className="flex-1 rounded-lg bg-slate-800 px-2 py-2 text-sm outline-none">
              {AREAS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
            <select
              value={tipoArea}
              onChange={(e) => setTipoArea(e.target.value as TipoMeta)}
              className="rounded-lg bg-slate-800 px-2 py-2 text-sm outline-none"
            >
              <option value="maximo">punições no máximo</option>
              <option value="minimo">bônus pelo menos</option>
            </select>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-400 whitespace-nowrap">{tipo === 'maximo' ? 'No máximo' : 'Pelo menos'}</span>
          <input
            value={limite}
            onChange={(e) => setLimite(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="2"
            className="w-14 rounded-lg bg-slate-800 px-2 py-2 text-center outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-slate-400 whitespace-nowrap">vezes →</span>
          <input
            value={bonus}
            onChange={(e) => setBonus(e.target.value)}
            inputMode="decimal"
            placeholder="R$ 5,00"
            className="w-full min-w-0 rounded-lg bg-slate-800 px-2 py-2 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button onClick={adicionar} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold">
          Criar meta
        </button>
        {msg && <p className={`text-xs ${msg.erro ? 'text-red-400' : 'text-emerald-400'}`}>{msg.texto}</p>}
      </div>
    </section>
  );
}
