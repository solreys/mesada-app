'use client';

import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import type { CategoriaItem, ConfigFinanceira, ItemRegra } from '@/lib/types';
import { lerValor, mesAtual, nomeMes } from '@/lib/calculos';
import { usePerfil } from '@/lib/usePerfil';

// Punição sempre negativa, bônus sempre positivo.
function normalizar(categoria: CategoriaItem, valor: number): number {
  const v = Math.abs(valor);
  return categoria === 'punicao' ? -v : v;
}

function valorTexto(v: number): string {
  return Math.abs(Number(v)).toFixed(2).replace('.', ',');
}

// Divide uma linha CSV com separador ";" respeitando aspas.
function dividirLinhaCsv(linha: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === ';') {
      campos.push(atual);
      atual = '';
    } else atual += c;
  }
  campos.push(atual);
  return campos.map((s) => s.trim());
}

function campoCsv(s: string): string {
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

type Estado = 'salvando' | 'salvo' | 'erro' | undefined;

function LinhaItem({
  item,
  editavel,
  onSalvar,
}: {
  item: ItemRegra;
  editavel: boolean;
  onSalvar: (id: string, mudancas: Partial<ItemRegra>) => Promise<boolean>;
}) {
  const [descricao, setDescricao] = useState(item.descricao);
  const [valor, setValor] = useState(valorTexto(item.valor));
  const [estado, setEstado] = useState<Estado>();

  useEffect(() => {
    setDescricao(item.descricao);
    setValor(valorTexto(item.valor));
  }, [item.descricao, item.valor]);

  async function salvar(mudancas: Partial<ItemRegra>) {
    setEstado('salvando');
    const ok = await onSalvar(item.id, mudancas);
    setEstado(ok ? 'salvo' : 'erro');
    if (ok) setTimeout(() => setEstado(undefined), 1500);
  }

  function aoSairDescricao() {
    const d = descricao.trim();
    if (!d) return setDescricao(item.descricao);
    if (d !== item.descricao) salvar({ descricao: d });
  }

  function aoSairValor() {
    const v = lerValor(valor);
    if (isNaN(v) || v === 0) return setValor(valorTexto(item.valor));
    const novo = normalizar(item.categoria, v);
    setValor(valorTexto(novo));
    if (novo !== Number(item.valor)) salvar({ valor: novo });
  }

  const cor = item.categoria === 'punicao' ? 'text-red-400' : 'text-emerald-400';

  return (
    <tr className={`border-b border-slate-800 ${item.ativo ? '' : 'opacity-40'}`}>
      <td className="py-1 pr-1">
        <input
          value={descricao}
          disabled={!editavel}
          onChange={(e) => setDescricao(e.target.value)}
          onBlur={aoSairDescricao}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="w-full rounded bg-transparent px-2 py-1.5 text-sm outline-none focus:bg-slate-800 focus:ring-1 focus:ring-blue-500"
        />
      </td>
      <td className="py-1 pr-1 w-24">
        <div className={`flex items-center rounded focus-within:bg-slate-800 focus-within:ring-1 focus-within:ring-blue-500 ${cor}`}>
          <span className="pl-2 text-sm">{item.categoria === 'punicao' ? '−' : '+'}</span>
          <input
            value={valor}
            disabled={!editavel}
            inputMode="decimal"
            onChange={(e) => setValor(e.target.value)}
            onBlur={aoSairValor}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="w-full bg-transparent px-1 py-1.5 text-sm text-right font-medium outline-none"
          />
        </div>
      </td>
      <td className="py-1 pr-1 w-16">
        <select
          value={item.categoria}
          disabled={!editavel}
          onChange={(e) => {
            const categoria = e.target.value as CategoriaItem;
            salvar({ categoria, valor: normalizar(categoria, Number(item.valor)) });
          }}
          className="w-full rounded bg-slate-800 px-1 py-1.5 text-xs outline-none"
        >
          <option value="punicao">Pun.</option>
          <option value="bonus">Bôn.</option>
        </select>
      </td>
      <td className="py-1 w-14 text-center">
        <input
          type="checkbox"
          checked={item.ativo}
          disabled={!editavel}
          onChange={() => salvar({ ativo: !item.ativo })}
          className="h-4 w-4 accent-blue-600"
          aria-label="Ativo"
        />
        <span className="block text-[10px] h-3 text-slate-500">
          {estado === 'salvando' ? '…' : estado === 'salvo' ? 'salvo' : estado === 'erro' ? 'erro' : ''}
        </span>
      </td>
    </tr>
  );
}

export default function ConfigPage() {
  const { perfil } = usePerfil(true);
  const editavel = perfil?.papel === 'responsavel';
  const [itens, setItens] = useState<ItemRegra[]>([]);
  const [busca, setBusca] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(true);
  const [novo, setNovo] = useState({ categoria: 'punicao' as CategoriaItem, descricao: '', valor: '' });
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [cdis, setCdis] = useState<ConfigFinanceira[]>([]);
  const [cdi, setCdi] = useState({ mes: mesAtual(), taxa: '' });
  const [msgCdi, setMsgCdi] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  async function carregar() {
    const supabase = supabaseBrowser();
    const [{ data }, { data: c }] = await Promise.all([
      supabase.from('itens_regras').select('*').order('categoria').order('descricao'),
      supabase.from('config_financeira').select('*').order('mes_referencia', { ascending: false }).limit(6),
    ]);
    if (data) setItens(data);
    if (c) setCdis(c);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function salvarItem(id: string, mudancas: Partial<ItemRegra>) {
    const { error } = await supabaseBrowser().from('itens_regras').update(mudancas).eq('id', id);
    if (!error) setItens((lista) => lista.map((i) => (i.id === id ? { ...i, ...mudancas } : i)));
    return !error;
  }

  async function adicionarItem() {
    const v = lerValor(novo.valor);
    if (!novo.descricao.trim() || isNaN(v) || v === 0) return;
    const { error } = await supabaseBrowser()
      .from('itens_regras')
      .insert({ categoria: novo.categoria, descricao: novo.descricao.trim(), valor: normalizar(novo.categoria, v) });
    if (error) return setMensagem('Erro ao adicionar item.');
    setNovo({ ...novo, descricao: '', valor: '' });
    setMensagem('Item adicionado.');
    carregar();
  }

  function exportarCsv() {
    const linhas = ['categoria;descricao;valor;ativo'];
    itens.forEach((i) =>
      linhas.push(
        [
          i.categoria === 'punicao' ? 'punição' : 'bônus',
          campoCsv(i.descricao),
          valorTexto(i.valor),
          i.ativo ? 'sim' : 'não',
        ].join(';')
      )
    );
    // BOM para o Excel abrir com acentos corretos.
    const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `catalogo-mesada-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importarCsv(file: File) {
    const texto = (await file.text()).replace(/^﻿/, '');
    const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
    const erros: string[] = [];
    const novos: Omit<ItemRegra, 'id' | 'criado_em'>[] = [];
    const alterados: { id: string; mudancas: Partial<ItemRegra> }[] = [];
    const porDescricao = new Map(itens.map((i) => [i.descricao.trim().toLowerCase(), i]));

    linhas.slice(1).forEach((linha, n) => {
      const [cat, descricao, valorStr, ativoStr] = dividirLinhaCsv(linha);
      const c = (cat ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const categoria: CategoriaItem | null = c.startsWith('pun') ? 'punicao' : c.startsWith('bon') ? 'bonus' : null;
      const v = lerValor(valorStr ?? '');
      if (!categoria || !descricao || isNaN(v) || v === 0) {
        erros.push(`linha ${n + 2}`);
        return;
      }
      const a = (ativoStr ?? 'sim').toLowerCase();
      const ativo = !['nao', 'não', 'n', 'false', '0'].includes(a);
      const valor = normalizar(categoria, v);
      const existente = porDescricao.get(descricao.toLowerCase());
      if (!existente) {
        novos.push({ categoria, descricao, valor, ativo });
      } else if (
        existente.categoria !== categoria ||
        Number(existente.valor) !== valor ||
        existente.ativo !== ativo
      ) {
        alterados.push({ id: existente.id, mudancas: { categoria, valor, ativo } });
      }
    });

    const resumo =
      `Importar planilha:\n• ${novos.length} item(ns) novo(s)\n• ${alterados.length} item(ns) alterado(s)` +
      (erros.length ? `\n• ${erros.length} linha(s) ignorada(s) com erro: ${erros.slice(0, 5).join(', ')}` : '') +
      '\n\nItens que não estão na planilha continuam como estão. Confirmar?';
    if (novos.length + alterados.length === 0) {
      setMensagem(erros.length ? `Nada a importar. Linhas com erro: ${erros.join(', ')}` : 'Nada mudou.');
      return;
    }
    if (!window.confirm(resumo)) return;

    const supabase = supabaseBrowser();
    let falhas = 0;
    if (novos.length) {
      const { error } = await supabase.from('itens_regras').insert(novos);
      if (error) falhas += novos.length;
    }
    for (const a of alterados) {
      const { error } = await supabase.from('itens_regras').update(a.mudancas).eq('id', a.id);
      if (error) falhas++;
    }
    setMensagem(falhas ? `Importado com ${falhas} falha(s).` : 'Planilha importada.');
    carregar();
  }

  async function salvarCdi() {
    const taxa = lerValor(cdi.taxa);
    if (isNaN(taxa) || taxa <= 0) return setMsgCdi('Informe a taxa, ex.: 1,08');
    const { error } = await supabaseBrowser()
      .from('config_financeira')
      .upsert(
        { mes_referencia: `${cdi.mes}-01`, taxa_cdi_pct: taxa, multiplicador: 1.0, criado_por: perfil?.id ?? null },
        { onConflict: 'mes_referencia' }
      );
    setMsgCdi(error ? 'Erro ao salvar taxa CDI.' : 'Taxa CDI salva.');
    if (!error) {
      setCdi({ ...cdi, taxa: '' });
      carregar();
    }
  }

  const termo = busca.trim().toLowerCase();
  const visiveis = itens.filter(
    (i) => (mostrarInativos || i.ativo) && (!termo || i.descricao.toLowerCase().includes(termo))
  );
  const grupos: { titulo: string; categoria: CategoriaItem }[] = [
    { titulo: 'Punições', categoria: 'punicao' },
    { titulo: 'Bônus', categoria: 'bonus' },
  ];

  return (
    <main className="max-w-2xl mx-auto p-4 pb-28 space-y-6">
      <header className="pt-4">
        <h1 className="text-xl font-bold">Configurações</h1>
        {!editavel && <p className="text-sm text-slate-400">Somente responsáveis podem editar.</p>}
      </header>

      {editavel && (
        <a href="/fechamento" className="block rounded-2xl bg-blue-950/60 border border-blue-800 p-4 text-sm text-blue-200">
          <strong className="block">Fechamento do mês →</strong>
          Congela o mês anterior, aplica o CDI na poupança e recomeça a mesada.
        </a>
      )}

      <section className="rounded-2xl bg-slate-900 p-4 border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm uppercase tracking-wide text-slate-400">Catálogo ({itens.length} itens)</h3>
          <div className="flex gap-2">
            <button onClick={exportarCsv} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium">
              Baixar planilha
            </button>
            {editavel && (
              <button
                onClick={() => arquivo.current?.click()}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium"
              >
                Importar planilha
              </button>
            )}
            <input
              ref={arquivo}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importarCsv(f);
                e.target.value = '';
              }}
            />
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Edite direto na tabela: a alteração é salva ao sair do campo. Desmarque “Ativo” para tirar um item da tela de
          lançamento sem apagar o histórico. A planilha (CSV) abre no Excel; ao importar, itens com a mesma descrição são
          atualizados e os novos são criados.
        </p>
        {mensagem && <p className="text-xs text-blue-300">{mensagem}</p>}

        <div className="flex gap-2 items-center">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Filtrar…"
            className="flex-1 rounded-lg bg-slate-800 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <label className="flex items-center gap-1 text-xs text-slate-400 whitespace-nowrap">
            <input
              type="checkbox"
              checked={mostrarInativos}
              onChange={(e) => setMostrarInativos(e.target.checked)}
              className="accent-blue-600"
            />
            inativos
          </label>
        </div>

        {grupos.map((g) => {
          const linhas = visiveis.filter((i) => i.categoria === g.categoria);
          return (
            <div key={g.categoria}>
              <p className={`text-xs font-semibold mt-2 ${g.categoria === 'punicao' ? 'text-red-400' : 'text-emerald-400'}`}>
                {g.titulo} ({linhas.length})
              </p>
              <table className="w-full">
                <thead>
                  <tr className="text-left text-[11px] text-slate-500 border-b border-slate-800">
                    <th className="py-1 pl-2 font-normal">Descrição</th>
                    <th className="py-1 font-normal text-right pr-2">R$</th>
                    <th className="py-1 font-normal">Tipo</th>
                    <th className="py-1 font-normal text-center">Ativo</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((item) => (
                    <LinhaItem key={item.id} item={item} editavel={editavel} onSalvar={salvarItem} />
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}

        {editavel && (
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-400">Nova linha</p>
            <div className="flex gap-2">
              <select
                value={novo.categoria}
                onChange={(e) => setNovo({ ...novo, categoria: e.target.value as CategoriaItem })}
                className="rounded-lg bg-slate-800 px-2 text-sm outline-none"
              >
                <option value="punicao">Punição</option>
                <option value="bonus">Bônus</option>
              </select>
              <input
                value={novo.valor}
                onChange={(e) => setNovo({ ...novo, valor: e.target.value })}
                inputMode="decimal"
                placeholder="R$"
                className="w-20 rounded-lg bg-slate-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <input
                value={novo.descricao}
                onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && adicionarItem()}
                placeholder="Descrição"
                className="flex-1 rounded-lg bg-slate-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={adicionarItem} className="rounded-lg bg-blue-600 px-4 text-sm font-semibold">
                Adicionar
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-slate-900 p-4 border border-slate-800 space-y-3">
        <h3 className="text-sm uppercase tracking-wide text-slate-400">Taxa CDI mensal (%)</h3>
        <p className="text-xs text-slate-500">
          No mês de aplicação, informe o CDI fechado do mês anterior (ex.: em outubro, o CDI de setembro). 100% do CDI.
        </p>
        {editavel && (
          <div className="flex gap-2">
            <input
              type="month"
              value={cdi.mes}
              onChange={(e) => setCdi({ ...cdi, mes: e.target.value })}
              className="rounded-lg bg-slate-800 px-2 py-2 text-sm outline-none"
            />
            <input
              value={cdi.taxa}
              onChange={(e) => setCdi({ ...cdi, taxa: e.target.value })}
              inputMode="decimal"
              placeholder="Ex.: 1,08"
              className="flex-1 min-w-0 rounded-lg bg-slate-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={salvarCdi} className="rounded-lg bg-blue-600 px-4 text-sm font-semibold">
              Salvar
            </button>
          </div>
        )}
        {msgCdi && <p className="text-xs text-slate-400">{msgCdi}</p>}
        <ul className="text-sm divide-y divide-slate-800">
          {cdis.map((c) => (
            <li key={c.id} className="flex justify-between py-1.5">
              <span className="text-slate-400">{nomeMes(c.mes_referencia.slice(0, 7))}</span>
              <span>{Number(c.taxa_cdi_pct).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
