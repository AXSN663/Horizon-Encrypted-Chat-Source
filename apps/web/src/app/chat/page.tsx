'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { roomAPI } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import RoomList from '@/components/RoomList';
import ChatArea from '@/components/ChatArea';

function ChatPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, checkAuth, user } = useAuthStore();
  const { selectedRoom, setSelectedRoom, rooms, setRooms } = useChatStore();
  const [showChat, setShowChat] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [hasRestoredChat, setHasRestoredChat] = useState(false);

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

  // Restore last opened chat when rooms are loaded (only on initial load)
  useEffect(() => {
    if (!hasRestoredChat && rooms.length > 0 && !selectedRoom && !searchParams.get('user') && !showChat) {
      const lastRoomId = localStorage.getItem('lastOpenedChat');
      if (lastRoomId) {
        const lastRoom = rooms.find(r => r.id === lastRoomId);
        if (lastRoom) {
          setSelectedRoom(lastRoom);
          setShowChat(true);
        }
      }
      setHasRestoredChat(true);
    }
  }, [rooms, hasRestoredChat, selectedRoom, searchParams, setSelectedRoom, showChat]);

  // Save last opened chat when selectedRoom changes
  useEffect(() => {
    if (selectedRoom) {
      localStorage.setItem('lastOpenedChat', selectedRoom.id);
    }
  }, [selectedRoom]);

  // Handle ?user=username or ?room=roomId query param to start chat
  useEffect(() => {
    const username = searchParams.get('user');
    const roomId = searchParams.get('room');
    
    if (username && isAuthenticated && rooms.length > 0) {
      startChatWithUser(username);
    } else if (roomId && isAuthenticated && rooms.length > 0) {
      startChatWithRoom(roomId);
    }
  }, [searchParams, isAuthenticated, rooms]);

  const startChatWithUser = async (username: string) => {
    try {
      // First get user by username
      const res = await fetch(`/api/auth/user/${encodeURIComponent(username)}`);
      if (!res.ok) return;
      const data = await res.json();
      const targetUser = data.user;
      
      if (!targetUser) return;

      // Check if DM already exists
      const existingRoom = rooms.find(r => 
        r.type === 'DM' && r.members.some(m => m.user.id === targetUser.id)
      );

      if (existingRoom) {
        setSelectedRoom(existingRoom);
        setShowChat(true);
      } else {
        // Create new DM
        const response = await roomAPI.createDM(targetUser.id);
        if (response.data.room) {
          setRooms([response.data.room, ...rooms]);
          setSelectedRoom(response.data.room);
          setShowChat(true);
        }
      }
      
      // Clear the query param
      router.replace('/chat');
    } catch (error) {
      console.error('Failed to start chat:', error);
    }
  };

  const startChatWithRoom = async (roomId: string) => {
    try {
      // Find the room in existing rooms
      const existingRoom = rooms.find(r => r.id === roomId);

      if (existingRoom) {
        setSelectedRoom(existingRoom);
        setShowChat(true);
      }
      
      // Clear the query param
      router.replace('/chat');
    } catch (error) {
      console.error('Failed to start chat with room:', error);
    }
  };

  const handleSelectRoom = useCallback(() => {
    setShowChat(true);
  }, []);

  const handleBackToList = () => {
    setShowChat(false);
    setSelectedRoom(null);
  };

  const primaryBg = user?.primaryColor || '#0f172a';
  const secondaryBg = user?.secondaryColor || '#1e293b';

  if (isAuthenticated === null) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: primaryBg }}>
        <div style={{ color: '#9ca3af' }}>Loading...</div>
      </div>
    );
  }

  // Show loading while checking auth
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
      <Sidebar />
      
      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Chat List - hidden on mobile when chat is open */}
        <div className="chat-list" style={{ width: '320px', display: showChat ? 'none' : 'block' }}>
          <RoomList onSelectRoom={handleSelectRoom} />
        </div>
        
        {/* Chat View */}
        <div className="chat-view" style={{ flex: 1, display: !showChat ? 'none' : 'block' }}>
          <ChatArea />
        </div>
        
        {/* Empty state when no chat selected and no last chat to restore */}
        {!showChat && hasRestoredChat && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: primaryBg }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '80px', height: '80px', backgroundColor: secondaryBg, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <span style={{ fontSize: '32px' }}>💬</span>
              </div>
              <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
                Select a chat
              </h2>
              <p style={{ color: '#9ca3af' }}>
                Choose a conversation to start messaging
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000' }}>
        <div style={{ color: '#ffffff' }}>Loading...</div>
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  );
}
