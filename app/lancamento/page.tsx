'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase';
import type { Perfil, ItemRegra, Papel } from '@/lib/types';
import { formatarReal } from '@/lib/calculos';

export default function LancamentoPage() {
  const [criancas, setCriancas] = useState<Perfil[]>([]);
  const [itens, setItens] = useState<ItemRegra[]>([]);
  const [criancaId, setCriancaId] = useState('');
  const [itemId, setItemId] = useState('');
  const [aba, setAba] = useState<'punicao' | 'bonus'>('punicao');
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [papel, setPapel] = useState<Papel | null>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = supabaseBrowser();
    (async () => {
      const { data: p } = await supabase.from('perfis').select('*').eq('papel', 'crianca');
      const { data: i } = await supabase
        .from('itens_regras')
        .select('*')
        .eq('ativo', true)
        .order('descricao');
      if (p) {
        setCriancas(p);
        if (p.length > 0) setCriancaId(p[0].id);
      }
      if (i) setItens(i);
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const { data: meu } = await supabase
          .from('perfis')
          .select('papel')
          .eq('auth_user_id', userData.user.id)
          .maybeSingle();
        setPapel((meu?.papel as Papel) ?? null);
      }
    })();
  }, []);

  async function lancar() {
    if (!criancaId || !itemId) return;
    setEnviando(true);
    setMensagem(null);
    const supabase = supabaseBrowser();

    const item = itens.find((it) => it.id === itemId);
    if (!item) return;

    const { data: userData } = await supabase.auth.getUser();
    const { data: perfil } = await supabase
      .from('perfis')
      .select('id, papel')
      .eq('auth_user_id', userData.user?.id)
      .single();

    const pendente = perfil?.papel === 'crianca';
    const { error } = await supabase.from('lancamentos').insert({
      crianca_id: criancaId,
      item_id: item.id,
      descricao: item.descricao,
      valor: item.valor,
      lancado_por: perfil?.id,
      status: pendente ? 'pendente' : 'aprovado',
    });

    setEnviando(false);
    if (error) {
      setMensagem('Erro ao lançar. Entre com sua conta (responsável ou criança) e tente de novo.');
      return;
    }
    setMensagem(pendente ? 'Enviado! Um responsável precisa aprovar.' : 'Lançado com sucesso!');
    setTimeout(() => router.push('/dashboard'), 800);
  }

  const itensFiltrados = itens.filter((i) => i.categoria === aba);

  return (
    <main className="max-w-lg mx-auto p-4 pb-24 space-y-5">
      <header className="pt-4 flex items-center gap-3">
        <a href="/dashboard" className="text-slate-400">←</a>
        <h1 className="text-xl font-bold">Novo lançamento</h1>
      </header>
      {papel === 'crianca' && (
        <p className="rounded-lg bg-amber-900/40 border border-amber-700 px-3 py-2 text-sm text-amber-200">
          Seus lançamentos ficam pendentes até um responsável aprovar.
        </p>
      )}

      <div>
        <label className="text-sm text-slate-400 mb-1 block">Criança</label>
        <div className="flex gap-2">
          {criancas.map((c) => (
            <button
              key={c.id}
              onClick={() => setCriancaId(c.id)}
              className={`flex-1 rounded-lg py-2 font-medium ${
                criancaId === c.id ? 'bg-blue-600' : 'bg-slate-800'
              }`}
            >
              {c.nome}
            </button>
          ))}
        </div>
      </div>

      <div className="flex rounded-lg bg-slate-800 p-1">
        <button
          onClick={() => setAba('punicao')}
          className={`flex-1 rounded-md py-2 text-sm font-medium ${
            aba === 'punicao' ? 'bg-red-600' : ''
          }`}
        >
          Punição
        </button>
        <button
          onClick={() => setAba('bonus')}
          className={`flex-1 rounded-md py-2 text-sm font-medium ${
            aba === 'bonus' ? 'bg-emerald-600' : ''
          }`}
        >
          Bônus
        </button>
      </div>

      <div className="space-y-2 max-h-[50vh] overflow-y-auto">
        {itensFiltrados.map((item) => (
          <button
            key={item.id}
            onClick={() => setItemId(item.id)}
            className={`w-full text-left rounded-lg px-4 py-3 flex justify-between items-center ${
              itemId === item.id ? 'bg-slate-700 ring-2 ring-blue-500' : 'bg-slate-900'
            }`}
          >
            <span className="text-sm">{item.descricao}</span>
            <span className={`font-semibold whitespace-nowrap ml-3 ${item.valor < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {formatarReal(item.valor)}
            </span>
          </button>
        ))}
      </div>

      {mensagem && <p className="text-sm text-center text-slate-300">{mensagem}</p>}

      <button
        onClick={lancar}
        disabled={!itemId || enviando}
        className="w-full rounded-lg bg-blue-600 py-3 font-semibold disabled:opacity-40"
      >
        {enviando ? 'Enviando…' : papel === 'crianca' ? 'Enviar para aprovação' : 'Confirmar lançamento'}
      </button>
    </main>
  );
}
