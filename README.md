# Mesada — app de mesada com regras, bônus e poupança

PWA para famílias: cada filho começa o mês com um valor de mesada, os responsáveis lançam bônus e punições do catálogo da própria família, e a sobra pode ir para uma poupança que rende uma % do CDI. Tem auditoria do que as crianças marcam, fechamento mensal, metas, objetivo de poupança, histórico e análises.

**Modelo de uso: uma cópia por família.** Cada família tem o próprio app (Vercel) e o próprio banco (Supabase). O código é o mesmo para todas; nenhum nome, valor, catálogo ou e-mail fica no código.

## Stack
- Next.js 14 (App Router) + Tailwind + TypeScript
- Supabase (Postgres, Auth, Realtime, RLS)
- Vercel (deploy) · PWA instalável no celular

## Documentos
| Arquivo | Para quê |
|---|---|
| [`docs/NOVA-FAMILIA.md`](docs/NOVA-FAMILIA.md) | Passo a passo para montar o app de uma família nova (~30 min) |
| [`docs/ATUALIZAR.md`](docs/ATUALIZAR.md) | Como publicar melhorias para todas as famílias |
| `supabase/instalar.sql` | Banco completo para família nova (gerado por `scripts/gerar-instalar.sh`) |
| `supabase/migrations/` | Mudanças de banco, em ordem; cada uma roda em todas as famílias |
| `supabase/legado/` | Arquivos da primeira família; **não** usar em famílias novas |

## Rodar localmente
```bash
cp .env.example .env.local   # URL e chave pública do Supabase da família de teste
npm install
npm run dev
```

## Regras principais
- Leitura e escrita protegidas por RLS: só quem tem login vê algo; criança vê só os próprios dados; só responsável aprova, fecha mês, edita catálogo, metas e família.
- Valor da mesada, % do CDI e primeiro mês fechável ficam em `familia_config` (editável em Catálogo → Família).
- Fechamento (`fechar_mes`): aplica o CDI uma vez, soma bônus de metas, destino da sobra (poupança ou dinheiro), saldo negativo desconta da poupança, trava o mês.
