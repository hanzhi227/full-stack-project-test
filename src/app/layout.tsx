import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Ask your documents', description: 'Answers grounded in your handbook, with passages you can check.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
