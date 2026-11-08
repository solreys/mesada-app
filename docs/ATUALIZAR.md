# Publicar melhorias para todas as famílias

## Só código (telas, textos, cálculos no app)
1. Faça a mudança, rode `npm run build` e junte no `main`.
2. A Vercel publica sozinha em **todos** os projetos ligados ao repositório (~2 min).

## Mudança no banco (tabela, coluna, função, regra de acesso)
1. Crie um arquivo novo em `supabase/migrations/` (data no nome, ex.: `20261201000000_algo.sql`). Ele precisa ser **idempotente** (rodar 2× não quebra).
2. No fim do arquivo, suba a versão:
   ```sql
   update familia_config set versao_banco = greatest(versao_banco, N) where id = 1;
   ```
   e no código suba `VERSAO_BANCO_APP` para `N` em `lib/familia.ts`.
3. Regere o instalador: `bash scripts/gerar-instalar.sh` (famílias novas já nascem atualizadas).
4. **Antes** de juntar no `main`: rode o arquivo novo no **SQL Editor de cada família** (Supabase dela → SQL Editor → colar → Run).
   - O app mostra para os responsáveis um aviso amarelo enquanto o banco estiver atrás da versão do código.
   - Prefira código que continue funcionando com o banco antigo (ver `lib/compat.ts`), para não depender da ordem.
5. Junte no `main`.

## Conferir uma família
Catálogo → Família: mostra a versão do banco e avisa se está desatualizada.

## Histórico de versões do banco
| Versão | Migration | O que trouxe |
|---|---|---|
| 1 | `20261112000000_familia.sql` | Configuração por família, primeiro acesso, login infantil dinâmico, cores por criança |
