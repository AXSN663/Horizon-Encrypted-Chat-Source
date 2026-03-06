'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { User, Plus, Compass } from 'lucide-react';

const getFullFileUrl = (url: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${url}`;
};

export default function ServerList() {
  const { user } = useAuthStore();
  const { showFriends, setShowFriends, selectedServer, setSelectedServer } = useChatStore();
  const [servers] = useState([
    { id: 'friends', name: 'Direct Messages', icon: null },
  ]);

  return (
    <div className="w-[72px] bg-discord-darkest flex flex-col items-center py-3 space-y-2 overflow-y-auto">
      {/* Home / Friends Button */}
      <button
        onClick={() => {
          setShowFriends(true);
          setSelectedServer(null);
        }}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${
          showFriends
            ? 'bg-discord-primary rounded-2xl'
            : 'bg-discord-darker hover:bg-discord-primary hover:rounded-2xl rounded-3xl'
        }`}
      >
        {user?.pfpUrl ? (
          <img
            src={getFullFileUrl(user.pfpUrl)}
            alt=""
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          <User size={24} className="text-white" />
        )}
      </button>

      <div className="w-8 h-[2px] bg-discord-darker rounded-full my-1" />

      {/* Server List */}
      {servers.map((server) => (
        <button
          key={server.id}
          onClick={() => {
            setShowFriends(false);
            setSelectedServer(server);
          }}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 group relative ${
            selectedServer?.id === server.id && !showFriends
              ? 'bg-discord-primary rounded-2xl'
              : 'bg-discord-darker hover:bg-discord-primary hover:rounded-2xl rounded-3xl'
          }`}
        >
          {server.icon ? (
            <img
              src={server.icon}
              alt={server.name}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <span className="text-white font-bold text-lg">
              {server.name.charAt(0).toUpperCase()}
            </span>
          )}
          
          {/* Hover tooltip */}
          <div className="absolute left-14 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
            {server.name}
          </div>
          
          {/* Active indicator */}
          {selectedServer?.id === server.id && !showFriends && (
            <div className="absolute -left-3 w-1 h-8 bg-white rounded-r-full" />
          )}
        </button>
      ))}

      {/* Add Server Button */}
      <button
        className="w-12 h-12 rounded-full bg-discord-darker hover:bg-green-600 hover:rounded-2xl rounded-3xl flex items-center justify-center transition-all duration-200 group"
      >
        <Plus size={24} className="text-green-500 group-hover:text-white" />
      </button>

      {/* Explore Servers */}
      <button
        className="w-12 h-12 rounded-full bg-discord-darker hover:bg-discord-primary hover:rounded-2xl rounded-3xl flex items-center justify-center transition-all duration-200 group"
      >
        <Compass size={24} className="text-discord-primary group-hover:text-white" />
      </button>
    </div>
  );
}
