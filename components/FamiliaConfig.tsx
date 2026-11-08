'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import type { Perfil } from '@/lib/types';
import { formatarReal, lerValor } from '@/lib/calculos';
import { PALETA_CORES, VERSAO_BANCO_APP, corCrianca, nomeApp, pctCdi, valorMesada, versaoBanco } from '@/lib/familia';

type Membro = Perfil & { cor?: string | null };

// Configuração da família (só responsáveis): mesada, CDI, membros e versão do banco.
export default function FamiliaConfig() {
  const [membros, setMembros] = useState<Membro[]>([]);
  const [cfg, setCfg] = useState({ nome: '', valor: '', pct: '' });
  const [novo, setNovo] = useState({ email: '', nome: '', papel: 'crianca' as 'crianca' | 'responsavel', cor: PALETA_CORES[0] });
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);

  async function carregar() {
    const supabase = supabaseBrowser();
    const [m, c] = await Promise.all([
      supabase.from('perfis').select('*').order('papel').order('criado_em'),
      supabase.from('familia_config').select('*').eq('id', 1).maybeSingle(),
    ]);
    setMembros(m.data ?? []);
    // Sugere a primeira cor ainda não usada por uma criança.
    const usadas = new Set((m.data ?? []).filter((x) => x.papel === 'crianca').map((x) => x.cor ?? corCrianca(x.id)));
    setNovo((n) => ({ ...n, cor: PALETA_CORES.find((c) => !usadas.has(c)) ?? PALETA_CORES[0] }));
    setCfg({
      nome: c.data?.nome ?? '',
      valor: String(c.data?.valor_mesada ?? valorMesada()).replace('.', ','),
      pct: String(c.data?.pct_cdi ?? pctCdi()).replace('.', ','),
    });
  }

  useEffect(() => {
    carregar();
  }, []);

  async function salvarConfig() {
    const valor = lerValor(cfg.valor);
    const pct = lerValor(cfg.pct);
    if (isNaN(valor) || valor <= 0) return setMsg({ texto: 'Valor da mesada inválido.', erro: true });
    if (isNaN(pct) || pct < 0 || pct > 200) return setMsg({ texto: '% do CDI entre 0 e 200.', erro: true });
    const { error } = await supabaseBrowser()
      .from('familia_config')
      .update({ nome: cfg.nome.trim() || null, valor_mesada: valor, pct_cdi: pct, atualizado_em: new Date().toISOString() })
      .eq('id', 1);
    if (error) return setMsg({ texto: 'Não foi possível salvar (o banco pode estar desatualizado).', erro: true });
    window.location.reload(); // o app relê a configuração
  }

  async function mudarMembro(id: string, mudancas: Partial<Membro>) {
    const { error } = await supabaseBrowser().from('perfis').update(mudancas).eq('id', id);
    if (error) return setMsg({ texto: 'Não foi possível salvar.', erro: true });
    window.location.reload();
  }

  async function adicionar() {
    if (!novo.email.trim() || !novo.nome.trim()) return setMsg({ texto: 'Informe e-mail e nome.', erro: true });
    const { error } = await supabaseBrowser().rpc('vincular_membro', {
      p_email: novo.email.trim(),
      p_nome: novo.nome.trim(),
      p_papel: novo.papel,
      p_cor: novo.papel === 'crianca' ? novo.cor : null,
    });
    if (error) return setMsg({ texto: error.message, erro: true });
    window.location.reload();
  }

  const desatualizado = versaoBanco() < VERSAO_BANCO_APP;

  return (
    <section id="familia" className="rounded-2xl bg-slate-900 p-4 border border-slate-800 space-y-4">
      <h3 className="text-sm uppercase tracking-wide text-slate-400">Família</h3>

      {desatualizado && (
        <p className="rounded-lg bg-amber-950/50 border border-amber-800 px-3 py-2 text-xs text-amber-200">
          O banco está na versão {versaoBanco()} e o app espera a {VERSAO_BANCO_APP}. Peça a quem instalou para rodar a
          atualização do banco (docs/ATUALIZAR.md).
        </p>
      )}

      <div className="space-y-2">
        <input
          value={cfg.nome}
          onChange={(e) => setCfg({ ...cfg, nome: e.target.value })}
          placeholder={`Nome no app (hoje: ${nomeApp()})`}
          className="w-full rounded-lg bg-slate-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2 text-sm">
          <label className="flex-1">
            <span className="text-xs text-slate-400">Mesada por mês (R$)</span>
            <input
              value={cfg.valor}
              onChange={(e) => setCfg({ ...cfg, valor: e.target.value })}
              inputMode="decimal"
              className="w-full rounded-lg bg-slate-800 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="flex-1">
            <span className="text-xs text-slate-400">Poupança rende (% do CDI)</span>
            <input
              value={cfg.pct}
              onChange={(e) => setCfg({ ...cfg, pct: e.target.value })}
              inputMode="decimal"
              className="w-full rounded-lg bg-slate-800 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
        </div>
        <button onClick={salvarConfig} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white">
          Salvar
        </button>
        <p className="text-[11px] text-slate-500">
          Hoje: {formatarReal(valorMesada())} por mês, poupança a {pctCdi()}% do CDI. Mudanças valem para os próximos fechamentos.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-400 mb-1">Membros</p>
        <ul className="divide-y divide-slate-800">
          {membros.map((m) => (
            <li key={m.id} className="flex items-center gap-2 py-2 text-sm">
              {m.papel === 'crianca' ? (
                <select
                  value={m.cor ?? corCrianca(m.id)}
                  onChange={(e) => mudarMembro(m.id, { cor: e.target.value })}
                  aria-label="Cor"
                  className="h-7 w-10 rounded bg-slate-800 text-xs"
                  style={{ color: m.cor ?? corCrianca(m.id) }}
                >
                  {PALETA_CORES.map((c) => (
                    <option key={c} value={c} style={{ color: c }}>
                      ●
                    </option>
                  ))}
                </select>
              ) : (
                <span className="w-10 text-center">👤</span>
              )}
              <span className="flex-1">{m.nome}</span>
              <span className="text-xs text-slate-400">{m.papel === 'crianca' ? 'criança' : 'responsável'}</span>
              {!m.auth_user_id && <span className="text-[10px] text-amber-300">sem login</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-2">
        <p className="text-xs font-semibold text-slate-400">Adicionar membro</p>
        <p className="text-[11px] text-slate-500">
          1º crie o login (e-mail e senha) em Supabase → Authentication → Users → Add user. A senha é definida por vocês. 2º
          cadastre aqui o mesmo e-mail. Para crianças, o e-mail pode ser qualquer um que vocês controlem; elas entram tocando no
          nome.
        </p>
        <div className="flex gap-1 rounded-lg bg-slate-800 p-1 text-xs">
          {(['crianca', 'responsavel'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setNovo({ ...novo, papel: p })}
              className={`flex-1 rounded-md py-1.5 font-semibold ${novo.papel === p ? 'bg-slate-600' : 'text-slate-300'}`}
            >
              {p === 'crianca' ? 'Criança' : 'Responsável'}
            </button>
          ))}
        </div>
        <input
          value={novo.nome}
          onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
          placeholder="Nome (aparece no app)"
          className="w-full rounded-lg bg-slate-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          value={novo.email}
          onChange={(e) => setNovo({ ...novo, email: e.target.value })}
          type="email"
          placeholder="E-mail do login"
          className="w-full rounded-lg bg-slate-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
        {novo.papel === 'crianca' && (
          <div className="flex gap-2">
            {PALETA_CORES.map((c) => (
              <button
                key={c}
                onClick={() => setNovo({ ...novo, cor: c })}
                aria-label={`Cor ${c}`}
                className={`h-7 w-7 rounded-full ${novo.cor === c ? 'ring-2 ring-offset-2 ring-offset-slate-950 ring-slate-50' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}
        <button onClick={adicionar} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white">
          Adicionar membro
        </button>
      </div>

      {msg && <p className={`text-xs ${msg.erro ? 'text-red-400' : 'text-emerald-400'}`}>{msg.texto}</p>}
    </section>
  );
}
