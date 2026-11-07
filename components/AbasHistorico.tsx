// Abas no topo de Histórico e Análise.
export default function AbasHistorico({ ativa }: { ativa: 'historico' | 'analise' }) {
  const abas = [
    { id: 'historico', href: '/historico', rotulo: 'Histórico' },
    { id: 'analise', href: '/analise', rotulo: 'Análise' },
  ];
  return (
    <nav className="flex gap-6 border-b border-slate-800">
      {abas.map((a) => (
        <a
          key={a.id}
          href={a.href}
          className={`-mb-px pb-2 text-xl font-bold ${
            ativa === a.id ? 'border-b-2 border-blue-500 text-slate-50' : 'text-slate-500'
          }`}
        >
          {a.rotulo}
        </a>
      ))}
    </nav>
  );
}
