# App de Mesada — Zon & Ettore

PWA dinâmica: regras, punições, bônus, saldo em tempo real, poupança com rendimento mensal (100% CDI), sincronizada entre todos os dispositivos.

## Stack
- Next.js 14 + Tailwind
- Supabase (Postgres + Auth + Realtime) — free tier
- Deploy: Vercel — free tier
- PWA: next-pwa (instalável em celular e computador)

---

## Passo 1 — Criar o projeto Supabase

1. Crie conta em https://supabase.com (grátis).
2. **New project** → dê um nome (ex: `mesada-familia`) → escolha região `South America (São Paulo)` → defina uma senha de banco.
3. Aguarde o provisionamento (~2 min).
4. Vá em **SQL Editor** → cole o conteúdo de `supabase/schema.sql` → **Run**.
5. Ainda no SQL Editor, cole `supabase/rendimento_mensal.sql` → **Run**.
6. Abra `supabase/seed.sql`, ajuste a taxa CDI (`0.90` é só exemplo — pegue a taxa real do mês) → cole e rode no SQL Editor.
7. Em **Database → Extensions**, ative `pg_cron` (para o rendimento rodar sozinho todo mês). Depois volte ao SQL Editor e rode o bloco comentado `cron.schedule(...)` do fim de `rendimento_mensal.sql` (descomente as 3 linhas antes de rodar).
8. Em **Authentication → Users**, crie um usuário para cada responsável (e-mail + senha).
9. No SQL Editor, vincule cada login ao perfil de responsável:
   ```sql
   insert into perfis (auth_user_id, nome, papel)
   values ('UID-DO-USUARIO-AQUI', 'Nome do Responsável', 'responsavel');
   ```
   (o UID aparece na lista de Authentication → Users, ao clicar no usuário)
10. Em **Project Settings → API**, copie `Project URL` e `anon public key`.

## Passo 2 — Rodar localmente (opcional, para testar antes do deploy)

```bash
cp .env.example .env.local
# cole a URL e a anon key copiadas no passo 1.10
npm install
npm run dev
```
Abra http://localhost:3000

## Passo 3 — Deploy no Vercel

1. Suba esta pasta para um repositório no GitHub (crie um repo vazio e faça `git push`).
2. Em https://vercel.com → **Add New → Project** → importe o repositório.
3. Em **Environment Variables**, adicione `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (os mesmos do `.env.local`).
4. **Deploy**. Em ~1 min você tem uma URL pública (ex: `mesada-familia.vercel.app`).

## Passo 4 — Instalar como app (PWA)

**Celular (Android/Chrome):** abra a URL → menu (⋮) → "Adicionar à tela inicial".
**iPhone (Safari):** abra a URL → ícone de compartilhar → "Adicionar à Tela de Início".
**Computador (Chrome/Edge):** abra a URL → ícone de instalação na barra de endereço → "Instalar".

## Uso mensal
- **Lançar pontos:** responsável loga → botão "+ Lançar" → escolhe criança → escolhe regra/bônus → confirma. Saldo atualiza na hora em todos os aparelhos.
- **Poupar:** (a implementar na Fase seguinte, se quiser) transferir do saldo do mês para a poupança, que rende automaticamente todo dia 1.
- **Taxa CDI:** atualize em `/config` todo início de mês (não há API automática do Banco Central configurada nesta versão — ver "Próximos passos").

## Próximos passos sugeridos
- Botão de "guardar na poupança" na tela do dashboard (tabela `transferencias_poupanca` já existe no schema, falta a UI).
- Busca automática da taxa CDI via API do Banco Central (série SGS 4391) — elimina a atualização manual.
- Tela de login simplificada para as crianças verem o próprio saldo (hoje o dashboard é aberto, sem exigir login).
- Notificação push quando um lançamento é feito.
