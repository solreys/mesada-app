// Configuração da família, lida do banco (tabela familia_config + perfis).
// Nada de nomes, valores ou cores fixos no código: cada família tem o seu banco.
import type { SupabaseClient } from '@supabase/supabase-js';

// Versão do banco que este código espera (familia_config.versao_banco). Suba junto com cada migration nova.
export const VERSAO_BANCO_APP = 1;

const PALETA = ['#2563eb', '#16a34a', '#d946ef', '#f59e0b', '#06b6d4', '#ef4444'];

interface Estado {
  nome: string | null;
  valorMesada: number;
  pctCdi: number;
  primeiroMes: string; // 'AAAA-MM' ou '' (sem restrição)
  versaoBanco: number;
  cores: Record<string, string>; // por nome e por id da criança
  criancas: string[]; // nomes, na ordem de cadastro
}

const estado: Estado = {
  nome: null,
  valorMesada: 120,
  pctCdi: 100,
  primeiroMes: '',
  versaoBanco: 0,
  cores: {},
  criancas: [],
};

export async function carregarFamilia(supabase: SupabaseClient): Promise<void> {
  const [cfg, kids] = await Promise.all([
    supabase.from('familia_config').select('*').eq('id', 1).maybeSingle(),
    supabase.from('perfis').select('*').eq('papel', 'crianca').order('criado_em'),
  ]);
  if (cfg.data) {
    estado.nome = cfg.data.nome ?? null;
    estado.valorMesada = Number(cfg.data.valor_mesada ?? 120);
    estado.pctCdi = Number(cfg.data.pct_cdi ?? 100);
    estado.primeiroMes = cfg.data.primeiro_mes_fechamento ? String(cfg.data.primeiro_mes_fechamento).slice(0, 7) : '';
    estado.versaoBanco = Number(cfg.data.versao_banco ?? 0);
  }
  estado.cores = {};
  estado.criancas = [];
  (kids.data ?? []).forEach((k: { id: string; nome: string; cor?: string | null }, i: number) => {
    const cor = k.cor || PALETA[i % PALETA.length];
    estado.cores[k.nome] = cor;
    estado.cores[k.id] = cor;
    estado.criancas.push(k.nome);
  });
}

export const valorMesada = () => estado.valorMesada;
export const pctCdi = () => estado.pctCdi;
export const primeiroMesFechamento = () => estado.primeiroMes;
export const versaoBanco = () => estado.versaoBanco;
export const corCrianca = (nomeOuId: string | undefined | null) => (nomeOuId && estado.cores[nomeOuId]) || '#64748b';
// Título do app: nome da família, ou "Mesada Fulano & Ciclano".
export const nomeApp = () => estado.nome || (estado.criancas.length ? `Mesada ${estado.criancas.join(' & ')}` : 'Mesada');
export const PALETA_CORES = PALETA;
