'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import type { ObjetivoPoupanca } from '@/lib/types';
import { formatarReal, lerValor } from '@/lib/calculos';

const SUGESTOES_ICONE = ['🚲', '🎮', '⚽', '📱', '🎸', '🛹', '🎧', '✈️', '🧸', '🎁'];

interface Props {
  criancaId: string;
  nome: string;
  objetivo: ObjetivoPoupanca | null;
  poupanca: number;
  ritmoMensal: number | null; // média guardada por mês nos últimos fechamentos (sobra + rendimento)
  podeEditar: boolean;
  onMudou: () => void;
}

// Objetivo de poupança: a própria criança cadastra; mostra quanto falta e uma estimativa de prazo.
export default function ObjetivoCard({ criancaId, nome, objetivo, poupanca, ritmoMensal, podeEditar, onMudou }: Props) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({ nome: '', valor: '', icone: '🎁' });
  const [erro, setErro] = useState<string | null>(null);

  function abrir() {
    setForm(
      objetivo
        ? { nome: objetivo.nome, valor: String(objetivo.valor_alvo).replace('.', ','), icone: objetivo.icone ?? '🎁' }
        : { nome: '', valor: '', icone: '🎁' }
    );
    setErro(null);
    setEditando(true);
  }

  async function salvar() {
    const v = lerValor(form.valor);
    if (!form.nome.trim()) return setErro('Dê um nome ao objetivo.');
    if (isNaN(v) || v <= 0) return setErro('Informe quanto custa, ex.: 350,00');
    const supabase = supabaseBrowser();
    const dados = { nome: form.nome.trim().slice(0, 60), valor_alvo: v, icone: form.icone || null };
    const { error } = objetivo
      ? await supabase.from('objetivos_poupanca').update(dados).eq('id', objetivo.id)
      : await supabase.from('objetivos_poupanca').insert({ ...dados, crianca_id: criancaId });
    if (error) return setErro('Não foi possível salvar. Tente de novo.');
    setEditando(false);
    onMudou();
  }

  async function encerrar(conquistado: boolean) {
    if (!objetivo) return;
    const pergunta = conquistado
      ? `Marcar "${objetivo.nome}" como conquistado? (não mexe no dinheiro da poupança)`
      : `Desistir de "${objetivo.nome}" para criar outro?`;
    if (!window.confirm(pergunta)) return;
    await supabaseBrowser()
      .from('objetivos_poupanca')
      .update({ ativo: false, concluido_em: conquistado ? new Date().toISOString() : null })
      .eq('id', objetivo.id);
    onMudou();
  }

  if (editando) {
    return (
      <section className="rounded-2xl bg-slate-900 p-5 border border-slate-800 space-y-3">
        <h3 className="text-sm uppercase tracking-wide text-slate-400">
          {objetivo ? 'Editar objetivo' : 'Meu objetivo'} — {nome}
        </h3>
        <div className="flex flex-wrap gap-1">
          {SUGESTOES_ICONE.map((i) => (
            <button
              key={i}
              onClick={() => setForm({ ...form, icone: i })}
              className={`h-10 w-10 rounded-lg text-xl ${form.icone === i ? 'bg-blue-600' : 'bg-slate-800'}`}
            >
              {i}
            </button>
          ))}
        </div>
        <input
          value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })}
          placeholder="O que você quer comprar?"
          maxLength={60}
          className="w-full rounded-lg bg-slate-800 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          value={form.valor}
          onChange={(e) => setForm({ ...form, valor: e.target.value })}
          inputMode="decimal"
          placeholder="Quanto custa? (R$)"
          className="w-full rounded-lg bg-slate-800 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
        />
        {erro && <p className="text-sm text-red-400">{erro}</p>}
        <div className="flex gap-2">
          <button onClick={() => setEditando(false)} className="flex-1 rounded-lg bg-slate-800 py-2 text-sm">
            Cancelar
          </button>
          <button onClick={salvar} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold">
            Salvar
          </button>
        </div>
      </section>
    );
  }

  if (!objetivo) {
    if (!podeEditar) return null;
    return (
      <button
        onClick={abrir}
        className="w-full rounded-2xl border border-dashed border-slate-700 p-5 text-left text-sm text-slate-300"
      >
        🎯 <strong>Criar meu objetivo de poupança</strong>
        <span className="block text-xs text-slate-500">Escolha algo que você quer comprar e acompanhe quanto falta.</span>
      </button>
    );
  }

  const alvo = Number(objetivo.valor_alvo);
  const pct = Math.max(0, Math.min(100, (poupanca / alvo) * 100));
  const falta = Math.max(0, alvo - poupanca);
  const meses = falta > 0 && ritmoMensal && ritmoMensal > 0 ? Math.ceil(falta / ritmoMensal) : null;

  return (
    <section className="rounded-2xl bg-slate-900 p-5 border border-slate-800 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs uppercase tracking-wide text-slate-400">Objetivo de {nome}</h3>
          <p className="text-lg font-semibold">
            {objetivo.icone && <span className="mr-1">{objetivo.icone}</span>}
            {objetivo.nome}
          </p>
        </div>
        {podeEditar && (
          <button onClick={abrir} className="rounded-lg bg-slate-800 px-2 py-1 text-xs">
            Editar
          </button>
        )}
      </div>
      <div className="h-4 w-full rounded-full bg-slate-800 overflow-hidden">
        <div className="h-4 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-sm">
        <span>
          <strong className="text-emerald-400">{formatarReal(poupanca)}</strong>
          <span className="text-slate-400"> de {formatarReal(alvo)}</span>
        </span>
        <span className="font-semibold">{Math.floor(pct)}%</span>
      </div>
      {falta > 0 ? (
        <p className="text-sm text-slate-300">
          Faltam <strong>{formatarReal(falta)}</strong>
          {meses !== null && (
            <span className="text-slate-400">
              {' '}
              · no ritmo dos últimos meses, cerca de {meses} {meses === 1 ? 'mês' : 'meses'}
            </span>
          )}
        </p>
      ) : (
        <p className="text-sm text-emerald-300">🎉 Você já tem o suficiente! Combine a compra com seus pais.</p>
      )}
      {podeEditar && (
        <div className="flex gap-2 text-xs">
          {falta === 0 && (
            <button onClick={() => encerrar(true)} className="flex-1 rounded-lg bg-emerald-700 py-1.5 font-semibold">
              Conquistei!
            </button>
          )}
          <button onClick={() => encerrar(false)} className="flex-1 rounded-lg bg-slate-800 py-1.5 text-slate-300">
            Trocar de objetivo
          </button>
        </div>
      )}
    </section>
  );
}
