import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MadaCash Flow',
  description: 'Plateforme de gestion des créances et des encaissements B2B',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
