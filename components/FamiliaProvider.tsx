'use client';

import { Fragment, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import { carregarFamilia } from '@/lib/familia';

// Carrega a configuração da família antes de mostrar as telas e recarrega quando alguém entra ou sai.
export default function FamiliaProvider({ children }: { children: React.ReactNode }) {
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let ativo = true;
    const recarregar = () =>
      carregarFamilia(supabase)
        .catch(() => undefined)
        .then(() => ativo && setVersao((v) => v + 1));
    recarregar();
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT' || evento === 'USER_UPDATED') recarregar();
    });
    return () => {
      ativo = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (versao === 0) return <main className="p-6 text-slate-400">Carregando…</main>;
  // A chave remonta as telas quando a configuração muda (ex.: depois do login).
  return <Fragment key={versao}>{children}</Fragment>;
}
