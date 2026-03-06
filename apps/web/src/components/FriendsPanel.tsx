'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { roomAPI } from '@/lib/api';
import { Search, UserPlus, Check, X, User, MessageCircle, Ban } from 'lucide-react';
import UserProfileModal from './UserProfileModal';

const getFullFileUrl = (url: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${url}`;
};

interface Friend {
  id: string;
  username: string;
  pfpUrl?: string;
  publicKey: string;
  status: 'ONLINE' | 'OFFLINE';
}

interface FriendRequest {
  id: string;
  sender: Friend;
  receiver: Friend;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  createdAt: string;
  direction?: 'sent' | 'received';
}

interface FriendsPanelProps {
  onStartChat: (friend: Friend) => void;
}

interface BlockedUser {
  id: string;
  username: string;
  pfpUrl?: string;
  createdAt?: string;
}

export default function FriendsPanel({ onStartChat }: FriendsPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const { setSelectedRoom, setPendingFriendRequests, clearPendingFriendRequests } = useChatStore();
  const [activeTab, setActiveTabState] = useState<'all' | 'pending' | 'blocked'>('all');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [blockedSearchQuery, setBlockedSearchQuery] = useState('');
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [profileUser, setProfileUser] = useState<BlockedUser | null>(null);
  const [isFriendProfile, setIsFriendProfile] = useState(false);

  // Load tab from URL query param or localStorage on mount
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab') as 'all' | 'pending' | 'blocked';
    if (tabFromUrl && ['all', 'pending', 'blocked'].includes(tabFromUrl)) {
      setActiveTabState(tabFromUrl);
    } else if (typeof window !== 'undefined') {
      const savedTab = localStorage.getItem('friendsActiveTab') as 'all' | 'pending' | 'blocked';
      if (savedTab && ['all', 'pending', 'blocked'].includes(savedTab)) {
        setActiveTabState(savedTab);
      }
    }
  }, [searchParams]);

  // Wrapper to save tab when it changes
  const setActiveTab = (tab: 'all' | 'pending' | 'blocked') => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      localStorage.setItem('friendsActiveTab', tab);
    }
    // Update URL to reflect the tab change
    const url = tab === 'all' ? '/friends' : `/friends/${tab}`;
    router.replace(url);
  };

  useEffect(() => {
    loadFriends();
    loadRequests();
    loadBlockedUsers();
  }, []);

  // Listen for online status updates
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const { io } = require('socket.io-client');
    const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000', {
      auth: { token }
    });

    socket.on('connect', () => {
      socket.emit('get-online-users');
    });

    socket.on('user-status', ({ userId, status }: { userId: string; status: 'online' | 'offline' }) => {
      setOnlineUsers(prev => {
        const newSet = new Set(prev);
        if (status === 'online') {
          newSet.add(userId);
        } else {
          newSet.delete(userId);
        }
        return newSet;
      });
    });

    socket.on('online-users', (userIds: string[]) => {
      setOnlineUsers(new Set(userIds));
    });

    // Listen for friend updates (block, unfriend, accept)
    socket.on('friends-updated', () => {
      loadFriends();
      loadRequests();
      loadBlockedUsers();
    });

    // Listen for new friend requests
    socket.on('friend-request-received', () => {
      loadRequests();
    });
    
    // Listen for room deletion (when blocked/unfriended)
    socket.on('room-deleted', () => {
      loadFriends();
      loadRequests();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const loadFriends = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/friends', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setFriends(data.friends || []);
    } catch (error) {
      console.error('Failed to load friends:', error);
    }
  };

  const loadRequests = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/friends/requests', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      // Combine sent and received requests
      const allRequests = [
        ...(data.received || []).map((r: any) => ({ ...r, direction: 'received' })),
        ...(data.sent || []).map((r: any) => ({ ...r, direction: 'sent' }))
      ];
      setRequests(allRequests);
      // Update notification count for received requests
      const receivedCount = (data.received || []).length;
      setPendingFriendRequests(receivedCount);
    } catch (error) {
      console.error('Failed to load requests:', error);
    }
  };

  const loadBlockedUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/friends/blocked', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setBlockedUsers(data.blockedUsers || []);
    } catch (error) {
      console.error('Failed to load blocked users:', error);
    }
  };

  const unblockUser = async (userId: string) => {
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/friends/unblock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ targetUserId: userId })
      });
      loadBlockedUsers();
    } catch (error) {
      console.error('Failed to unblock user:', error);
    }
  };

  const sendFriendRequest = async () => {
    if (!username.trim()) return;
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ username: username.trim() })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to send request');
        return;
      }

      setSuccess('Friend request sent!');
      setUsername('');
      
      // Emit socket event to notify target user
      const { io } = require('socket.io-client');
      const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000', {
        auth: { token }
      });
      socket.emit('friend-request-sent', { targetUserId: data.request?.receiverId });
      
      setTimeout(() => setShowAddFriend(false), 1000);
    } catch (err) {
      setError('Failed to send request');
    }
  };

  const acceptRequest = async (requestId: string) => {
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/friends/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ requestId })
      });
      loadRequests();
      loadFriends();
      
      // Notify all clients to refresh
      const { io } = require('socket.io-client');
      const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000', {
        auth: { token }
      });
      socket.emit('friend-request-accepted');
    } catch (error) {
      console.error('Failed to accept request:', error);
    }
  };

  const rejectRequest = async (requestId: string) => {
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/friends/reject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ requestId })
      });
      loadRequests();
    } catch (error) {
      console.error('Failed to reject request:', error);
    }
  };

  const startChat = async (friend: Friend) => {
    try {
      const response = await roomAPI.createDM(friend.id);
      if (response.data.room) {
        // Fetch full room data with messages
        const roomResponse = await roomAPI.getRooms();
        const fullRoom = roomResponse.data.rooms.find((r: any) => r.id === response.data.room.id);
        if (fullRoom) {
          setSelectedRoom(fullRoom);
        } else {
          setSelectedRoom(response.data.room);
        }
        onStartChat(friend);
      }
    } catch (error) {
      console.error('Failed to start chat:', error);
    }
  };

  const pendingCount = requests.filter(r => r.direction === 'received').length;
  const primaryBg = user?.primaryColor || '#0f172a';
  const secondaryBg = user?.secondaryColor || '#1e293b';

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: primaryBg }}>
      {/* Header */}
      <div style={{ height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: `1px solid ${secondaryBg}` }}>
        <span style={{ fontWeight: 600, color: 'white', fontSize: '18px' }}>Friends</span>
        <button
          onClick={() => setShowAddFriend(true)}
          style={{ padding: '8px', backgroundColor: secondaryBg, borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: 'white', fontSize: '13px' }}
        >
          <UserPlus size={16} />
          Add
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '12px 16px', gap: '8px', borderBottom: `1px solid ${secondaryBg}` }}>
        <button
          onClick={() => setActiveTab('all')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: activeTab === 'all' ? secondaryBg : primaryBg,
            color: 'white',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          All Friends
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: activeTab === 'pending' ? secondaryBg : primaryBg,
            color: 'white',
            fontSize: '14px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          Pending
          {pendingCount > 0 && (
            <span style={{ backgroundColor: '#dc2626', color: 'white', fontSize: '11px', padding: '2px 6px', borderRadius: '10px' }}>
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('blocked')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: activeTab === 'blocked' ? '#dc2626' : secondaryBg,
            color: 'white',
            fontSize: '14px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Ban size={14} />
          Blocked
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {activeTab === 'all' ? (
          <>
            {/* Search */}
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
              <input
                type="text"
                placeholder="Search friends..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', backgroundColor: secondaryBg, color: 'white', padding: '10px 12px 10px 36px', borderRadius: '8px', border: 'none', outline: 'none' }}
              />
            </div>

            {/* Friends List */}
            {friends.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: '#6b7280' }}>
                <User size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                <p>No friends yet</p>
                <p style={{ fontSize: '14px', marginTop: '4px' }}>Add friends to start chatting</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {friends
                  .filter(f => f.username.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((friend) => (
                    <div
                      key={friend.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px',
                        backgroundColor: secondaryBg,
                        borderRadius: '12px',
                      }}
                    >
                      <button
                        onClick={() => router.push(`/user/${encodeURIComponent(friend.username)}`)}
                        style={{ padding: 0, background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        {friend.pfpUrl ? (
                          <img src={getFullFileUrl(friend.pfpUrl)} alt="" style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: secondaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <User size={22} style={{ color: 'white' }} />
                          </div>
                        )}
                      </button>
                      <div style={{ flex: 1 }}>
                        <button
                          onClick={() => router.push(`/user/${encodeURIComponent(friend.username)}`)}
                          style={{ padding: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                        >
                          <p style={{ color: 'white', fontWeight: 500 }}>{friend.username}</p>
                        </button>
                        <p style={{ color: onlineUsers.has(friend.id) ? '#10b981' : '#6b7280', fontSize: '12px' }}>
                          {onlineUsers.has(friend.id) ? 'Online' : 'Offline'}
                        </p>
                      </div>
                      <button
                        onClick={() => startChat(friend)}
                        style={{ padding: '8px', backgroundColor: secondaryBg, borderRadius: '8px', border: 'none', cursor: 'pointer', color: 'white' }}
                        title="Start chat"
                      >
                        <MessageCircle size={18} />
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </>
        ) : activeTab === 'pending' ? (
          /* Pending Requests */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {requests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: '#6b7280' }}>
                <p>No pending requests</p>
              </div>
            ) : (
              requests.map((request) => {
                  const isIncoming = request.direction === 'received';
                  const otherUser = isIncoming ? request.sender : request.receiver;

                  if (!otherUser) return null;

                  return (
                    <div
                      key={request.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px',
                        backgroundColor: secondaryBg,
                        borderRadius: '12px',
                      }}
                    >
                      <button
                        onClick={() => {
                          setProfileUser(otherUser);
                          setIsFriendProfile(false);
                        }}
                        style={{ padding: 0, background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        {otherUser.pfpUrl ? (
                          <img src={getFullFileUrl(otherUser.pfpUrl)} alt="" style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: secondaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <User size={22} style={{ color: 'white' }} />
                          </div>
                        )}
                      </button>
                      <div style={{ flex: 1 }}>
                        <button
                          onClick={() => {
                            setProfileUser(otherUser);
                            setIsFriendProfile(false);
                          }}
                          style={{ padding: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                        >
                          <p style={{ color: 'white', fontWeight: 500 }}>{otherUser.username || 'Unknown'}</p>
                        </button>
                        <p style={{ color: '#9ca3af', fontSize: '12px' }}>
                          {isIncoming ? 'Wants to be friends' : 'Request sent'}
                        </p>
                      </div>
                      {isIncoming ? (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => acceptRequest(request.id)}
                            style={{ padding: '8px', backgroundColor: '#10b981', borderRadius: '8px', border: 'none', cursor: 'pointer', color: 'white' }}
                          >
                            <Check size={18} />
                          </button>
                          <button
                            onClick={() => rejectRequest(request.id)}
                            style={{ padding: '8px', backgroundColor: '#dc2626', borderRadius: '8px', border: 'none', cursor: 'pointer', color: 'white' }}
                          >
                            <X size={18} />
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: '#f59e0b', fontSize: '12px' }}>Pending</span>
                      )}
                    </div>
                  );
                })
            )}
          </div>
        ) : activeTab === 'blocked' ? (
          /* Blocked Users */
          <>
            {/* Search Blocked */}
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
              <input
                type="text"
                placeholder="Search blocked users..."
                value={blockedSearchQuery}
                onChange={(e) => setBlockedSearchQuery(e.target.value)}
                style={{ width: '100%', backgroundColor: secondaryBg, color: 'white', padding: '10px 12px 10px 36px', borderRadius: '8px', border: 'none', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {blockedUsers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 16px', color: '#6b7280' }}>
                  <Ban size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                  <p>No blocked users</p>
                </div>
              ) : (
                blockedUsers
                  .filter(u => u.username.toLowerCase().includes(blockedSearchQuery.toLowerCase()))
                  .map((blockedUser) => (
                    <div
                      key={blockedUser.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px',
                        backgroundColor: secondaryBg,
                        borderRadius: '12px',
                      }}
                    >
                      {blockedUser.pfpUrl ? (
                        <img src={getFullFileUrl(blockedUser.pfpUrl)} alt="" style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: secondaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <User size={22} style={{ color: 'white' }} />
                        </div>
                      )}
                      <div style={{ flex: 1 }}>
                        <p style={{ color: 'white', fontWeight: 500 }}>{blockedUser.username}</p>
                        <p style={{ color: '#dc2626', fontSize: '12px' }}>Blocked</p>
                      </div>
                      <button
                        onClick={() => unblockUser(blockedUser.id)}
                        style={{ padding: '8px 16px', backgroundColor: secondaryBg, borderRadius: '8px', border: 'none', cursor: 'pointer', color: 'white', fontSize: '13px' }}
                      >
                        Unblock
                      </button>
                    </div>
                  ))
              )}
            </div>
          </>
        ) : null}
      </div>

      {/* Add Friend Modal */}
      {showAddFriend && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
          <div style={{ backgroundColor: secondaryBg, borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '320px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'white', marginBottom: '8px' }}>Add Friend</h2>
            <p style={{ fontSize: '14px', color: '#9ca3af', marginBottom: '16px' }}>Enter username to send friend request</p>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: '100%', backgroundColor: primaryBg, border: '1px solid #374151', borderRadius: '8px', padding: '12px 16px', color: 'white', marginBottom: '12px', outline: 'none' }}
              onKeyPress={(e) => e.key === 'Enter' && sendFriendRequest()}
            />
            {error && <p style={{ color: '#ef4444', fontSize: '14px', marginBottom: '12px' }}>{error}</p>}
            {success && <p style={{ color: '#10b981', fontSize: '14px', marginBottom: '12px' }}>{success}</p>}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={sendFriendRequest}
                style={{ flex: 1, backgroundColor: secondaryBg, color: 'white', padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 500 }}
              >
                Send Request
              </button>
              <button
                onClick={() => { setShowAddFriend(false); setError(''); setSuccess(''); setUsername(''); }}
                style={{ flex: 1, backgroundColor: secondaryBg, color: 'white', padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Profile Modal */}
      <UserProfileModal
        user={profileUser}
        isOpen={!!profileUser}
        onClose={() => setProfileUser(null)}
        onMessage={() => {
          if (profileUser && isFriendProfile) {
            startChat(profileUser as Friend);
          }
          setProfileUser(null);
        }}
        onUnfriend={async () => {
          if (profileUser && isFriendProfile) {
            // Get room ID first
            const token = localStorage.getItem('token');
            const roomsRes = await fetch('/api/rooms', {
              headers: { Authorization: `Bearer ${token}` }
            });
            const roomsData = await roomsRes.json();
            const room = roomsData.rooms?.find((r: any) => 
              r.type === 'DM' && r.members?.some((m: any) => m.userId === profileUser.id)
            );
            
            // Remove friend
            const res = await fetch(`/api/friends/${profileUser.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            
            if (data.roomDeleted && room) {
              // Emit socket event to notify other user
              const { io } = require('socket.io-client');
              const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000', {
                auth: { token }
              });
              socket.emit('delete-room', { roomId: room.id, targetUserId: profileUser.id });
            }
            
            loadFriends();
            setSelectedRoom(null);
          }
        }}
        onBlock={async () => {
          if (profileUser) {
            // Get room ID first
            const token = localStorage.getItem('token');
            const roomsRes = await fetch('/api/rooms', {
              headers: { Authorization: `Bearer ${token}` }
            });
            const roomsData = await roomsRes.json();
            const room = roomsData.rooms?.find((r: any) => 
              r.type === 'DM' && r.members?.some((m: any) => m.userId === profileUser.id)
            );
            
            // Block user
            const res = await fetch('/api/friends/block', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ targetUserId: profileUser.id })
            });
            const data = await res.json();
            
            if (data.roomDeleted && room) {
              // Emit socket event to notify other user
              const { io } = require('socket.io-client');
              const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000', {
                auth: { token }
              });
              socket.emit('delete-room', { roomId: room.id, targetUserId: profileUser.id });
            }
            
            loadFriends();
            loadBlockedUsers();
            setSelectedRoom(null);
          }
        }}
        isFriend={isFriendProfile}
      />
    </div>
  );
}
