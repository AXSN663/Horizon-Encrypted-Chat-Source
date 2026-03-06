'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { MessageCircle, UserPlus, User } from 'lucide-react';

const getFullFileUrl = (url: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${url}`;
};

type Tab = 'chats' | 'friends' | 'profile';

interface SidebarProps {
  activeTab?: Tab;
  setActiveTab?: (tab: Tab) => void;
}

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const { user } = useAuthStore();
  const { unreadMessages, pendingFriendRequests, clearPendingFriendRequests, setUnreadMessages, setPendingFriendRequests, addUnreadMessage, unreadByRoom, selectedRoom } = useChatStore();
  const { notificationsMuted } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [latestSender, setLatestSender] = useState<string>('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingPingsRef = useRef<Set<string>>(new Set());
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [mutedRooms, setMutedRooms] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mutedRooms');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    }
    return new Set();
  });
  
  // Use ref to always have latest mutedRooms in socket callbacks
  const mutedRoomsRef = useRef(mutedRooms);
  useEffect(() => {
    mutedRoomsRef.current = mutedRooms;
  }, [mutedRooms]);
  
  // Listen for muted rooms changes from RoomList
  useEffect(() => {
    const handleMutedRoomsChanged = () => {
      const saved = localStorage.getItem('mutedRooms');
      const newMuted = saved ? new Set<string>(JSON.parse(saved)) : new Set<string>();
      setMutedRooms(newMuted);
      mutedRoomsRef.current = newMuted;
    };
    window.addEventListener('muted-rooms-changed', handleMutedRoomsChanged);
    return () => window.removeEventListener('muted-rooms-changed', handleMutedRoomsChanged);
  }, []);
  
  // Use ref to always have latest selectedRoom in socket callbacks
  const selectedRoomRef = useRef(selectedRoom);
  useEffect(() => {
    selectedRoomRef.current = selectedRoom;
  }, [selectedRoom]);

  // Initialize audio
  useEffect(() => {
    audioRef.current = new Audio('/ping.mp3');
  }, []);

  // Play ping sound repeatedly for pending notifications when tab is hidden
  useEffect(() => {
    const playPendingPings = () => {
      if (!notificationsMuted && audioRef.current && pendingPingsRef.current.size > 0 && document.hidden) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
    };

    const startPingInterval = () => {
      if (pingIntervalRef.current) return;
      pingIntervalRef.current = setInterval(playPendingPings, 2000);
    };

    const stopPingInterval = () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && pendingPingsRef.current.size > 0) {
        startPingInterval();
      } else {
        stopPingInterval();
        if (!document.hidden) {
          pendingPingsRef.current.clear();
        }
      }
    };

    // Expose start function to window for notification handler to call
    (window as any).startNotificationPing = startPingInterval;

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopPingInterval();
    };
  }, [notificationsMuted]);

  // Clear pending pings when user switches to a room
  useEffect(() => {
    if (selectedRoom?.id) {
      pendingPingsRef.current.delete(selectedRoom.id);
    }
  }, [selectedRoom]);

  // Determine active tab from pathname if not provided
  const currentTab = activeTab || (pathname?.startsWith('/friends') ? 'friends' : pathname?.startsWith('/profile') ? 'profile' : 'chats');

  // Listen for real-time socket events to update notification counts
  useEffect(() => {
    const { io } = require('socket.io-client');
    const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000', {
      auth: { token: localStorage.getItem('token') }
    });

    // Increment unread count when receiving a new message notification
    socket.on('new-message-notification', (data: { senderId: string; senderName: string; roomId: string }) => {
      // Skip if message is from current user
      if (data.senderId === user?.id) return;
      
      // Skip sound and notification if user is actively viewing that room (use ref for latest value)
      if (selectedRoomRef.current?.id === data.roomId) return;
      
      // Skip if room is muted (use ref for latest value)
      if (mutedRoomsRef.current.has(data.roomId)) return;
      
      // Play notification sound if not muted
      if (!notificationsMuted && audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
        // If tab is hidden, add to pending pings for repeated notification
        if (document.hidden) {
          pendingPingsRef.current.add(data.roomId);
          if ((window as any).startNotificationPing) {
            (window as any).startNotificationPing();
          }
        }
      }
      
      setUnreadMessages(prev => prev + 1);
      addUnreadMessage(data.roomId, data.senderId, data.senderName);
      setLatestSender(data.senderName);
    });

    // Increment pending friend requests count
    socket.on('friend-request-received', () => {
      setPendingFriendRequests(prev => prev + 1);
    });

    // Listen for force logout (when password is reset on another device)
    socket.on('force-logout', ({ userId }: { userId: string }) => {
      if (userId === user?.id) {
        // Clear all local storage and redirect to login
        localStorage.removeItem('token');
        localStorage.removeItem('privateKey');
        localStorage.removeItem('currentUserId');
        localStorage.removeItem('horizon_notifications');
        window.location.href = '/';
      }
    });

    // Listen for theme updates from other sessions
    socket.on('theme-updated', ({ userId, primaryColor, secondaryColor }: { userId: string; primaryColor: string; secondaryColor: string }) => {
      if (userId === user?.id && user) {
        // Update the user in auth store to trigger theme change
        useAuthStore.getState().setUser({ ...user, primaryColor, secondaryColor });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.id, setUnreadMessages, setPendingFriendRequests, addUnreadMessage]);

  const tabs = [
    { id: 'chats' as Tab, icon: MessageCircle, label: 'Chats', path: '/chat', hasNotification: unreadMessages > 0 },
    { id: 'friends' as Tab, icon: UserPlus, label: 'Friends', path: '/friends', hasNotification: pendingFriendRequests > 0 },
    { id: 'profile' as Tab, icon: User, label: 'Profile', path: '/profile', hasNotification: false },
  ];

  const handleTabClick = (tab: Tab, path: string) => {
    if (setActiveTab) {
      setActiveTab(tab);
    }
    // Only clear friend requests when clicking the Friends tab
    // Chat notifications are cleared when clicking on specific chats with unread messages
    if (tab === 'friends') clearPendingFriendRequests();
    router.push(path);
  };

  const primaryBg = user?.primaryColor || '#0f172a';
  const secondaryBg = user?.secondaryColor || '#1e293b';

  return (
    <div style={{ width: '70px', height: '100%', backgroundColor: primaryBg, borderRight: `1px solid ${secondaryBg}`, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0' }}>
      {/* Logo */}
      <div style={{ width: '44px', height: '44px', backgroundColor: secondaryBg, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', cursor: 'pointer', border: `2px solid ${secondaryBg}`, overflow: 'hidden' }} onClick={() => router.push('/chat')}>
        <img src="/logo.png" alt="Horizon" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id, tab.path)}
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isActive ? secondaryBg : 'transparent',
                color: isActive ? 'white' : '#94a3b8',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
                position: 'relative',
              }}
              title={tab.label}
            >
              <Icon size={24} />
              {/* Notification badge with ! */}
              {tab.hasNotification && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '-4px',
                    right: '-4px',
                    width: '20px',
                    height: '20px',
                    backgroundColor: '#ef4444',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    color: 'white',
                    border: '3px solid #0f172a',
                  }}
                >
                  !
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* User Avatar */}
      <div style={{ marginTop: '16px' }}>
        {user?.pfpUrl ? (
          <img
            src={getFullFileUrl(user.pfpUrl)}
            alt=""
            style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: secondaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={20} style={{ color: 'white' }} />
          </div>
        )}
      </div>
    </div>
  );
}
