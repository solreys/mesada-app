'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase';
import { usePerfil } from '@/lib/usePerfil';

const ICONES: Record<string, string> = {
  painel: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  lancar: 'M12 5v14M5 12h14',
  aprovacoes: 'M5 13l4 4L19 7',
  config: 'M4 6h16M4 12h16M4 18h10',
  historico: 'M4 19V9M10 19V5M16 19v-7M22 19H2',
  conta: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
};

function Icone({ nome }: { nome: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONES[nome]} />
    </svg>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const { perfil } = usePerfil();
  const [pendentes, setPendentes] = useState(0);

  useEffect(() => {
    const supabase = supabaseBrowser();
    async function contar() {
      const { count } = await supabase
        .from('lancamentos')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pendente');
      setPendentes(count ?? 0);
    }
    contar();
    const canal = supabase
      .channel('nav-pendentes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lancamentos' }, contar)
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  if (pathname === '/login') return null;

  const itens = [
    { href: '/dashboard', rotulo: 'Painel', icone: 'painel' },
    { href: '/lancamento', rotulo: 'Lançar', icone: 'lancar' },
    ...(perfil?.papel === 'responsavel'
      ? [{ href: '/aprovacoes', rotulo: 'Auditar', icone: 'aprovacoes', badge: pendentes }]
      : []),
    { href: '/historico', rotulo: 'Histórico', icone: 'historico' },
    { href: '/config', rotulo: 'Catálogo', icone: 'config' },
    { href: perfil ? '/conta' : '/login', rotulo: perfil ? perfil.nome : 'Entrar', icone: 'conta' },
  ];

  return (
    <nav className="print:hidden fixed bottom-0 inset-x-0 z-20 border-t border-slate-800 bg-slate-950/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul className="max-w-lg mx-auto flex">
        {itens.map((i) => {
          const ativo = pathname === i.href || (i.href === '/historico' && pathname === '/analise');
          return (
            <li key={i.href} className="flex-1">
              <a
                href={i.href}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${
                  ativo ? 'text-blue-400' : 'text-slate-400'
                }`}
              >
                <Icone nome={i.icone} />
                <span className="truncate max-w-[4.5rem]">{i.rotulo}</span>
                {'badge' in i && i.badge ? (
                  <span className="absolute top-1 right-1/2 translate-x-5 rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-slate-950">
                    {i.badge}
                  </span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
