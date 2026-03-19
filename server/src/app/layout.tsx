import type { Metadata } from "next";
import "./globals.css";

import Link from 'next/link';

export const metadata: Metadata = {
  title: "SimpleClaw",
  description: "Agentic Management Cluster",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <nav className="p-4 border-b border-[#333] flex gap-4 bg-[#1a1a1a]">
          <Link href="/" className="text-[#00E5CC] no-underline font-bold">Dashboard</Link>
          <Link href="/keys" className="text-[#00E5CC] no-underline font-bold">Keys</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
