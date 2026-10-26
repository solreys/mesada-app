'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import type { Perfil } from '@/lib/types';

// Perfil do usuário logado (null se não houver login). `carregando` fica true até a primeira resposta.
export function usePerfil() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);

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
