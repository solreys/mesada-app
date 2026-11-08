'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase';
import type { Perfil } from '@/lib/types';

// Perfil do usuário logado (null se não houver login). `carregando` fica true até a primeira resposta.
// exigirLogin: sem login, manda para /login (os dados só são liberados no banco para quem está logado).
export function usePerfil(exigirLogin = false) {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [logado, setLogado] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!exigirLogin || carregando || perfil) return;
    // Logado sem perfil: família nova (configurar) ou usuário ainda não vinculado.
    router.replace(logado ? '/primeiro-acesso' : '/login');
  }, [exigirLogin, carregando, perfil, logado, router]);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let ativo = true;

    async function carregar() {
      const { data: u } = await supabase.auth.getUser();
      let meu: Perfil | null = null;
      if (u.user) {
        const { data } = await supabase
          .from('perfis')
          .select('*')
          .eq('auth_user_id', u.user.id)
          .maybeSingle();
        meu = data ?? null;
      }
      if (ativo) {
        setLogado(!!u.user);
        setPerfil(meu);
        setCarregando(false);
      }
    }

    carregar();
    const { data: sub } = supabase.auth.onAuthStateChange(() => carregar());
    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { perfil, carregando };
}
