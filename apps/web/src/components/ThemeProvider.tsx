'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();

  useEffect(() => {
    // Apply theme colors from user settings
    const primaryColor = user?.primaryColor || '#0f172a';
    const secondaryColor = user?.secondaryColor || '#1e293b';
    
    document.documentElement.style.setProperty('--primary-bg', primaryColor);
    document.documentElement.style.setProperty('--secondary-bg', secondaryColor);
    
    // Apply primary color to main background
    document.body.style.backgroundColor = primaryColor;
  }, [user?.primaryColor, user?.secondaryColor]);

  return <>{children}</>;
}
