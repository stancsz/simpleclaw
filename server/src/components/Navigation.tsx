import React from 'react';
import Link from 'next/link';

export default function Navigation() {
  return (
    <nav className="p-4 border-b border-[#333] flex gap-4 bg-[#1a1a1a]">
      <Link href="/" className="text-[#00E5CC] no-underline font-bold">Dashboard</Link>
      <Link href="/settings/keys" className="text-[#00E5CC] no-underline font-bold">API Keys</Link>
    </nav>
  );
}
