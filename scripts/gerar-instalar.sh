#!/usr/bin/env bash
# Gera supabase/instalar.sql: banco completo para uma família nova, sem dados de nenhuma família.
# Rode sempre que criar uma migration nova:  bash scripts/gerar-instalar.sh
set -euo pipefail
cd "$(dirname "$0")/.."
saida=supabase/instalar.sql
{
  echo "-- ============================================================"
  echo "-- INSTALAÇÃO COMPLETA — Mesada (banco novo de uma família)"
  echo "-- Gerado por scripts/gerar-instalar.sh. Não edite à mão."
  echo "-- Supabase → SQL Editor → cole tudo → Run. Rode uma vez só, em projeto vazio."
  echo "-- ============================================================"
  for f in supabase/schema.sql supabase/rendimento_mensal.sql supabase/migrations/*.sql; do
    echo
    echo "-- >>> $f"
    if [[ "$f" == *"_area_icone.sql" ]]; then
      # Só a estrutura: a proposta de áreas/ícones é do catálogo de uma família específica.
      sed '/^with proposta/,$d' "$f"
    else
      cat "$f"
    fi
  done
} > "$saida"
echo "Gerado $saida ($(wc -l < "$saida") linhas)"
