'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ChatWithIdPage({ params }: { params: { username: string } }) {
  const router = useRouter();
  const id = params.username;
  
  useEffect(() => {
    // Check if it's a room ID (UUID format) or username
    const isRoomId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    if (isRoomId) {
      // It's a room ID, redirect to chat with room param
      router.replace(`/chat?room=${encodeURIComponent(id)}`);
    } else {
      // It's a username, redirect to chat with user param
      router.replace(`/chat?user=${encodeURIComponent(id)}`);
    }
  }, [id, router]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' }}>
      <div style={{ color: '#9ca3af' }}>Loading...</div>
    </div>
  );
}
