import './globals.css';
import type { Metadata, Viewport } from 'next';
import NavBar from '@/components/NavBar';
import FamiliaProvider from '@/components/FamiliaProvider';

export const metadata: Metadata = {
  title: 'Mesada',
  description: 'App dinâmico de mesada com regras, benefícios e punições',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-slate-950 text-slate-100 min-h-screen">
        <FamiliaProvider>
          {children}
          <NavBar />
        </FamiliaProvider>
      </body>
    </html>
  );
}
