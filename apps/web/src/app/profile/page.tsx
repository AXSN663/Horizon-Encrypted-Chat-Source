'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import Sidebar from '@/components/Sidebar';
import ProfilePanel from '@/components/ProfilePanel';

export default function ProfilePage() {
  const router = useRouter();
  const { isAuthenticated, checkAuth, user } = useAuthStore();
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

  const primaryBg = user?.primaryColor || '#0f172a';

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
      <Sidebar activeTab="profile" />
      
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <ProfilePanel />
      </div>
    </div>
  );
}
