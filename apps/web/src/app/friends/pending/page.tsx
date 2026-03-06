'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function FriendsPendingPage() {
  const router = useRouter();
  
  useEffect(() => {
    // Redirect to main friends page with pending tab
    router.replace('/friends?tab=pending');
  }, [router]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' }}>
      <div style={{ color: '#9ca3af' }}>Loading...</div>
    </div>
  );
}
