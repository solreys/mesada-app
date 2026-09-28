import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mesada Zon & Ettore',
  description: 'App dinâmico de mesada com regras, benefícios e punições',
  manifest: '/manifest.json',
  themeColor: '#2563eb',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-slate-950 text-slate-100 min-h-screen">{children}</body>
    </html>
  );
}
