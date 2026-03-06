'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { roomAPI } from '@/lib/api';
import { Search, Plus, User, MessageCircle, Users, MoreVertical, Volume2, VolumeX, BellOff } from 'lucide-react';
import { io } from 'socket.io-client';

const getFullFileUrl = (url: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${url}`;
};

interface Room {
  id: string;
  name: string;
  type: 'DM' | 'GROUP';
  ownerId?: string;
  groupImage?: string;
  members: Array<{
    user: {
      id: string;
      username: string;
      pfpUrl?: string;
      publicKey: string;
    };
  }>;
  messages: Array<{
    id: string;
    content: string;
    createdAt: string;
    sender: {
      id: string;
      username: string;
    };
  }>;
}

interface RoomListProps {
  onSelectRoom: () => void;
}

export default function RoomList({ onSelectRoom }: RoomListProps) {
  const { user } = useAuthStore();
  const { rooms, setRooms, selectedRoom, setSelectedRoom, unreadByRoom, clearUnreadForRoom, addUnreadMessage, setUnreadMessages, unreadMessages } = useChatStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [unreadRooms, setUnreadRooms] = useState<Set<string>>(new Set());
  const [newGroupName, setNewGroupName] = useState('');
  const [friends, setFriends] = useState<Array<{ id: string; username: string; pfpUrl?: string }>>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [mutedRooms, setMutedRooms] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mutedRooms');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    }
    return new Set();
  });
  const [openMenuRoomId, setOpenMenuRoomId] = useState<string | null>(null);
  
  // Use ref to always have latest selectedRoom and userId in socket callbacks
  const selectedRoomRef = useRef(selectedRoom);
  const userIdRef = useRef(user?.id);
  useEffect(() => {
    selectedRoomRef.current = selectedRoom;
  }, [selectedRoom]);
  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);

  useEffect(() => {
    loadRooms();
    
    // Poll for room updates every 3 seconds to catch group additions/deletions
    const interval = setInterval(() => {
      loadRooms();
    }, 3000);
    
    return () => clearInterval(interval);
  }, []);

  // Restore unread rooms from persisted store on mount
  useEffect(() => {
    if (Object.keys(unreadByRoom).length > 0) {
      setUnreadRooms(new Set(Object.keys(unreadByRoom)));
    }
  }, []);

  // Listen for online status updates
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

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

    // Listen for group updates to refresh room list
    socket.on('group-updated', (data: { roomId: string; type: 'member-left' | 'member-kicked' | 'member-added' | 'group-deleted' | 'group-info-updated'; userId?: string; room?: Room }) => {
      const currentUserId = userIdRef.current;
      console.log('Group-updated event received:', data);
      console.log('Current user ID:', currentUserId);
      
      // Reload page for any group membership change or deletion affecting current user
      if (data.type === 'member-added') {
        console.log('Member added event - target:', data.userId, 'me:', currentUserId, 'match:', data.userId === currentUserId);
        if (data.userId === currentUserId) {
          console.log('I was added to a group, reloading page');
          window.location.reload();
        }
      } else if (data.type === 'member-kicked') {
        console.log('Member kicked event - target:', data.userId, 'me:', currentUserId, 'match:', data.userId === currentUserId);
        if (data.userId === currentUserId) {
          console.log('I was kicked from a group, reloading page');
          window.location.reload();
        }
      } else if (data.type === 'group-deleted') {
        console.log('Group deleted event, reloading page');
        window.location.reload();
      } else if (data.type === 'group-info-updated' && data.room) {
        // Just update the room info without reload
        setRooms((prev: Room[]) => prev.map((r: Room) => r.id === data.roomId ? data.room! : r));
      } else {
        // For other events, just refresh the list
        loadRooms();
      }
    });

    // Listen for room deletion - remove immediately without refresh
    socket.on('room-deleted', ({ roomId, memberIds }: { roomId: string; memberIds?: string[] }) => {
      const currentUserId = userIdRef.current;
      console.log('Room deleted event received:', roomId, 'memberIds:', memberIds, 'myId:', currentUserId);
      // Only remove if current user was a member (or if no memberIds provided for backward compat)
      if (!memberIds || memberIds.includes(currentUserId || '')) {
        console.log('Removing room from list:', roomId);
        setRooms((prev: Room[]) => prev.filter((r: Room) => r.id !== roomId));
        // Also remove from unread rooms if present
        setUnreadRooms(prev => {
          const newSet = new Set(prev);
          newSet.delete(roomId);
          return newSet;
        });
      }
    });

    // Listen for new messages to track unread rooms
    socket.on('new-message-notification', (data: { roomId: string; senderId: string; senderName: string }) => {
      // Skip if message is from current user
      if (data.senderId === user?.id) return;
      
      // Skip notification only if user is actively viewing that room (use ref for latest value)
      if (selectedRoomRef.current?.id === data.roomId) return;
      
      // Skip if room is muted
      if (mutedRooms.has(data.roomId)) return;
      
      setUnreadRooms(prev => new Set(Array.from(prev).concat([data.roomId])));
      addUnreadMessage(data.roomId, data.senderId, data.senderName);
    });

    // Listen for username changes to update room names in real-time
    socket.on('user-updated', ({ userId, username }: { userId: string; username: string }) => {
      // Update room names for DM rooms where this user is the other member
      setRooms((prev: Room[]) => prev.map((room: Room) => {
        if (room.type === 'DM') {
          const otherMember = room.members.find(m => m.user.id === userId);
          if (otherMember) {
            // Update the member's username
            return {
              ...room,
              name: username,
              members: room.members.map(m => 
                m.user.id === userId 
                  ? { ...m, user: { ...m.user, username } }
                  : m
              )
            };
          }
        }
        return room;
      }));
    });

    // Listen for PFP changes to update room avatars in real-time
    socket.on('user-pfp-updated', ({ userId, pfpUrl }: { userId: string; pfpUrl: string }) => {
      setRooms((prev: Room[]) => prev.map((room: Room) => {
        // Update PFP for any room where this user is a member
        const memberIndex = room.members.findIndex(m => m.user.id === userId);
        if (memberIndex !== -1) {
          return {
            ...room,
            members: room.members.map(m => 
              m.user.id === userId 
                ? { ...m, user: { ...m.user, pfpUrl } }
                : m
            )
          };
        }
        return room;
      }));
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.id, selectedRoom?.id]);

  const loadRooms = async () => {
    try {
      const response = await roomAPI.getRooms();
      setRooms(response.data.rooms);
    } catch (error) {
      console.error('Failed to load rooms:', error);
    }
  };

  const toggleMuteRoom = (roomId: string) => {
    setMutedRooms(prev => {
      const newSet = new Set(prev);
      if (newSet.has(roomId)) {
        newSet.delete(roomId);
      } else {
        newSet.add(roomId);
      }
      localStorage.setItem('mutedRooms', JSON.stringify(Array.from(newSet)));
      // Notify other components (Sidebar) that muted rooms changed
      window.dispatchEvent(new CustomEvent('muted-rooms-changed'));
      return newSet;
    });
    setOpenMenuRoomId(null);
  };

  const handleSelectRoom = (room: Room) => {
    // Only select if it's a different room
    if (selectedRoom?.id !== room.id) {
      // Use setTimeout to avoid setState during render
      setTimeout(() => setSelectedRoom(room), 0);
    }
    // Clear unread status for this room
    setUnreadRooms(prev => {
      const newSet = new Set(prev);
      newSet.delete(room.id);
      return newSet;
    });
    // Clear unread message tracking for this room
    const unread = unreadByRoom[room.id];
    clearUnreadForRoom(room.id);
    // Also decrement the global unread count for the Chats tab badge
    setTimeout(() => {
      if (unread && unread.count > 0) {
        setUnreadMessages(prev => Math.max(0, prev - unread.count));
      } else if (unreadMessages > 0 && !unread) {
        // Fallback: if we have unread messages but no per-room tracking, decrement by 1
        setUnreadMessages(prev => Math.max(0, prev - 1));
      }
    }, 0);
    onSelectRoom();
  };

  const getRoomDisplayName = (room: Room) => {
    if (room.type === 'DM' && room.members.length === 2) {
      const otherMember = room.members.find(m => m.user.id !== user?.id);
      return otherMember?.user.username || room.name;
    }
    return room.name;
  };

  const getRoomAvatar = (room: Room) => {
    if (room.type === 'DM' && room.members.length === 2) {
      const otherMember = room.members.find(m => m.user.id !== user?.id);
      return otherMember?.user.pfpUrl ? getFullFileUrl(otherMember.user.pfpUrl) : null;
    }
    return null;
  };

  const getLastMessage = (room: Room) => {
    const unread = unreadByRoom[room.id];
    
    // If there are unread messages, show who sent them
    if (unread && unread.count > 0) {
      return {
        text: `${unread.senderName}: New message`,
        time: '',
        isUnread: true,
      };
    }
    
    if (room.messages && room.messages.length > 0) {
      const lastMsg = room.messages[0];
      return {
        text: lastMsg.sender.id === user?.id ? 'You sent a message' : 'New message',
        time: new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isUnread: false,
      };
    }
    return null;
  };

  const getOtherMemberId = (room: Room) => {
    if (room.type === 'DM' && room.members.length === 2) {
      const otherMember = room.members.find(m => m.user.id !== user?.id);
      return otherMember?.user.id;
    }
    return null;
  };

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

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || selectedMembers.size === 0) return;
    try {
      await roomAPI.createRoom({
        name: newGroupName,
        type: 'GROUP',
        memberIds: Array.from(selectedMembers),
      });
      setNewGroupName('');
      setSelectedMembers(new Set());
      setShowNewGroup(false);
      loadRooms();
    } catch (error) {
      console.error('Failed to create group:', error);
    }
  };

  const toggleMember = (userId: string) => {
    setSelectedMembers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const filteredRooms = rooms.filter(room => 
    getRoomDisplayName(room).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const primaryBg = user?.primaryColor || '#0f172a';
  const secondaryBg = user?.secondaryColor || '#1e293b';

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: primaryBg, borderRight: `1px solid ${secondaryBg}` }}>
      {/* Header */}
      <div style={{ height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: `1px solid ${secondaryBg}` }}>
        <span style={{ fontWeight: 600, color: 'white', fontSize: '18px' }}>Messages</span>
        <button
          onClick={() => {
            loadFriends();
            setShowNewGroup(true);
          }}
          style={{
            backgroundColor: secondaryBg,
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          <Users size={16} />
          New Group
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '12px' }}>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
          <input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', backgroundColor: secondaryBg, color: 'white', padding: '10px 12px 10px 36px', borderRadius: '8px', border: 'none', outline: 'none' }}
          />
        </div>
      </div>

      {/* Chat List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredRooms.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: '#6b7280' }}>
            <MessageCircle size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
            <p>No chats yet</p>
            <p style={{ fontSize: '14px', marginTop: '4px' }}>Add friends to start messaging</p>
          </div>
        ) : (
          <div>
            {filteredRooms.map((room) => {
              const lastMessage = getLastMessage(room);
              const isSelected = selectedRoom?.id === room.id;
              
              const isMuted = mutedRooms.has(room.id);
              
              return (
                <div
                  key={room.id}
                  style={{ position: 'relative', display: 'flex', alignItems: 'center', background: isSelected ? secondaryBg : 'transparent', borderLeft: isSelected ? `3px solid ${secondaryBg}` : '3px solid transparent' }}
                >
                  <button
                    onClick={() => handleSelectRoom(room)}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 8px 12px 16px', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  >
                    {/* Avatar */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      {room.type === 'GROUP' ? (
                        room.groupImage ? (
                          <img
                            src={room.groupImage.startsWith('http') ? room.groupImage : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${room.groupImage}`}
                            alt=""
                            style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }}
                          />
                        ) : (
                          <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: secondaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <User size={24} style={{ color: 'white' }} />
                          </div>
                        )
                      ) : getRoomAvatar(room) ? (
                        <img
                          src={getRoomAvatar(room)!}
                          alt=""
                          style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: secondaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <User size={24} style={{ color: 'white' }} />
                        </div>
                      )}
                      {room.type === 'DM' && getOtherMemberId(room) && (
                        <div style={{ 
                          position: 'absolute', 
                          bottom: '-2px', 
                          right: '-2px', 
                          width: '14px', 
                          height: '14px', 
                          backgroundColor: onlineUsers.has(getOtherMemberId(room)!) ? '#10b981' : '#6b7280', 
                          borderRadius: '50%', 
                          border: '2px solid #111827' 
                        }} />
                      )}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <h3 style={{ fontWeight: 500, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {getRoomDisplayName(room)}
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {isMuted && (
                            <BellOff size={14} style={{ color: '#6b7280' }} />
                          )}
                          {(unreadRooms.has(room.id) || unreadByRoom[room.id]) && !isMuted && (
                            <div
                              style={{
                                minWidth: '16px',
                                height: '16px',
                                backgroundColor: '#ef4444',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10px',
                                fontWeight: 'bold',
                                color: 'white',
                                padding: '0 3px',
                              }}
                            >
                              !
                            </div>
                          )}
                          {lastMessage && (
                            <span style={{ fontSize: '12px', color: '#6b7280', flexShrink: 0 }}>
                              {lastMessage.time}
                            </span>
                          )}
                        </div>
                      </div>
                      <p style={{ 
                        fontSize: '14px', 
                        color: lastMessage?.isUnread && !isMuted ? '#60a5fa' : '#9ca3af', 
                        fontWeight: lastMessage?.isUnread && !isMuted ? 600 : 400,
                        whiteSpace: 'nowrap', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        marginTop: '2px' 
                      }}>
                        {lastMessage?.text || 'No messages yet'}
                      </p>
                    </div>
                  </button>

                  {/* 3-dot menu */}
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuRoomId(openMenuRoomId === room.id ? null : room.id);
                      }}
                      style={{ padding: '8px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#6b7280' }}
                    >
                      <MoreVertical size={16} />
                    </button>
                    
                    {openMenuRoomId === room.id && (
                      <div style={{ position: 'absolute', right: '8px', top: '100%', backgroundColor: secondaryBg, borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 10, minWidth: '140px', border: `1px solid ${primaryBg}` }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMuteRoom(room.id);
                          }}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '14px' }}
                        >
                          {isMuted ? <Volume2 size={20} color={user?.primaryColor || '#3b82f6'} /> : <VolumeX size={20} color={user?.primaryColor || '#3b82f6'} />}
                          {isMuted ? 'Unmute' : 'Mute'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Group Modal */}
      {showNewGroup && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: secondaryBg,
            borderRadius: '16px',
            padding: '24px',
            width: '90%',
            maxWidth: '400px',
            maxHeight: '80vh',
            overflowY: 'auto',
          }}>
            <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 600, marginBottom: '20px' }}>Create New Group</h2>
            
            {/* Group Name Input */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ color: '#9ca3af', fontSize: '14px', display: 'block', marginBottom: '8px' }}>Group Name</label>
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Enter group name..."
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: secondaryBg,
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
            </div>

            {/* Friends Selection */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ color: '#9ca3af', fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                Select Members ({selectedMembers.size} selected)
              </label>
              <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {friends.length === 0 ? (
                  <p style={{ color: '#6b7280', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
                    No friends yet. Add friends to create a group.
                  </p>
                ) : (
                  friends.map((friend) => (
                    <div
                      key={friend.id}
                      onClick={() => toggleMember(friend.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px',
                        backgroundColor: selectedMembers.has(friend.id) ? secondaryBg : primaryBg,
                        borderRadius: '8px',
                        cursor: 'pointer',
                      }}
                    >
                      {friend.pfpUrl ? (
                        <img
                          src={getFullFileUrl(friend.pfpUrl)}
                          alt=""
                          style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: secondaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <User size={18} style={{ color: 'white' }} />
                        </div>
                      )}
                      <span style={{ color: 'white', fontSize: '14px', flex: 1 }}>{friend.username}</span>
                      {selectedMembers.has(friend.id) && (
                        <div style={{ width: '20px', height: '20px', backgroundColor: '#10b981', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ color: 'white', fontSize: '12px' }}>✓</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  setShowNewGroup(false);
                  setNewGroupName('');
                  setSelectedMembers(new Set());
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid #4b5563',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim() || selectedMembers.size === 0}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: newGroupName.trim() && selectedMembers.size > 0 ? secondaryBg : '#4b5563',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: newGroupName.trim() && selectedMembers.size > 0 ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Create Group
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
