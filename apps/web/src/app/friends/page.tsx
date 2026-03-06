'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import Sidebar from '@/components/Sidebar';
import FriendsPanel from '@/components/FriendsPanel';

export default function FriendsPage() {
  const router = useRouter();
  const { isAuthenticated, checkAuth, user } = useAuthStore();
  const { setSelectedRoom } = useChatStore();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const init = async () => {
      await checkAuth();
      setIsChecking(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!isChecking && isAuthenticated === false) {
      router.push('/');
    }
  }, [isAuthenticated, isChecking, router]);

  const handleStartChat = (friend: any) => {
    setSelectedRoom(null);
    router.push('/chat');
  };

  const primaryBg = user?.primaryColor || '#0f172a';
  const secondaryBg = user?.secondaryColor || '#1e293b';

  // Show loading while checking auth or if not authenticated yet
  if (isChecking || (!user && isAuthenticated !== false)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: primaryBg }}>
        <div style={{ color: '#9ca3af' }}>Loading...</div>
      </div>
    );
  }

  // Don't render if not authenticated
  if (isAuthenticated === false) {
    return null;
  }

  return (
    <div style={{ height: '100vh', display: 'flex', backgroundColor: primaryBg }}>
      <Sidebar activeTab="friends" />
      
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: '320px' }}>
          <FriendsPanel onStartChat={handleStartChat} />
        </div>
        
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: primaryBg }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '80px', height: '80px', backgroundColor: `${secondaryBg}33`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <span style={{ fontSize: '32px' }}>👥</span>
            </div>
            <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
              Your Friends
            </h2>
            <p style={{ color: '#9ca3af' }}>
              Select a friend to start chatting
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
