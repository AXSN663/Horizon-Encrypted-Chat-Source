'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { roomAPI } from '@/lib/api';
import { Hash, User, Plus, Settings, LogOut, Mic, Headphones } from 'lucide-react';

const getFullFileUrl = (url: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${url}`;
};

interface Room {
  id: string;
  name: string;
  type: string;
  members: Array<{
    user: {
      id: string;
      username: string;
      pfpUrl?: string;
      publicKey: string;
    };
  }>;
  messages: Array<any>;
}

export default function ChannelSidebar() {
  const { user, logout } = useAuthStore();
  const { rooms, setRooms, selectedRoom, setSelectedRoom, setShowFriends } = useChatStore();
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');

  useEffect(() => {
    loadRooms();
  }, []);

  const loadRooms = async () => {
    try {
      const response = await roomAPI.getRooms();
      setRooms(response.data.rooms);
    } catch (error) {
      console.error('Failed to load rooms:', error);
    }
  };

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return;
    try {
      await roomAPI.createRoom({
        name: newRoomName,
        type: 'GROUP',
        memberIds: [],
      });
      setNewRoomName('');
      setShowNewRoom(false);
      loadRooms();
    } catch (error) {
      console.error('Failed to create room:', error);
    }
  };

  const getRoomDisplayName = (room: Room) => {
    if (room.type === 'DM' && room.members.length === 2) {
      const otherMember = room.members.find(m => m.user.id !== user?.id);
      return otherMember?.user.username || room.name;
    }
    return room.name;
  };

  const getRoomPFP = (room: Room) => {
    if (room.type === 'DM' && room.members.length === 2) {
      const otherMember = room.members.find(m => m.user.id !== user?.id);
      return otherMember?.user.pfpUrl ? getFullFileUrl(otherMember.user.pfpUrl) : null;
    }
    return null;
  };

  const dmRooms = rooms.filter(r => r.type === 'DM');
  const groupRooms = rooms.filter(r => r.type === 'GROUP');

  return (
    <div className="w-60 bg-discord-darker flex flex-col h-full">
      {/* Server/DM Header */}
      <div className="h-12 border-b border-gray-700 flex items-center px-4 shadow-sm">
        <span className="font-semibold text-white">Direct Messages</span>
      </div>

      {/* Friends Button */}
      <button
        onClick={() => setShowFriends(true)}
        className="mx-2 mt-2 p-2 flex items-center gap-3 rounded hover:bg-discord-darkest text-discord-gray hover:text-white transition-colors"
      >
        <User size={20} />
        <span className="font-medium">Friends</span>
      </button>

      {/* Direct Messages Section */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <div className="flex items-center justify-between mb-1 px-2">
          <span className="text-xs font-semibold text-discord-gray uppercase">Direct Messages</span>
          <button
            onClick={() => setShowNewRoom(true)}
            className="p-1 hover:bg-discord-darkest rounded text-discord-gray hover:text-white"
          >
            <Plus size={16} />
          </button>
        </div>

        {showNewRoom && (
          <div className="mb-2 p-2 bg-discord-darkest rounded">
            <input
              type="text"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="Room name"
              className="w-full px-2 py-1 bg-discord-darker border border-gray-700 rounded text-sm text-white mb-2"
              onKeyPress={(e) => e.key === 'Enter' && handleCreateRoom()}
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreateRoom}
                className="flex-1 py-1 bg-discord-primary text-white text-xs rounded"
              >
                Create
              </button>
              <button
                onClick={() => setShowNewRoom(false)}
                className="flex-1 py-1 bg-gray-700 text-white text-xs rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* DM List */}
        <div className="space-y-0.5">
          {dmRooms.map((room) => (
            <button
              key={room.id}
              onClick={() => {
                setSelectedRoom(room);
                setShowFriends(false);
              }}
              className={`w-full flex items-center gap-3 px-2 py-2 rounded text-left transition-colors ${
                selectedRoom?.id === room.id
                  ? 'bg-discord-darkest text-white'
                  : 'text-discord-gray hover:bg-discord-darkest hover:text-white'
              }`}
            >
              <div className="relative">
                {getRoomPFP(room) ? (
                  <img
                    src={getRoomPFP(room)!}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-discord-primary flex items-center justify-center">
                    <User size={16} className="text-white" />
                  </div>
                )}
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-discord-darker" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {getRoomDisplayName(room)}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Group Rooms */}
        {groupRooms.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-1 mt-4 px-2">
              <span className="text-xs font-semibold text-discord-gray uppercase">Groups</span>
            </div>
            <div className="space-y-0.5">
              {groupRooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => {
                    setSelectedRoom(room);
                    setShowFriends(false);
                  }}
                  className={`w-full flex items-center gap-3 px-2 py-2 rounded text-left transition-colors ${
                    selectedRoom?.id === room.id
                      ? 'bg-discord-darkest text-white'
                      : 'text-discord-gray hover:bg-discord-darkest hover:text-white'
                  }`}
                >
                  <Hash size={18} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {room.name}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* User Panel */}
      <div className="p-2 bg-discord-darkest">
        <div className="flex items-center gap-2 p-1 rounded hover:bg-discord-darker cursor-pointer">
          <div className="relative">
            {user?.pfpUrl ? (
              <img
                src={getFullFileUrl(user.pfpUrl)}
                alt=""
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-discord-primary flex items-center justify-center">
                <User size={16} className="text-white" />
              </div>
            )}
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-discord-darkest" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">
              {user?.username}
            </div>
            <div className="text-xs text-discord-gray">Online</div>
          </div>
          <div className="flex items-center gap-1">
            <button className="p-1.5 hover:bg-discord-darkest rounded text-discord-gray hover:text-white">
              <Mic size={18} />
            </button>
            <button className="p-1.5 hover:bg-discord-darkest rounded text-discord-gray hover:text-white">
              <Headphones size={18} />
            </button>
            <button className="p-1.5 hover:bg-discord-darkest rounded text-discord-gray hover:text-white">
              <Settings size={18} />
            </button>
            <button
              onClick={logout}
              className="p-1.5 hover:bg-red-600 rounded text-discord-gray hover:text-white"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
