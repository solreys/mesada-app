'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface Ponto {
  data: string;
  saldo: number;
}

export default function GraficoEvolucao({ pontos, cor }: { pontos: Ponto[]; cor: string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={pontos}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="data" stroke="#64748b" fontSize={12} />
        <YAxis stroke="#64748b" fontSize={12} />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
          formatter={(v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        />
        <Line type="monotone" dataKey="saldo" stroke={cor} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
