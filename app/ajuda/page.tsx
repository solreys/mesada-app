'use client';

import { SALDO_INICIAL_MES, formatarReal } from '@/lib/calculos';
import { usePerfil } from '@/lib/usePerfil';

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-2">
      <h2 className="font-semibold">{titulo}</h2>
      <div className="text-sm text-slate-300 space-y-2 leading-relaxed">{children}</div>
    </section>
  );
}

// Guia do app para pais e crianças. Texto fixo: nenhum dado é lido aqui.
export default function AjudaPage() {
  const { perfil } = usePerfil(true);
  const souCrianca = perfil?.papel === 'crianca';
  const base = formatarReal(SALDO_INICIAL_MES);

  return (
    <main className="max-w-2xl mx-auto p-4 pb-28 space-y-4">
      <header className="pt-4">
        <h1 className="text-xl font-bold">Como funciona</h1>
        <p className="text-sm text-slate-400">Mesada Zon &amp; Ettore</p>
      </header>

      <Bloco titulo="💰 A mesada">
        <p>
          Todo mês começa em <strong>{base}</strong>. Bônus somam, punições descontam. O valor do mês aparece no Painel, com a
          carinha 😄🙂😐😟😣 e a barra de quanto sobrou.
        </p>
        <p>A poupança é separada: rende 100% do CDI uma vez por mês, no fechamento.</p>
      </Bloco>

      {souCrianca ? (
        <Bloco titulo="✋ O que você pode fazer">
          <p>
            <strong>Lançar:</strong> marque o que aconteceu. Fica <em>aguardando aprovação</em> até papai ou mamãe conferir.
          </p>
          <p>
            <strong>Meu objetivo:</strong> no Painel, crie o que você quer comprar e veja quanto falta na poupança.
          </p>
          <p>
            <strong>Metas:</strong> no Painel aparecem as metas do mês. Cumpriu, ganha o bônus no fechamento.
          </p>
          <p>
            <strong>Histórico e Análise:</strong> veja como foi cada mês e o que está melhorando. Você só vê os seus dados; do seu
            irmão, só a posição no ranking.
          </p>
        </Bloco>
      ) : (
        <>
          <Bloco titulo="✋ Lançar e auditar">
            <p>
              <strong>Pais:</strong> um toque lança e já vale. Errou? “Desfazer” no aviso (vira um estorno no extrato). Em
              “Aconteceu”, dá para dizer que foi há 1h, 3h ou ontem; isso só muda as análises, o dinheiro conta no dia do
              registro.
            </p>
            <p>
              <strong>Crianças:</strong> o que elas marcam fica pendente e aparece no topo do Painel. ✓ aceita, ✕ retira.
            </p>
          </Bloco>

          <Bloco titulo="📅 Fechamento do mês (dia 1º em diante)">
            <ol className="list-decimal pl-5 space-y-1">
              <li>Resolva os pendentes (o fechamento não deixa passar com item pendente).</li>
              <li>Toque no aviso azul do Painel ou em Catálogo → Fechamento do mês.</li>
              <li>Informe o CDI do mês que terminou (% no mês, ex.: 1,08).</li>
              <li>Para cada criança: sobra vai para a poupança ou é paga em dinheiro.</li>
            </ol>
            <p>
              Saldo negativo é descontado da poupança. O rendimento é aplicado uma única vez, o mês fica travado e a mesada volta
              a {base}. Depois, o <strong>relatório do mês</strong> fica disponível para imprimir ou copiar.
            </p>
          </Bloco>

          <Bloco titulo="🎯 Metas">
            <p>
              Em Catálogo → Metas do mês: escolha a criança (ou as duas), um item ou uma área, o limite e o bônus. Ex.: “Gritar
              (forte) no máximo 2× → +R$ 5,00”. Vale a partir do mês em que foi criada; estorno não conta.
            </p>
          </Bloco>

          <Bloco titulo="📋 Catálogo">
            <p>
              Edite descrição, valor, ícone e área direto na lista. Desmarcar “Ativo” tira o item da tela de lançamento sem apagar
              o histórico. Dá para baixar e importar em planilha (CSV, abre no Excel).
            </p>
          </Bloco>
        </>
      )}

      <Bloco titulo="📊 Histórico e Análise">
        <p>
          <strong>Histórico:</strong> resultado de cada mês, poupança e quantas vezes cada item aconteceu.
        </p>
        <p>
          <strong>Análise:</strong> compara os últimos 14, 30 ou 60 dias com o período anterior: o que mais acontece, o que
          melhorou ou piorou, áreas, punições que andam juntas, dias da semana e projeção do mês. Os “pontos de atenção” são
          regras simples sobre esses números, não uma avaliação da criança.
        </p>
      </Bloco>

      <Bloco titulo="🔒 Privacidade">
        <p>
          Só entra quem tem login. Cada criança vê apenas os próprios dados; os pais veem tudo. Os dados ficam no banco da
          família (Supabase) e não são enviados a outros serviços.
        </p>
      </Bloco>
    </main>
  );
}
