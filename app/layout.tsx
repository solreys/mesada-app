import './globals.css';
import type { Metadata, Viewport } from 'next';
import NavBar from '@/components/NavBar';

export const metadata: Metadata = {
  title: 'Mesada Zon & Ettore',
  description: 'App dinâmico de mesada com regras, benefícios e punições',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#020617',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-slate-950 text-slate-100 min-h-screen">
        {children}
        <NavBar />
      </body>
    </html>
  );
}
