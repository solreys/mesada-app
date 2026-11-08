// Compatibilidade com bancos que ainda não rodaram a migration 20261111000000_ocorrido_em.sql.
// Sem a coluna ocorrido_em, o app continua funcionando: só não guarda a hora do acontecimento.
import type { SupabaseClient } from '@supabase/supabase-js';

let temOcorrido: boolean | null = null;

export function erroSemOcorrido(error: { message?: string } | null): boolean {
  return !!error?.message && error.message.includes('ocorrido_em');
}

export async function bancoTemOcorrido(supabase: SupabaseClient): Promise<boolean> {
  if (temOcorrido === null) {
    const { error } = await supabase.from('lancamentos').select('ocorrido_em').limit(1);
    temOcorrido = !erroSemOcorrido(error);
  }
  return temOcorrido;
}

// Insere lançamento; se a coluna ocorrido_em não existir, tenta de novo sem ela.
export async function inserirLancamento(supabase: SupabaseClient, dados: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ocorrido_em, ...sem } = dados;
  if (temOcorrido === false) return supabase.from('lancamentos').insert(sem);
  const r = await supabase.from('lancamentos').insert(dados);
  if (!erroSemOcorrido(r.error)) return r;
  temOcorrido = false;
  return supabase.from('lancamentos').insert(sem);
}
