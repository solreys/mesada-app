'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import type { ItemRegra } from '@/lib/types';
import { formatarReal } from '@/lib/calculos';

export default function ConfigPage() {
  const [itens, setItens] = useState<ItemRegra[]>([]);
  const [taxaCdi, setTaxaCdi] = useState('');
  const [novoItem, setNovoItem] = useState({ categoria: 'punicao' as 'punicao' | 'bonus', descricao: '', valor: '' });
  const [mensagem, setMensagem] = useState<string | null>(null);

  const supabase = supabaseBrowser();

  async function carregar() {
    const { data } = await supabase.from('itens_regras').select('*').order('categoria').order('descricao');
    if (data) setItens(data);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function salvarTaxaCdi() {
    const taxa = parseFloat(taxaCdi.replace(',', '.'));
    if (isNaN(taxa)) return;
    const mesRef = new Date();
    mesRef.setDate(1);
    const { error } = await supabase.from('config_financeira').upsert({
      mes_referencia: mesRef.toISOString().slice(0, 10),
      taxa_cdi_pct: taxa,
      multiplicador: 1.0,
    });
    setMensagem(error ? 'Erro ao salvar taxa CDI.' : 'Taxa CDI do mês salva.');
  }

  async function adicionarItem() {
    if (!novoItem.descricao || !novoItem.valor) return;
    let valor = parseFloat(novoItem.valor.replace(',', '.'));
    if (novoItem.categoria === 'punicao' && valor > 0) valor = -valor;
    const { error } = await supabase.from('itens_regras').insert({
      categoria: novoItem.categoria,
      descricao: novoItem.descricao,
      valor,
    });
    if (!error) {
      setNovoItem({ categoria: 'punicao', descricao: '', valor: '' });
      carregar();
    }
  }

  async function alternarAtivo(item: ItemRegra) {
    await supabase.from('itens_regras').update({ ativo: !item.ativo }).eq('id', item.id);
    carregar();
  }

  return (
    <main className="max-w-lg mx-auto p-4 pb-24 space-y-6">
      <header className="pt-4 flex items-center gap-3">
        <a href="/dashboard" className="text-slate-400">←</a>
        <h1 className="text-xl font-bold">Configurações</h1>
      </header>

      <section className="rounded-2xl bg-slate-900 p-5 border border-slate-800 space-y-3">
        <h3 className="text-sm uppercase tracking-wide text-slate-400">Taxa CDI do mês (%)</h3>
        <p className="text-xs text-slate-500">
          Consulte no Banco Central/B3 e informe a taxa mensal. 100% do CDI já está configurado como multiplicador.
        </p>
        <div className="flex gap-2">
          <input
            value={taxaCdi}
            onChange={(e) => setTaxaCdi(e.target.value)}
            placeholder="Ex: 0,90"
            className="flex-1 rounded-lg bg-slate-800 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={salvarTaxaCdi} className="rounded-lg bg-blue-600 px-4 font-medium">
            Salvar
          </button>
        </div>
        {mensagem && <p className="text-xs text-slate-400">{mensagem}</p>}
      </section>

      <section className="rounded-2xl bg-slate-900 p-5 border border-slate-800 space-y-3">
        <h3 className="text-sm uppercase tracking-wide text-slate-400">Novo item do catálogo</h3>
        <div className="flex rounded-lg bg-slate-800 p-1">
          <button
            onClick={() => setNovoItem({ ...novoItem, categoria: 'punicao' })}
            className={`flex-1 rounded-md py-2 text-sm ${novoItem.categoria === 'punicao' ? 'bg-red-600' : ''}`}
          >
            Punição
          </button>
          <button
            onClick={() => setNovoItem({ ...novoItem, categoria: 'bonus' })}
            className={`flex-1 rounded-md py-2 text-sm ${novoItem.categoria === 'bonus' ? 'bg-emerald-600' : ''}`}
          >
            Bônus
          </button>
        </div>
        <input
          value={novoItem.descricao}
          onChange={(e) => setNovoItem({ ...novoItem, descricao: e.target.value })}
          placeholder="Descrição"
          className="w-full rounded-lg bg-slate-800 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          value={novoItem.valor}
          onChange={(e) => setNovoItem({ ...novoItem, valor: e.target.value })}
          placeholder="Valor (R$)"
          className="w-full rounded-lg bg-slate-800 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button onClick={adicionarItem} className="w-full rounded-lg bg-blue-600 py-2 font-medium">
          Adicionar
        </button>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm uppercase tracking-wide text-slate-400">Catálogo atual</h3>
        {itens.map((item) => (
          <div
            key={item.id}
            className={`flex items-center justify-between rounded-lg px-4 py-3 ${
              item.ativo ? 'bg-slate-900' : 'bg-slate-900/40 opacity-50'
            }`}
          >
            <div>
              <p className="text-sm">{item.descricao}</p>
              <p className={`text-xs font-medium ${item.valor < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {formatarReal(item.valor)}
              </p>
            </div>
            <button onClick={() => alternarAtivo(item)} className="text-xs text-slate-400 underline">
              {item.ativo ? 'desativar' : 'ativar'}
            </button>
          </div>
        ))}
      </section>
    </main>
  );
}
