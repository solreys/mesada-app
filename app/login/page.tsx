'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase';

const EMAIL_CRIANCA = {
  zon: 'zon.reys@clq.g12.br',
  ettore: 'ettore.reys@clq.g12.br',
} as const;

export default function LoginPage() {
  const [modo, setModo] = useState<'crianca' | 'responsavel'>('crianca');
  const [crianca, setCrianca] = useState<'zon' | 'ettore'>('zon');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const router = useRouter();

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({
      email: modo === 'crianca' ? EMAIL_CRIANCA[crianca] : email,
      password: senha,
    });
    setCarregando(false);
    if (error) {
      setErro(modo === 'crianca' ? 'Senha incorreta.' : 'E-mail ou senha inválidos.');
      return;
    }
    router.push('/dashboard');
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={entrar} className="w-full max-w-sm space-y-4 rounded-2xl bg-slate-900 p-8 shadow-xl">
        <h1 className="text-xl font-semibold text-center">Entrar — Mesada</h1>
        <p className="text-sm text-slate-400 text-center">Escolha quem é você</p>
        <div className="flex rounded-lg bg-slate-800 p-1">
          <button type="button" onClick={() => setModo('crianca')} className={`flex-1 rounded-md py-2 text-sm font-medium ${modo === 'crianca' ? 'bg-blue-600' : ''}`}>
            Sou criança
          </button>
          <button type="button" onClick={() => setModo('responsavel')} className={`flex-1 rounded-md py-2 text-sm font-medium ${modo === 'responsavel' ? 'bg-blue-600' : ''}`}>
            Sou responsável
          </button>
        </div>
        {modo === 'crianca' ? (
          <div className="flex gap-2">
            {(['zon', 'ettore'] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCrianca(n)}
                className={`flex-1 rounded-lg py-3 font-semibold capitalize ${crianca === n ? 'bg-blue-600' : 'bg-slate-800'}`}
              >
                {n}
              </button>
            ))}
          </div>
        ) : (
          <input
            type="email"
            required
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg bg-slate-800 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}
        <input
          type="password"
          required
          placeholder="Senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="w-full rounded-lg bg-slate-800 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
        />
        {erro && <p className="text-sm text-red-400">{erro}</p>}
        <button
          type="submit"
          disabled={carregando}
          className="w-full rounded-lg bg-blue-600 py-2 font-medium hover:bg-blue-500 disabled:opacity-50"
        >
          {carregando ? 'Entrando…' : 'Entrar'}
        </button>
        <a href="/dashboard" className="block text-center text-sm text-slate-400 hover:text-slate-200">
          Ver dashboard como criança (somente leitura) →
        </a>
      </form>
    </main>
  );
}
