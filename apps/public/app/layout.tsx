import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Connect',
  description: 'A personal connection flow.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
