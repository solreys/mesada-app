# Montar o app para uma família nova

Tempo: ~30 min. Custo: planos gratuitos do Supabase e da Vercel (confira os limites atuais nos sites; projetos gratuitos do Supabase podem ser pausados por inatividade).

Quem faz: você (quem dá suporte), com a família por perto para criar as senhas. **Você não define nem anota senhas da família.**

## 1. Banco (Supabase) — conta da família
1. A família cria uma conta em https://supabase.com (pode ser com o e-mail de um dos responsáveis). Assim o banco é dela.
2. **New project** → nome (ex.: `mesada`) → região **South America (São Paulo)** → senha do banco (a família guarda).
3. Quando o projeto ficar pronto: **SQL Editor** → cole todo o conteúdo de `supabase/instalar.sql` → **Run**.
   - Esperado: "Success". Rode **uma vez só**, em projeto vazio.
4. **Project Settings → API**: anote a **Project URL** e a chave **publishable / anon** (é pública, vai no app). Não use a `service_role`.

## 2. Logins (Supabase → Authentication → Users → Add user)
Crie um usuário para cada pessoa, com e-mail e senha **digitados pela família**:
- os responsáveis (e-mail real de cada um);
- cada criança (pode ser um e-mail que os pais controlem; a criança entra tocando no próprio nome).

Se aparecer a opção de confirmar o usuário automaticamente, marque — senão o login só funciona depois de confirmar o e-mail.

## 3. App (Vercel) — na sua conta, ligado ao mesmo repositório
1. https://vercel.com → **Add New → Project** → importe o repositório `mesada-app`.
2. **Project Name**: vira o endereço (ex.: `mesada-silva` → `mesada-silva.vercel.app`).
3. **Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL da família
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = chave publishable/anon da família
4. **Deploy**. Pronto: cada `git push` no `main` atualiza esta família também.

## 4. Primeiro acesso (no celular de um responsável)
1. Abra o endereço → **Sou responsável** → e-mail e senha.
2. Tela **Bem-vindo**: seu nome, nome da família (opcional), valor da mesada e % do CDI → **Configurar família**.
3. Em **Catálogo → Família → Adicionar membro**: cadastre cada criança e o outro responsável com o **mesmo e-mail** criado no passo 2.
4. Em **Catálogo**: criem as punições e os bônus de vocês (começa vazio). Dá para importar planilha CSV.
5. Instale no celular: Android → menu ⋮ → "Adicionar à tela inicial"; iPhone → compartilhar → "Adicionar à Tela de Início".
6. Mostre a tela **Como funciona** (link no topo do Painel).

## 5. Anote no seu controle (fora do repositório)
Família · endereço Vercel · projeto Supabase · data da instalação · versão do banco (Catálogo → Família mostra se está atrás).
