'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';

interface Ponto {
  data: string;
  saldo: number;
}

export default function GraficoEvolucao({
  pontos,
  cor,
  referencia,
}: {
  pontos: Ponto[];
  cor: string;
  referencia?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={pontos} margin={{ left: -10, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="data" stroke="#64748b" fontSize={12} />
        <YAxis stroke="#64748b" fontSize={12} domain={['auto', 'auto']} />
        {referencia !== undefined && <ReferenceLine y={referencia} stroke="#475569" strokeDasharray="4 4" />}
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
          formatter={(v: number) => [v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 'Saldo']}
        />
        <Line type="stepAfter" dataKey="saldo" stroke={cor} strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
