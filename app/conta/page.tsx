'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase';
import { usePerfil } from '@/lib/usePerfil';

const SENHA_MINIMA = 6;

export default function ContaPage() {
  const { perfil, carregando } = usePerfil();
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [mensagem, setMensagem] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const router = useRouter();

  async function trocarSenha(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < SENHA_MINIMA) {
      return setMensagem({ texto: `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`, erro: true });
    }
    if (senha !== confirmacao) return setMensagem({ texto: 'As duas senhas não são iguais.', erro: true });
    setSalvando(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) {
      setMensagem({
        texto:
          error.message.includes('different')
            ? 'A nova senha precisa ser diferente da atual.'
            : error.message.includes('reauthentication') || error.message.includes('recent')
              ? 'Por segurança, saia, entre de novo e tente outra vez.'
              : `Não foi possível trocar a senha (${error.message}).`,
        erro: true,
      });
      return;
    }
    setSenha('');
    setConfirmacao('');
    setMensagem({ texto: 'Senha trocada. Use a nova senha no próximo login.' });
  }

  async function sair() {
    await supabaseBrowser().auth.signOut();
    router.push('/login');
  }

  if (!carregando && !perfil) {
    return (
      <main className="max-w-sm mx-auto p-6 pb-28 space-y-4">
        <p className="text-slate-400">Você não está logado.</p>
        <a href="/login" className="block rounded-lg bg-blue-600 py-2 text-center font-medium">
          Entrar
        </a>
      </main>
    );
  }

  return (
    <main className="max-w-sm mx-auto p-4 pb-28 space-y-5">
      <header className="pt-4">
        <h1 className="text-xl font-bold">{perfil?.nome ?? '…'}</h1>
        <p className="text-sm text-slate-400">{perfil?.papel === 'responsavel' ? 'Responsável' : 'Criança'}</p>
      </header>

      <form onSubmit={trocarSenha} className="rounded-2xl bg-slate-900 p-5 border border-slate-800 space-y-3">
        <h3 className="text-sm uppercase tracking-wide text-slate-400">Trocar minha senha</h3>
        <input
          type={mostrar ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder="Nova senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="w-full rounded-lg bg-slate-800 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type={mostrar ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder="Repita a nova senha"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          className="w-full rounded-lg bg-slate-800 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} className="accent-blue-600" />
          Mostrar senha
        </label>
        <p className="text-xs text-slate-500">Mínimo de {SENHA_MINIMA} caracteres (ex.: nome + ano).</p>
        {mensagem && <p className={`text-sm ${mensagem.erro ? 'text-red-400' : 'text-emerald-400'}`}>{mensagem.texto}</p>}
        <button
          type="submit"
          disabled={salvando || !senha}
          className="w-full rounded-lg bg-blue-600 py-2 font-medium disabled:opacity-40"
        >
          {salvando ? 'Salvando…' : 'Salvar nova senha'}
        </button>
      </form>

      <button onClick={sair} className="w-full rounded-lg bg-slate-800 py-2 font-medium text-slate-200">
        Sair
      </button>
    </main>
  );
}
