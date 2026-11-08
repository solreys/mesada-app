'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase';
import { formatarReal, lerValor } from '@/lib/calculos';

// Primeiro acesso: o primeiro responsável configura a família. Depois, quem entrar sem perfil
// vê a orientação para pedir o vínculo a um responsável.
export default function PrimeiroAcessoPage() {
  const router = useRouter();
  const [situacao, setSituacao] = useState<'carregando' | 'configurar' | 'aguardar' | 'sem-login'>('carregando');
  const [email, setEmail] = useState('');
  const [form, setForm] = useState({ seuNome: '', familia: '', valor: '120,00', pct: '100' });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return setSituacao('sem-login');
      setEmail(u.user.email ?? '');
      const { data: perfil } = await supabase.from('perfis').select('id').eq('auth_user_id', u.user.id).maybeSingle();
      if (perfil) return router.replace('/dashboard');
      const { data: tem } = await supabase.rpc('familia_tem_responsavel');
      setSituacao(tem ? 'aguardar' : 'configurar');
    })();
  }, [router]);

  async function configurar(e: React.FormEvent) {
    e.preventDefault();
    const valor = lerValor(form.valor);
    const pct = lerValor(form.pct);
    if (!form.seuNome.trim()) return setErro('Informe seu nome.');
    if (isNaN(valor) || valor <= 0) return setErro('Informe o valor da mesada, ex.: 120,00');
    if (isNaN(pct) || pct < 0 || pct > 200) return setErro('% do CDI entre 0 e 200 (100 = rende igual ao CDI).');
    setSalvando(true);
    setErro(null);
    const { error } = await supabaseBrowser().rpc('configurar_familia', {
      p_seu_nome: form.seuNome.trim(),
      p_nome_familia: form.familia.trim(),
      p_valor: valor,
      p_pct_cdi: pct,
    });
    setSalvando(false);
    if (error) return setErro(error.message);
    // Recarrega tudo para o app ler a configuração nova; segue para cadastrar filhos e catálogo.
    window.location.href = '/config#familia';
  }

  async function sair() {
    await supabaseBrowser().auth.signOut();
    router.push('/login');
  }

  return (
    <main className="max-w-md mx-auto p-6 pb-28 space-y-5">
      <h1 className="text-xl font-bold pt-4">Bem-vindo ao Mesada</h1>

      {situacao === 'carregando' && <p className="text-slate-400">Carregando…</p>}

      {situacao === 'sem-login' && (
        <a href="/login" className="block rounded-lg bg-blue-600 py-2 text-center font-medium text-white">
          Entrar
        </a>
      )}

      {situacao === 'aguardar' && (
        <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3 text-sm">
          <p>
            Seu login (<strong>{email}</strong>) ainda não está ligado a esta família.
          </p>
          <p className="text-slate-400">
            Peça a um responsável para abrir <strong>Catálogo → Família → Adicionar membro</strong> e cadastrar este e-mail.
            Depois, entre de novo.
          </p>
          <button onClick={sair} className="w-full rounded-lg bg-slate-800 py-2 font-medium">
            Sair
          </button>
        </section>
      )}

      {situacao === 'configurar' && (
        <form onSubmit={configurar} className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
          <p className="text-sm text-slate-400">
            Você é o primeiro a entrar. Configure a família; depois você cadastra os filhos, o outro responsável e o catálogo de
            punições e bônus do jeito de vocês.
          </p>
          <label className="block space-y-1">
            <span className="text-sm">Seu nome (como as crianças chamam você)</span>
            <input
              value={form.seuNome}
              onChange={(e) => setForm({ ...form, seuNome: e.target.value })}
              placeholder="Ex.: Mãe, Pai, Ana"
              className="w-full rounded-lg bg-slate-800 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Nome da família no app (opcional)</span>
            <input
              value={form.familia}
              onChange={(e) => setForm({ ...form, familia: e.target.value })}
              placeholder="Ex.: Mesada da Família Silva"
              className="w-full rounded-lg bg-slate-800 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-sm">Mesada por mês (R$)</span>
              <input
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                inputMode="decimal"
                className="w-full rounded-lg bg-slate-800 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Poupança rende (% do CDI)</span>
              <input
                value={form.pct}
                onChange={(e) => setForm({ ...form, pct: e.target.value })}
                inputMode="decimal"
                className="w-full rounded-lg bg-slate-800 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          </div>
          <p className="text-xs text-slate-500">
            Cada filho começa todo mês com {formatarReal(lerValor(form.valor) || 0)}. Use 0% se a poupança não render. Dá para
            mudar depois em Catálogo → Família.
          </p>
          {erro && <p className="text-sm text-red-400">{erro}</p>}
          <button disabled={salvando} className="w-full rounded-lg bg-blue-600 py-2 font-semibold text-white disabled:opacity-50">
            {salvando ? 'Salvando…' : 'Configurar família'}
          </button>
        </form>
      )}
    </main>
  );
}
