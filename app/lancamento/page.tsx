'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import type { Perfil, ItemRegra, Lancamento, CategoriaItem } from '@/lib/types';
import { CORES_CRIANCA, SALDO_INICIAL_MES, formatarReal, intervaloMes, lerValor, mesAtual } from '@/lib/calculos';
import { usePerfil } from '@/lib/usePerfil';
import { bancoTemOcorrido, inserirLancamento } from '@/lib/compat';

interface Aviso {
  id: number;
  texto: string;
  erro?: boolean;
  desfazer?: () => Promise<void>;
}

// Quando o comportamento aconteceu (só para as análises; o saldo conta pela hora do registro).
type Quando = 'agora' | '1h' | '3h' | 'ontem';
const QUANDO: { id: Quando; rotulo: string }[] = [
  { id: 'agora', rotulo: 'Agora' },
  { id: '1h', rotulo: 'Há 1h' },
  { id: '3h', rotulo: 'Há 3h' },
  { id: 'ontem', rotulo: 'Ontem 20h' },
];
function ocorridoEm(q: Quando): string {
  const d = new Date();
  if (q === '1h') d.setHours(d.getHours() - 1);
  if (q === '3h') d.setHours(d.getHours() - 3);
  if (q === 'ontem') {
    d.setDate(d.getDate() - 1);
    d.setHours(20, 0, 0, 0);
  }
  return d.toISOString();
}

function inicioDoDia(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function LancamentoPage() {
  const { perfil, carregando } = usePerfil(true);
  const [criancas, setCriancas] = useState<Perfil[]>([]);
  const [itens, setItens] = useState<ItemRegra[]>([]);
  // Lançamentos do mês (não rejeitados); "hoje" é um recorte deste.
  const [doMes, setDoMes] = useState<Lancamento[]>([]);
  // Uso de cada item nos últimos 60 dias, para montar os favoritos.
  const [uso60, setUso60] = useState<Pick<Lancamento, 'crianca_id' | 'item_id'>[]>([]);
  const [criancaId, setCriancaId] = useState('');
  const [aba, setAba] = useState<CategoriaItem>('punicao');
  const [busca, setBusca] = useState('');
  const [piscando, setPiscando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [outroAberto, setOutroAberto] = useState(false);
  const [outro, setOutro] = useState({ descricao: '', valor: '', observacao: '' });
  const timerAviso = useRef<ReturnType<typeof setTimeout>>();
  const [quando, setQuando] = useState<Quando>('agora');
  // A escolha da hora só aparece quando o banco já tem a coluna ocorrido_em.
  const [horaDisponivel, setHoraDisponivel] = useState(false);
  useEffect(() => {
    bancoTemOcorrido(supabaseBrowser()).then(setHoraDisponivel);
  }, []);

  const souResponsavel = perfil?.papel === 'responsavel';
  const podeLancar = !!perfil;

  const carregarMovimento = useCallback(async () => {
    const supabase = supabaseBrowser();
    const { data: l } = await supabase
      .from('lancamentos')
      .select('*')
      .gte('criado_em', intervaloMes(mesAtual()).inicio)
      .neq('status', 'rejeitado');
    if (l) setDoMes(l);
    const { data: u } = await supabase
      .from('lancamentos')
      .select('crianca_id, item_id')
      .not('item_id', 'is', null)
      .neq('status', 'rejeitado')
      .not('descricao', 'like', 'Estorno:%')
      .gte('criado_em', new Date(Date.now() - 60 * 86_400_000).toISOString())
      .limit(5000);
    if (u) setUso60(u);
  }, []);

  useEffect(() => {
    const supabase = supabaseBrowser();
    (async () => {
      const [{ data: p }, { data: i }] = await Promise.all([
        supabase.from('perfis').select('*').eq('papel', 'crianca').order('nome', { ascending: false }),
        supabase.from('itens_regras').select('*').eq('ativo', true).order('descricao'),
      ]);
      if (p) {
        setCriancas(p);
        if (p.length > 0) setCriancaId((atual) => atual || p[0].id);
      }
      if (i) setItens(i);
    })();
    carregarMovimento();

    const canal = supabase
      .channel('lancamento-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lancamentos' }, carregarMovimento)
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [carregarMovimento]);

  // Criança logada lança para si mesma por padrão.
  useEffect(() => {
    if (perfil?.papel === 'crianca') setCriancaId(perfil.id);
  }, [perfil]);

  function mostrarAviso(a: Omit<Aviso, 'id'>) {
    clearTimeout(timerAviso.current);
    setAviso({ ...a, id: Date.now() });
    timerAviso.current = setTimeout(() => setAviso(null), a.desfazer ? 6000 : 3000);
  }

  async function gravar(dados: {
    item_id: string | null;
    descricao: string;
    valor: number;
    observacao?: string | null;
  }) {
    if (!perfil || !criancaId) return false;
    const crianca = criancas.find((c) => c.id === criancaId);
    const pendente = perfil.papel === 'crianca';
    const supabase = supabaseBrowser();
    const ocorrido = ocorridoEm(quando);
    const { error } = await inserirLancamento(supabase, {
      ocorrido_em: ocorrido,
      crianca_id: criancaId,
      lancado_por: perfil.id,
      status: pendente ? 'pendente' : 'aprovado',
      observacao: dados.observacao || null,
      item_id: dados.item_id,
      descricao: dados.descricao,
      valor: dados.valor,
    });
    if (error) {
      mostrarAviso({ texto: 'Não foi possível lançar. Confira a conexão e o login.', erro: true });
      return false;
    }
    carregarMovimento();
    const quandoTexto = quando === 'agora' ? '' : ` (${QUANDO.find((q) => q.id === quando)?.rotulo.toLowerCase()})`;
    const resumo = `${formatarReal(dados.valor)} · ${dados.descricao} → ${crianca?.nome ?? ''}${quandoTexto}`;
    mostrarAviso({
      texto: pendente ? `${resumo} (aguardando aprovação)` : resumo,
      // Desfazer = estorno: lançamento com valor oposto, para o extrato continuar auditável.
      desfazer: pendente
        ? undefined
        : async () => {
            const { error: e } = await inserirLancamento(supabase, {
              crianca_id: criancaId,
              lancado_por: perfil.id,
              status: 'aprovado',
              item_id: dados.item_id,
              descricao: `Estorno: ${dados.descricao}`,
              valor: -dados.valor,
              observacao: 'Desfeito no app',
              ocorrido_em: ocorrido,
            });
            mostrarAviso(e ? { texto: 'Erro ao desfazer.', erro: true } : { texto: 'Lançamento desfeito.' });
            carregarMovimento();
          },
    });
    return true;
  }

  async function tocar(item: ItemRegra) {
    if (!podeLancar) return;
    setPiscando(item.id);
    setTimeout(() => setPiscando((p) => (p === item.id ? null : p)), 400);
    if (navigator.vibrate) navigator.vibrate(30);
    await gravar({ item_id: item.id, descricao: item.descricao, valor: Number(item.valor) });
  }

  async function lancarOutro() {
    const v = Math.abs(lerValor(outro.valor));
    if (!outro.descricao.trim() || !v) return;
    const ok = await gravar({
      item_id: null,
      descricao: outro.descricao.trim(),
      valor: aba === 'punicao' ? -v : v,
      observacao: outro.observacao.trim() || null,
    });
    if (ok) {
      setOutro({ descricao: '', valor: '', observacao: '' });
      setOutroAberto(false);
    }
  }

  // Quantas vezes o item foi lançado hoje para a criança (estornos descontam).
  function vezesHoje(item: ItemRegra): number {
    const soma = hoje
      .filter((l) => l.crianca_id === criancaId && l.item_id === item.id)
      .reduce((acc, l) => acc + Number(l.valor), 0);
    return Number(item.valor) ? Math.round(soma / Number(item.valor)) : 0;
  }

  const hoje = doMes.filter((l) => l.criado_em >= inicioDoDia());
  const termo = busca.trim().toLowerCase();
  const itensFiltrados = itens.filter(
    (i) => i.categoria === aba && (!termo || i.descricao.toLowerCase().includes(termo))
  );
  // Favoritos: os 6 itens mais usados pela criança nesta aba (últimos 60 dias).
  const usoPorItem = new Map<string, number>();
  uso60
    .filter((l) => l.crianca_id === criancaId && l.item_id)
    .forEach((l) => usoPorItem.set(l.item_id!, (usoPorItem.get(l.item_id!) ?? 0) + 1));
  const favoritos = itens
    .filter((i) => i.categoria === aba && usoPorItem.has(i.id))
    .sort((a, b) => usoPorItem.get(b.id)! - usoPorItem.get(a.id)!)
    .slice(0, 6);
  const criancaAtual = criancas.find((c) => c.id === criancaId);
  // Mesma conta do painel: 120 + aprovados do mês (independe da virada).
  const saldoAtual =
    SALDO_INICIAL_MES +
    doMes
      .filter((l) => l.crianca_id === criancaId && l.status === 'aprovado')
      .reduce((acc, l) => acc + Number(l.valor), 0);
  const somaHoje = hoje
    .filter((l) => l.crianca_id === criancaId && l.status === 'aprovado')
    .reduce((acc, l) => acc + Number(l.valor), 0);
  const valorOutro = Math.abs(lerValor(outro.valor)) || 0;

  return (
    <main className="max-w-lg mx-auto px-4 pb-40">
      <div className="sticky top-0 z-10 -mx-4 px-4 pt-4 pb-3 bg-slate-950/95 backdrop-blur space-y-3 border-b border-slate-900">
        <div className="flex gap-2">
          {/* Criança logada só vê e lança para si mesma. */}
          {criancas.filter((c) => perfil?.papel !== 'crianca' || c.id === perfil.id).map((c) => (
            <button
              key={c.id}
              onClick={() => setCriancaId(c.id)}
              className={`flex-1 rounded-xl py-3 font-semibold transition ${
                criancaId === c.id ? 'text-white shadow-lg' : 'bg-slate-800 text-slate-300'
              }`}
              style={criancaId === c.id ? { backgroundColor: CORES_CRIANCA[c.nome] ?? '#2563eb' } : undefined}
            >
              {c.nome}
            </button>
          ))}
        </div>

        {criancaAtual && (
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-slate-400">
              Saldo do mês:{' '}
              <strong className={`text-base ${saldoAtual < 0 ? 'text-red-400' : 'text-slate-50'}`}>
                {formatarReal(saldoAtual)}
              </strong>
            </span>
            <span
              className={`text-xs ${
                somaHoje < 0 ? 'text-red-400' : somaHoje > 0 ? 'text-emerald-400' : 'text-slate-500'
              }`}
            >
              hoje {formatarReal(somaHoje)}
            </span>
          </div>
        )}

        <div className="flex rounded-lg bg-slate-800 p-1">
          <button
            onClick={() => setAba('punicao')}
            className={`flex-1 rounded-md py-2 text-sm font-semibold ${aba === 'punicao' ? 'bg-red-600' : 'text-slate-300'}`}
          >
            Punição
          </button>
          <button
            onClick={() => setAba('bonus')}
            className={`flex-1 rounded-md py-2 text-sm font-semibold ${aba === 'bonus' ? 'bg-emerald-600' : 'text-slate-300'}`}
          >
            Bônus
          </button>
        </div>

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar item…"
          className="w-full rounded-lg bg-slate-900 border border-slate-800 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {!carregando && !podeLancar && (
        <a
          href="/login"
          className="mt-4 block rounded-lg bg-amber-900/40 border border-amber-700 px-3 py-2 text-sm text-amber-200"
        >
          Entre com sua conta para lançar →
        </a>
      )}
      {perfil?.papel === 'crianca' && (
        <p className="mt-4 rounded-lg bg-amber-900/40 border border-amber-700 px-3 py-2 text-sm text-amber-200">
          Seus lançamentos ficam pendentes até um responsável aprovar.
        </p>
      )}

      {horaDisponivel && (
      <div className="mt-4 flex items-center gap-2">
        <span className="text-xs text-slate-400 whitespace-nowrap">Aconteceu:</span>
        <div className="flex flex-1 gap-1 overflow-x-auto">
          {QUANDO.map((q) => (
            <button
              key={q.id}
              onClick={() => setQuando(q.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${
                quando === q.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {q.rotulo}
            </button>
          ))}
        </div>
      </div>
      )}
      <p className="mt-2 mb-2 text-xs text-slate-500">
        Um toque já lança. Errou? Toque em “Desfazer” no aviso que aparece embaixo.
        {quando !== 'agora' && ' O horário escolhido vale só para as análises; o saldo conta hoje.'}
      </p>

      {!termo && favoritos.length > 0 && (
        <section className="mb-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Mais usados</p>
          <div className="grid grid-cols-3 gap-2">
            {favoritos.map((item) => {
              const vezes = vezesHoje(item);
              return (
                <button
                  key={item.id}
                  onClick={() => tocar(item)}
                  disabled={!podeLancar}
                  className={`relative flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-center transition active:scale-95 disabled:opacity-50 ${
                    piscando === item.id ? (item.valor < 0 ? 'bg-red-900/70' : 'bg-emerald-900/70') : 'bg-slate-900 hover:bg-slate-800'
                  }`}
                >
                  {vezes > 0 && (
                    <span className="absolute right-1 top-1 rounded-full bg-slate-700 px-1.5 text-[10px]">×{vezes}</span>
                  )}
                  <span className="text-2xl leading-none">{item.icone ?? (item.valor < 0 ? '⚠️' : '⭐')}</span>
                  <span className="line-clamp-2 text-[11px] leading-tight text-slate-200">{item.descricao}</span>
                  <span className={`text-xs font-semibold ${item.valor < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {formatarReal(Number(item.valor))}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 mb-2 text-xs uppercase tracking-wide text-slate-400">Todos</p>
        </section>
      )}

      <div className="space-y-2">
        {itensFiltrados.map((item) => {
          const vezes = vezesHoje(item);
          return (
            <button
              key={item.id}
              onClick={() => tocar(item)}
              disabled={!podeLancar}
              className={`w-full text-left rounded-xl px-4 py-3 flex items-center gap-3 transition active:scale-[0.98] disabled:opacity-50 ${
                piscando === item.id
                  ? item.valor < 0
                    ? 'bg-red-900/70'
                    : 'bg-emerald-900/70'
                  : 'bg-slate-900 hover:bg-slate-800'
              }`}
            >
              <span className="w-7 text-center text-xl leading-none">{item.icone ?? ''}</span>
              <span className="flex-1 text-sm leading-snug">{item.descricao}</span>
              {vezes > 0 && (
                <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-200 whitespace-nowrap">
                  ×{vezes} hoje
                </span>
              )}
              <span className={`font-semibold whitespace-nowrap ${item.valor < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {formatarReal(Number(item.valor))}
              </span>
            </button>
          );
        })}
        {itensFiltrados.length === 0 && (
          <p className="text-sm text-slate-500 py-2">Nenhum item encontrado. Use “Outro” abaixo.</p>
        )}
      </div>

      <section className="mt-4 rounded-xl border border-dashed border-slate-700 p-4 space-y-3">
        {!outroAberto ? (
          <button
            onClick={() => {
              setOutroAberto(true);
              setOutro((o) => ({ ...o, descricao: o.descricao || busca }));
            }}
            disabled={!podeLancar}
            className="w-full text-sm font-medium text-slate-300 disabled:opacity-50"
          >
            + Outro motivo de {aba === 'punicao' ? 'punição' : 'bônus'} (digitar)
          </button>
        ) : (
          <>
            <p className="text-sm font-medium">Outro motivo de {aba === 'punicao' ? 'punição' : 'bônus'}</p>
            <input
              value={outro.descricao}
              onChange={(e) => setOutro({ ...outro, descricao: e.target.value })}
              placeholder="O que aconteceu?"
              className="w-full rounded-lg bg-slate-800 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              value={outro.valor}
              onChange={(e) => setOutro({ ...outro, valor: e.target.value })}
              inputMode="decimal"
              placeholder="Valor em R$ (ex.: 2,00)"
              className="w-full rounded-lg bg-slate-800 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              value={outro.observacao}
              onChange={(e) => setOutro({ ...outro, observacao: e.target.value })}
              placeholder="Observação (opcional)"
              className="w-full rounded-lg bg-slate-800 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <button onClick={() => setOutroAberto(false)} className="flex-1 rounded-lg bg-slate-800 py-2 text-sm">
                Cancelar
              </button>
              <button
                onClick={lancarOutro}
                disabled={!outro.descricao.trim() || !valorOutro}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold disabled:opacity-40 ${
                  aba === 'punicao' ? 'bg-red-600' : 'bg-emerald-600'
                }`}
              >
                Lançar {formatarReal(aba === 'punicao' ? -valorOutro : valorOutro)}
              </button>
            </div>
            {souResponsavel && (
              <p className="text-xs text-slate-500">Se for algo que vai se repetir, cadastre no catálogo em Config.</p>
            )}
          </>
        )}
      </section>

      {aviso && (
        <div
          key={aviso.id}
          className={`fixed left-1/2 -translate-x-1/2 bottom-24 z-30 w-[calc(100%-2rem)] max-w-lg rounded-xl px-4 py-3 shadow-2xl flex items-center gap-3 text-sm ${
            aviso.erro ? 'bg-red-900 text-red-100' : 'bg-slate-100 text-slate-900'
          }`}
        >
          <span className="flex-1">{aviso.texto}</span>
          {aviso.desfazer && (
            <button
              onClick={() => {
                const f = aviso.desfazer!;
                setAviso(null);
                f();
              }}
              className="font-bold text-blue-700 whitespace-nowrap"
            >
              Desfazer
            </button>
          )}
        </div>
      )}
    </main>
  );
}
