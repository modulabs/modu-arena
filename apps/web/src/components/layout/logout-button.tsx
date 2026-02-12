'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  return (
    <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Sign out">
      <LogOut className="h-4 w-4" />
    </Button>
  );
}
