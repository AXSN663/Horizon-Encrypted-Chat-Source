'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { roomAPI, fileAPI } from '@/lib/api';
import { CryptoService } from '@chat/shared';
import { io, Socket } from 'socket.io-client';
import { Send, Paperclip, Clock, User, Lock, Trash2, FileText, Image, X, Settings, Users, LogOut, Edit2, Check, ImageIcon, Film, MoreHorizontal } from 'lucide-react';
import UserProfileModal from './UserProfileModal';
import { format } from 'date-fns';

// Helper to check if text is only a GIF URL
function isOnlyGifUrl(text: string): boolean {
  const trimmed = text.trim();
  const urlRegex = /^https?:\/\/[^\s]+$/;
  if (!urlRegex.test(trimmed)) return false;
  const lower = trimmed.toLowerCase();
  return lower.includes('.gif') || lower.includes('giphy.com') || lower.includes('tenor.com') || lower.includes('discordapp.net');
}

// Helper function to detect URLs in text and render them as links
function renderTextWithLinks(text: string, onGifClick?: (url: string) => void, themeBg?: string): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  const matches: string[] = text.match(urlRegex) || [];
  const matchSet = new Set(matches);
  
  return parts.map((part, index) => {
    if (matchSet.has(part)) {
      // Check if it's a GIF URL - check for .gif anywhere in URL or known GIF hosts
      const lowerPart = part.toLowerCase();
      const isGif = lowerPart.includes('.gif') || lowerPart.includes('giphy.com') || lowerPart.includes('tenor.com') || lowerPart.includes('discordapp.net');
      if (isGif) {
        return (
          <img
            key={index}
            src={part}
            alt="GIF"
            style={{
              maxWidth: '300px',
              maxHeight: '300px',
              borderRadius: '8px',
              cursor: onGifClick ? 'zoom-in' : 'pointer',
              display: 'block'
            }}
            onClick={() => onGifClick ? onGifClick(part) : window.open(part, '_blank')}
          />
        );
      }
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#60a5fa', textDecoration: 'underline' }}
        >
          {part}
        </a>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

interface ChatMessage {
  id: string;
  content: string;
  encryptedKey: string;
  iv: string;
  senderId: string;
  roomId: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  selfDestruct?: string;
  isDeleted: boolean;
  createdAt: string;
  sender: {
    id: string;
    username: string;
    pfpUrl?: string;
    createdAt?: string;
  };
}

interface SystemMessage {
  type: 'self-destruct-enabled' | 'self-destruct-changed' | 'member-added';
  message: string;
  roomId: string;
  timestamp: string;
}

interface FilePreview {
  id: string;
  name: string;
  type: string;
  size: number;
  file: File;
  previewUrl?: string;
}

// Custom Audio Player Component
function AudioPlayer({ src, fileName, themeColor }: { src: string; fileName?: string; themeColor?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [showVolume, setShowVolume] = useState(false);
  const primaryColor = themeColor || '#3b82f6';

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = fileName || 'audio.mp3';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let animationFrame: number;
    const updateTime = () => {
      setCurrentTime(audio.currentTime);
      if (isPlaying) {
        animationFrame = requestAnimationFrame(updateTime);
      }
    };
    const updateDuration = () => setDuration(audio.duration);
    const onEnded = () => {
      setIsPlaying(false);
      cancelAnimationFrame(animationFrame);
    };
    const onPlay = () => {
      setIsPlaying(true);
      animationFrame = requestAnimationFrame(updateTime);
    };
    const onPause = () => {
      setIsPlaying(false);
      cancelAnimationFrame(animationFrame);
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      cancelAnimationFrame(animationFrame);
    };
  }, [src, isPlaying]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '12px 16px',
      backgroundColor: '#2d2d2d',
      borderRadius: '8px',
      minWidth: '320px',
      maxWidth: '400px'
    }}>
      {/* File info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '40px',
          height: '40px',
          backgroundColor: '#404040',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <FileText size={20} style={{ color: '#60a5fa' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <button
            onClick={handleDownload}
            style={{
              fontSize: '14px',
              color: '#60a5fa',
              background: 'none',
              border: 'none',
              padding: 0,
              margin: 0,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textAlign: 'left',
              maxWidth: '100%'
            }}
            title="Click to download"
          >
            {fileName || 'Audio file'}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={togglePlay}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            backgroundColor: '#404040',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          {isPlaying ? (
            <div style={{ display: 'flex', gap: '3px' }}>
              <div style={{ width: '3px', height: '12px', backgroundColor: 'white', borderRadius: '1px' }} />
              <div style={{ width: '3px', height: '12px', backgroundColor: 'white', borderRadius: '1px' }} />
            </div>
          ) : (
            <div style={{
              width: 0,
              height: 0,
              borderTop: '6px solid transparent',
              borderBottom: '6px solid transparent',
              borderLeft: '10px solid white',
              marginLeft: '2px'
            }} />
          )}
        </button>

        <span style={{ fontSize: '12px', color: '#9ca3af', minWidth: '70px' }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        {/* Progress bar */}
        <div style={{ flex: 1, position: 'relative', height: '20px', display: 'flex', alignItems: 'center' }}>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="progress-slider"
            style={{
              width: '100%',
              height: '4px',
              WebkitAppearance: 'none',
              appearance: 'none',
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(currentTime / (duration || 1)) * 100}%, #4b5563 ${(currentTime / (duration || 1)) * 100}%, #4b5563 100%)`,
              borderRadius: '2px',
              cursor: 'pointer',
              outline: 'none'
            }}
          />
        </div>

        {/* Volume control */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowVolume(!showVolume)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {volume === 0 ? (
              <div style={{ position: 'relative' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              </div>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            )}
          </button>
          
          {showVolume && (
            <div 
              style={{
                position: 'absolute',
                bottom: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '8px',
                backgroundColor: '#1f2937',
                borderRadius: '4px',
                marginBottom: '4px'
              }}
              onMouseLeave={() => setShowVolume(false)}
            >
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={volume}
                onChange={handleVolumeChange}
                style={{
                  width: '80px',
                  height: '4px',
                  WebkitAppearance: 'none',
                  appearance: 'none',
                  background: `linear-gradient(to right, ${primaryColor} 0%, ${primaryColor} ${volume * 100}%, #4b5563 ${volume * 100}%, #4b5563 100%)`,
                  borderRadius: '2px',
                  cursor: 'pointer'
                }}
                className="volume-slider"
              />
              <style jsx>{`
                .volume-slider::-webkit-slider-thumb {
                  -webkit-appearance: none !important;
                  appearance: none !important;
                  width: 12px !important;
                  height: 12px !important;
                  background: transparent !important;
                  border: none !important;
                  box-shadow: none !important;
                  border-radius: 50% !important;
                  cursor: pointer !important;
                }
                .volume-slider::-moz-range-thumb {
                  width: 12px !important;
                  height: 12px !important;
                  background: transparent !important;
                  border: none !important;
                  box-shadow: none !important;
                  border-radius: 50% !important;
                  cursor: pointer !important;
                }
                .volume-slider::-ms-thumb {
                  width: 12px !important;
                  height: 12px !important;
                  background: transparent !important;
                  border: none !important;
                  box-shadow: none !important;
                  border-radius: 50% !important;
                  cursor: pointer !important;
                }
                .progress-slider::-webkit-slider-thumb {
                  -webkit-appearance: none !important;
                  appearance: none !important;
                  width: 0 !important;
                  height: 0 !important;
                  background: transparent !important;
                  border: none !important;
                }
                .progress-slider::-moz-range-thumb {
                  width: 0 !important;
                  height: 0 !important;
                  background: transparent !important;
                  border: none !important;
                }
                .progress-slider::-ms-thumb {
                  width: 0 !important;
                  height: 0 !important;
                  background: transparent !important;
                  border: none !important;
                }
              `}</style>
            </div>
          )}
        </div>
      </div>

      <audio ref={audioRef} src={src} preload="metadata" />
    </div>
  );
}

const SELF_DESTRUCT_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '5s', value: 0.083 },
  { label: '10s', value: 0.167 },
  { label: '1m', value: 1 },
  { label: '1h', value: 60 },
  { label: '24h', value: 1440 },
];

// Generate deterministic shared key for this room based on room ID
// Both users will generate the same key
const getSharedKey = (roomId: string): string => {
  const keyName = `shared_key_${roomId}`;
  let key = localStorage.getItem(keyName);
  if (!key) {
    // Generate deterministic key from roomId using proper base64 encoding
    const encoder = new TextEncoder();
    const data = encoder.encode(`horizon_chat_key_${roomId}`);
    
    // Use crypto.subtle to derive a proper key if available, otherwise fallback
    const keyBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      keyBytes[i] = data[i % data.length] ^ (i * 7);
    }
    
    // Convert to base64
    let binary = '';
    for (let i = 0; i < keyBytes.length; i++) {
      binary += String.fromCharCode(keyBytes[i]);
    }
    key = btoa(binary);
    localStorage.setItem(keyName, key);
  }
  return key;
};

// Format file size to human readable
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default function ChatArea() {
  const { user } = useAuthStore();
  const { selectedRoom, messages, setMessages, setSelectedRoom, addMessage, deleteMessage, setRooms, rooms, setUnreadMessages, addUnreadMessage, clearUnreadForRoom } = useChatStore();
  const [inputMessage, setInputMessage] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [decryptedMessages, setDecryptedMessages] = useState<Record<string, string>>({});
  const [decryptedImages, setDecryptedImages] = useState<Record<string, string>>({});
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [decryptedVideos, setDecryptedVideos] = useState<Record<string, string>>({});
  const [decryptedAudio, setDecryptedAudio] = useState<Record<string, string>>({});
  const [selfDestructMinutes, setSelfDestructMinutes] = useState(0);
  
  // Get room-specific localStorage key
  const getSelfDestructKey = useCallback(() => {
    return selectedRoom ? `selfDestructMinutes_${selectedRoom.id}` : 'selfDestructMinutes';
  }, [selectedRoom]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [modalUser, setModalUser] = useState<{id: string, username: string, pfpUrl?: string, createdAt?: string} | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [showMediaPanel, setShowMediaPanel] = useState(false);
  const [mediaItems, setMediaItems] = useState<Array<{id: string, url: string, type: 'image' | 'video' | 'gif', fileName?: string}>>([]);
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);

  // Update media items in real-time when messages change
  useEffect(() => {
    const items: Array<{id: string, url: string, type: 'image' | 'video' | 'gif', fileName?: string}> = [];
    messages.forEach(msg => {
      // Add uploaded files (images/videos)
      if (msg.fileUrl && (msg.fileType?.startsWith('image/') || msg.fileType?.startsWith('video/'))) {
        const decryptedUrl = decryptedImages[msg.id] || decryptedVideos[msg.id];
        if (decryptedUrl && decryptedUrl !== 'error') {
          items.push({
            id: msg.id,
            url: decryptedUrl,
            type: msg.fileType.startsWith('image/') ? 'image' : 'video',
            fileName: msg.fileName
          });
        }
      }
      // Add GIF links from message content (check both decrypted and raw content)
      const textToCheck = decryptedMessages[msg.id] || msg.content;
      if (textToCheck && !msg.fileUrl) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const matches = textToCheck.match(urlRegex) || [];
        matches.forEach((url, idx) => {
          const lowerUrl = url.toLowerCase();
          if (lowerUrl.includes('.gif') || lowerUrl.includes('giphy.com') || lowerUrl.includes('tenor.com') || lowerUrl.includes('discordapp.net')) {
            items.push({
              id: `${msg.id}-gif-${idx}`,
              url: url,
              type: 'gif',
              fileName: 'GIF'
            });
          }
        });
      }
    });
    setMediaItems(items);
  }, [messages, decryptedImages, decryptedVideos, decryptedMessages]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [uploadStatus, setUploadStatus] = useState<Record<string, string>>({});
  const [showSizeWarning, setShowSizeWarning] = useState(false);

  // Load from localStorage on client side only - per room
  useEffect(() => {
    if (selectedRoom) {
      const saved = localStorage.getItem(getSelfDestructKey());
      setSelfDestructMinutes(saved ? parseFloat(saved) : 0);
    }
  }, [selectedRoom, getSelfDestructKey]);
  const [isUploading, setIsUploading] = useState(false);
  const [filePreviews, setFilePreviews] = useState<FilePreview[]>([]);
  const [systemMessages, setSystemMessages] = useState<SystemMessage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [profileUser, setProfileUser] = useState<{id: string, username: string, pfpUrl?: string, createdAt?: string} | null>(null);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [groupFriends, setGroupFriends] = useState<Array<{id: string; username: string; pfpUrl?: string}>>([]);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const isGroupOwner = selectedRoom?.type === 'GROUP' && selectedRoom?.ownerId === user?.id;

  // Group consecutive images from same sender
  const groupedMessages = useMemo(() => {
    const grouped: Array<{type: 'single', message: ChatMessage} | {type: 'imageGroup', messages: ChatMessage[]}> = [];
    let currentImageGroup: ChatMessage[] = [];
    
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const isImage = message.fileType?.startsWith('image/');
      const prevMessage = messages[i - 1];
      
      if (isImage && decryptedImages[message.id] && decryptedImages[message.id] !== 'error') {
        const isSameSender = currentImageGroup.length === 0 || currentImageGroup[0].senderId === message.senderId;
        const isConsecutive = !prevMessage || (prevMessage.senderId === message.senderId && prevMessage.fileType?.startsWith('image/'));
        
        if (isSameSender && isConsecutive) {
          currentImageGroup.push(message);
        } else {
          if (currentImageGroup.length > 0) {
            grouped.push({ type: 'imageGroup', messages: [...currentImageGroup] });
            currentImageGroup = [];
          }
          currentImageGroup = [message];
        }
      } else {
        if (currentImageGroup.length > 0) {
          grouped.push({ type: 'imageGroup', messages: [...currentImageGroup] });
          currentImageGroup = [];
        }
        grouped.push({ type: 'single', message });
      }
    }
    
    if (currentImageGroup.length > 0) {
      grouped.push({ type: 'imageGroup', messages: currentImageGroup });
    }
    
    return grouped;
  }, [messages, decryptedImages]);
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupImage, setEditingGroupImage] = useState(false);
  const groupImageInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  // Helper to add files with preview URLs
  const addFilesToPreview = (files: File[]) => {
    const newPreviews: FilePreview[] = files.map(file => {
      const previewUrl = file.type?.startsWith('image/') || file.type === 'image/gif' 
        ? URL.createObjectURL(file) 
        : undefined;
      return {
        id: Math.random().toString(36).substring(2, 9),
        name: file.name,
        type: file.type,
        size: file.size,
        file,
        previewUrl
      };
    });
    setFilePreviews(prev => [...prev, ...newPreviews].slice(0, 20));
  };

  const removeFilePreview = (id: string) => {
    setFilePreviews(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
      return prev.filter(f => f.id !== id);
    });
  };

  const handleUpdateGroupName = async () => {
    if (!selectedRoom || !newGroupName.trim()) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/rooms/${selectedRoom.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: newGroupName.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedRoom(data.room);
        setEditingGroupName(false);
        setNewGroupName('');
      }
    } catch (error) {
      console.error('Failed to update group name:', error);
    }
  };

  const handleUpdateGroupImage = async (file: File) => {
    if (!selectedRoom) return;
    try {
      const uploadResponse = await fileAPI.upload(file, '', 'groups');
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/rooms/${selectedRoom.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ groupImage: uploadResponse.data.file.url })
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedRoom(data.room);
        setEditingGroupImage(false);
      }
    } catch (error) {
      console.error('Failed to update group image:', error);
    }
  };

  const loadFriendsForGroup = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/friends', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      // Filter out existing members
      const existingMemberIds = new Set(selectedRoom?.members?.map(m => m.user.id) || []);
      setGroupFriends((data.friends || []).filter((f: any) => !existingMemberIds.has(f.id)));
    } catch (error) {
      console.error('Failed to load friends:', error);
    }
  };

  const handleDeleteGroup = async () => {
    if (!selectedRoom || !confirm('Are you sure you want to delete this group?')) return;
    try {
      const token = localStorage.getItem('token');
      const roomId = selectedRoom.id;
      const res = await fetch(`/api/rooms/${roomId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        // Remove room from list immediately using functional update
        setRooms(prev => prev.filter(r => r.id !== roomId));
        setSelectedRoom(null);
        setShowGroupSettings(false);
      }
    } catch (error) {
      console.error('Failed to delete group:', error);
    }
  };

  const handleKickMember = async (targetUserId: string) => {
    if (!selectedRoom) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/rooms/${selectedRoom.id}/kick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ targetUserId })
      });
      if (res.ok) {
        // Refresh room data to get updated members list
        const roomRes = await fetch(`/api/rooms/${selectedRoom.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (roomRes.ok) {
          const roomData = await roomRes.json();
          const updatedRoom = roomData.room;
          setSelectedRoom(updatedRoom);
          // Update friends list using the updated room data directly
          const friendsRes = await fetch('/api/friends', {
            headers: { Authorization: `Bearer ${token}` }
          });
          const friendsData = await friendsRes.json();
          const existingMemberIds = new Set(updatedRoom?.members?.map((m: any) => m.user.id) || []);
          setGroupFriends((friendsData.friends || []).filter((f: any) => !existingMemberIds.has(f.id)));
        }
      }
    } catch (error) {
      console.error('Failed to kick member:', error);
    }
  };

  const handleAddMember = async (targetUserId: string) => {
    if (!selectedRoom) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/rooms/${selectedRoom.id}/add-member`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ targetUserId })
      });
      if (res.ok) {
        // Refresh room data to get updated members list
        const roomRes = await fetch(`/api/rooms/${selectedRoom.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (roomRes.ok) {
          const roomData = await roomRes.json();
          const updatedRoom = roomData.room;
          setSelectedRoom(updatedRoom);
          // Update friends list using the updated room data directly
          const friendsRes = await fetch('/api/friends', {
            headers: { Authorization: `Bearer ${token}` }
          });
          const friendsData = await friendsRes.json();
          const existingMemberIds = new Set(updatedRoom?.members?.map((m: any) => m.user.id) || []);
          setGroupFriends((friendsData.friends || []).filter((f: any) => !existingMemberIds.has(f.id)));
        }
      }
    } catch (error) {
      console.error('Failed to add member:', error);
    }
  };

  const handleLeaveGroup = async () => {
    if (!selectedRoom || !confirm('Are you sure you want to leave this group?')) return;
    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/rooms/${selectedRoom.id}/leave`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedRoom(null);
      setShowGroupSettings(false);
    } catch (error) {
      console.error('Failed to leave group:', error);
    }
  };
  const dropZoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedRoom || !user) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    const newSocket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000', {
      auth: { token },
    });

    newSocket.on('connect', () => {
      newSocket.emit('join-room', selectedRoom.id);
    });

    newSocket.on('new-message', async (message: ChatMessage) => {
      addMessage(message);
      await decryptMessage(message);
      // Increment unread count if message is not from current user and not in selected room
      if (message.senderId !== user?.id && message.roomId !== selectedRoom?.id) {
        setUnreadMessages(prev => prev + 1);
      }
    });

    newSocket.on('message-deleted', ({ messageId }: { messageId: string }) => {
      deleteMessage(messageId);
      // Clean up decrypted content
      setDecryptedMessages(prev => {
        const newState = { ...prev };
        delete newState[messageId];
        return newState;
      });
      setDecryptedImages(prev => {
        const newState = { ...prev };
        delete newState[messageId];
        return newState;
      });
    });

    // Listen for room deletion (when blocked or unfriended)
    newSocket.on('room-deleted', ({ roomId }: { roomId: string }) => {
      if (selectedRoom?.id === roomId) {
        setSelectedRoom(null);
        setMessages([]);
      }
    });

    // Listen for online status updates
    newSocket.on('user-status', ({ userId, status }: { userId: string; status: 'online' | 'offline' }) => {
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

    newSocket.on('online-users', (userIds: string[]) => {
      setOnlineUsers(new Set(userIds));
    });

    // Request online users list on connect
    newSocket.emit('get-online-users');

    // Listen for user updates (username changes)
    newSocket.on('user-updated', ({ userId, username }: { userId: string; username: string }) => {
      // Update sender username in existing messages
      const currentMessages = messages;
      const updatedMessages = currentMessages.map((msg: any) => 
        msg.senderId === userId 
          ? { ...msg, sender: { ...msg.sender, username } }
          : msg
      );
      setMessages(updatedMessages);
    });

    // Listen for PFP updates
    newSocket.on('user-pfp-updated', ({ userId, pfpUrl }: { userId: string; pfpUrl: string }) => {
      // Update sender PFP in existing messages
      const currentMessages = messages;
      const updatedMessages = currentMessages.map((msg: any) => 
        msg.senderId === userId 
          ? { ...msg, sender: { ...msg.sender, pfpUrl } }
          : msg
      );
      setMessages(updatedMessages);
      // Update selected room members if applicable
      if (selectedRoom) {
        const updatedMembers = selectedRoom.members?.map((m: any) => 
          m.user?.id === userId 
            ? { ...m, user: { ...m.user, pfpUrl } }
            : m
        );
        if (updatedMembers) {
          setSelectedRoom({ ...selectedRoom, members: updatedMembers });
        }
      }
    });

    // Listen for friends list updates (when blocked or unfriended)
    newSocket.on('friends-updated', () => {
      // Check if current chat partner is still a friend
      if (selectedRoom && selectedRoom.type === 'DM') {
        const token = localStorage.getItem('token');
        fetch('/api/friends', {
          headers: { Authorization: `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
          const friendIds = (data.friends || []).map((f: any) => f.id);
          const otherMember = selectedRoom.members?.find((m: any) => m.user?.id !== user?.id);
          const otherUserId = otherMember?.user?.id;
          if (otherUserId && !friendIds.includes(otherUserId)) {
            // No longer friends, close the chat
            setSelectedRoom(null);
            setMessages([]);
          }
        });
      }
    });

    // Listen for group updates (kick, leave, add, delete, info update)
    newSocket.on('group-updated', (data: { roomId: string; type: 'member-left' | 'member-kicked' | 'member-added' | 'group-deleted' | 'group-info-updated'; userId?: string; room?: any }) => {
      // If user was added to a group and it's not the current room, add unread notification
      if (data.type === 'member-added' && data.userId === user?.id && data.roomId !== selectedRoom?.id) {
        setUnreadMessages(prev => prev + 1);
        addUnreadMessage(data.roomId, 'system', 'You were added to a group');
      }
      
      if (selectedRoom?.id === data.roomId) {
        if (data.type === 'group-deleted') {
          // Group was deleted, close the chat
          setSelectedRoom(null);
          setMessages([]);
        } else if (data.type === 'member-kicked' && data.userId === user?.id) {
          // Current user was kicked, close the chat
          setSelectedRoom(null);
          setMessages([]);
        } else if (data.type === 'group-info-updated' && data.room) {
          // Group name or image was updated - update immediately
          setSelectedRoom(data.room);
        } else {
          // Refresh room data to show updated member list
          const token = localStorage.getItem('token');
          fetch('/api/rooms', { headers: { Authorization: `Bearer ${token}` } })
            .then(res => res.json())
            .then(data => {
              const updatedRoom = data.rooms.find((r: any) => r.id === selectedRoom.id);
              if (updatedRoom) {
                setSelectedRoom(updatedRoom);
              }
            });
        }
      }
    });

    newSocket.on('system-message', (sysMsg: SystemMessage) => {
      setSystemMessages(prev => [...prev, sysMsg]);
      // Auto-remove system message after 10 seconds
      setTimeout(() => {
        setSystemMessages(prev => prev.filter(m => m !== sysMsg));
      }, 10000);
    });

    // Sync self-destruct setting from other user
    newSocket.on('self-destruct-sync', ({ minutes }: { minutes: number }) => {
      setSelfDestructMinutes(minutes);
      localStorage.setItem(getSelfDestructKey(), minutes.toString());
    });

    // Listen for force logout (when password is reset)
    newSocket.on('force-logout', ({ userId }: { userId: string }) => {
      if (userId === user?.id) {
        // Clear all local storage and redirect to login
        localStorage.removeItem('token');
        localStorage.removeItem('privateKey');
        localStorage.removeItem('currentUserId');
        localStorage.removeItem('horizon_notifications');
        window.location.href = '/';
      }
    });

    // Respond to requests for current self-destruct setting
    newSocket.on('self-destruct-setting-requested', () => {
      const currentMinutes = parseFloat(localStorage.getItem(getSelfDestructKey()) || '0');
      newSocket.emit('self-destruct-setting-response', {
        roomId: selectedRoom.id,
        minutes: currentMinutes
      });
    });

    // Respond to request for new member joining
    newSocket.on('request-self-destruct-for-new-member', ({ newMemberId }: { newMemberId: string }) => {
      // Only respond if we're not the new member (we have the current setting)
      if (user?.id !== newMemberId) {
        const currentMinutes = parseFloat(localStorage.getItem(getSelfDestructKey()) || '0');
        newSocket.emit('self-destruct-setting-response', {
          roomId: selectedRoom.id,
          minutes: currentMinutes
        });
      }
    });

    // Request current self-destruct setting when joining (with a small delay to let other user connect)
    setTimeout(() => {
      newSocket.emit('request-self-destruct-setting', { roomId: selectedRoom.id });
    }, 500);

    setSocket(newSocket);

    return () => {
      newSocket.emit('leave-room', selectedRoom.id);
      newSocket.close();
    };
  }, [selectedRoom, user]);

  useEffect(() => {
    if (selectedRoom) {
      loadMessages();
      setSystemMessages([]); // Clear system messages when switching rooms
    }
  }, [selectedRoom]);

  // Check for expired self-destruct messages every second
  useEffect(() => {
    if (!messages.length) return;

    const interval = setInterval(() => {
      const now = new Date();
      const validMessages = messages.filter(msg => {
        if (!msg.selfDestruct) return true;
        const destructTime = new Date(msg.selfDestruct);
        return destructTime > now;
      });

      // Only update if we actually removed messages
      if (validMessages.length < messages.length) {
        setMessages(validMessages);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [messages, setMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Drag and drop handlers
  useEffect(() => {
    const dropZone = dropZoneRef.current;
    if (!dropZone) return;

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        addFilesToPreview(Array.from(files).slice(0, 20));
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            addFilesToPreview([{
              ...file,
              name: file.name || 'pasted-image.png'
            } as File]);
          }
          break;
        }
      }
    };

    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);
    document.addEventListener('paste', handlePaste);

    return () => {
      dropZone.removeEventListener('dragover', handleDragOver);
      dropZone.removeEventListener('dragleave', handleDragLeave);
      dropZone.removeEventListener('drop', handleDrop);
      document.removeEventListener('paste', handlePaste);
    };
  }, [selectedRoom]);

  const loadMessages = async () => {
    if (!selectedRoom) return;
    try {
      const response = await roomAPI.getMessages(selectedRoom.id);
      setMessages(response.data.messages);
      for (const message of response.data.messages) {
        await decryptMessage(message);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const decryptMessage = async (message: ChatMessage) => {
    console.log('decryptMessage called:', message.id, 'fileType:', message.fileType, 'fileUrl:', !!message.fileUrl);
    if (message.isDeleted) {
      console.log('Message is deleted, returning');
      return;
    }
    if (decryptedMessages[message.id]) {
      console.log('Message already decrypted, returning');
      return;
    }
    
    try {
      const sharedKey = getSharedKey(message.roomId);
      
      // Skip decryption for old messages that don't have proper AES encryption
      if (!message.iv || message.iv.length < 10) {
        console.log('No valid IV, skipping text decryption');
        setDecryptedMessages(prev => ({ ...prev, [message.id]: '[Encrypted - cannot decrypt]' }));
        // Don't return - still try to decrypt image
      } else {
        // Validate base64 before attempting decryption
        const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
        if (!base64Regex.test(message.content) || !base64Regex.test(message.iv)) {
          console.log('Invalid base64, skipping text decryption');
          setDecryptedMessages(prev => ({ ...prev, [message.id]: '[Encrypted - cannot decrypt]' }));
          // Don't return - still try to decrypt image
        } else {
          const decrypted = await CryptoService.decryptWithAES(
            { content: message.content, iv: message.iv },
            sharedKey
          );
          setDecryptedMessages(prev => ({ ...prev, [message.id]: decrypted }));
        }
      }
    } catch (error) {
      console.error('Failed to decrypt message:', error);
      setDecryptedMessages(prev => ({ ...prev, [message.id]: '[Unable to decrypt - old message format]' }));
    }

    // Decrypt image separately - don't block on text decryption failure
    console.log('Checking if image:', message.fileType, 'has URL:', !!message.fileUrl);
    if (message.fileType?.startsWith('image/') && message.fileUrl) {
      console.log('YES - Decrypting image:', message.id, 'IV exists:', !!message.iv);
      try {
        console.log('IV value:', message.iv?.substring(0, 20) + '...');
        
        // Validate IV before attempting decryption
        const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
        if (!message.iv || !base64Regex.test(message.iv)) {
          console.log('Invalid IV for image, skipping decryption');
          setDecryptedImages(prev => ({ ...prev, [message.id]: 'error' }));
          return;
        }

        const sharedKey = getSharedKey(message.roomId);
        console.log('Got shared key, fetching image...');
        
        const response = await fetch(getFullFileUrl(message.fileUrl));
        console.log('Image fetch status:', response.status);
        
        const encryptedBlob = await response.blob();
        console.log('Encrypted blob size:', encryptedBlob.size);
        
        const encryptedBuffer = await encryptedBlob.arrayBuffer();
        console.log('Encrypted buffer length:', encryptedBuffer.byteLength);
        
        const decryptedBuffer = await CryptoService.decryptFileWithAES(
          encryptedBuffer,
          message.iv,
          sharedKey
        );
        console.log('Decrypted buffer length:', decryptedBuffer.byteLength);
        
        const blob = new Blob([decryptedBuffer], { type: message.fileType });
        const url = URL.createObjectURL(blob);
        console.log('Created blob URL:', url);
        
        setDecryptedImages(prev => ({ ...prev, [message.id]: url }));
      } catch (err) {
        console.error('Failed to decrypt image:', err);
        setDecryptedImages(prev => ({ ...prev, [message.id]: 'error' }));
      }
    }

    // Decrypt video separately (check both MIME type and file extension)
    const isVideoFile = message.fileType?.startsWith('video/') || 
                        message.fileName?.toLowerCase().endsWith('.mp4') ||
                        message.fileName?.toLowerCase().endsWith('.webm') ||
                        message.fileName?.toLowerCase().endsWith('.mov') ||
                        message.fileName?.toLowerCase().endsWith('.avi');
    if (isVideoFile && message.fileUrl && !decryptedVideos[message.id]) {
      try {
        const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
        if (!message.iv || !base64Regex.test(message.iv)) {
          setDecryptedVideos(prev => ({ ...prev, [message.id]: 'error' }));
          return;
        }

        const sharedKey = getSharedKey(message.roomId);
        const response = await fetch(getFullFileUrl(message.fileUrl));
        const encryptedBlob = await response.blob();
        const encryptedBuffer = await encryptedBlob.arrayBuffer();
        const decryptedBuffer = await CryptoService.decryptFileWithAES(
          encryptedBuffer,
          message.iv,
          sharedKey
        );
        
        const blob = new Blob([decryptedBuffer], { type: message.fileType || 'video/mp4' });
        const url = URL.createObjectURL(blob);
        setDecryptedVideos(prev => ({ ...prev, [message.id]: url }));
      } catch (err) {
        console.error('Failed to decrypt video:', err);
        setDecryptedVideos(prev => ({ ...prev, [message.id]: 'error' }));
      }
    }

    // Decrypt audio separately
    if (message.fileType?.startsWith('audio/') && message.fileUrl) {
      try {
        const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
        if (!message.iv || !base64Regex.test(message.iv)) {
          setDecryptedAudio(prev => ({ ...prev, [message.id]: 'error' }));
          return;
        }

        const sharedKey = getSharedKey(message.roomId);
        const response = await fetch(getFullFileUrl(message.fileUrl));
        const encryptedBlob = await response.blob();
        const encryptedBuffer = await encryptedBlob.arrayBuffer();
        const decryptedBuffer = await CryptoService.decryptFileWithAES(
          encryptedBuffer,
          message.iv,
          sharedKey
        );
        
        const blob = new Blob([decryptedBuffer], { type: message.fileType });
        const url = URL.createObjectURL(blob);
        setDecryptedAudio(prev => ({ ...prev, [message.id]: url }));
      } catch (err) {
        console.error('Failed to decrypt audio:', err);
        setDecryptedAudio(prev => ({ ...prev, [message.id]: 'error' }));
      }
    }
  };

  const handleSend = async () => {
    // If there are file previews, send files instead
    if (filePreviews.length > 0) {
      await handleFileUpload();
      return;
    }
    if (!inputMessage.trim() || !socket || !selectedRoom || !user) return;

    try {
      const sharedKey = getSharedKey(selectedRoom.id);
      const encrypted = await CryptoService.encryptWithAES(inputMessage, sharedKey);

      socket.emit('send-message', {
        roomId: selectedRoom.id,
        content: encrypted.content,
        encryptedKey: '', // Not needed for AES
        iv: encrypted.iv,
        selfDestructMinutes: selfDestructMinutes > 0 ? selfDestructMinutes : undefined,
      });

      setInputMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      // Reset input value so the same file can be selected again
      e.target.value = '';
      return;
    }
    addFilesToPreview(Array.from(files).slice(0, 20));
    // Reset input value so the same file can be selected again
    e.target.value = '';
  };

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  const handleFileUpload = async () => {
    if (filePreviews.length === 0 || !socket || !selectedRoom || !user) {
      return;
    }

    // Check file sizes
    const oversizedFiles = filePreviews.filter(p => p.file.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      setShowSizeWarning(true);
      return;
    }

    // Keep previews visible during upload for status display
    const previewsToUpload = [...filePreviews];
    setIsUploading(true);

    const sharedKey = getSharedKey(selectedRoom.id);

    // Upload all files in parallel for faster processing
    const uploadPromises = previewsToUpload.map(async (filePreview) => {
      try {
        setUploadStatus(prev => ({ ...prev, [filePreview.name]: 'Encrypting...' }));
        const fileBuffer = await filePreview.file.arrayBuffer();
        const encrypted = await CryptoService.encryptFileWithAES(fileBuffer, sharedKey);
        const encryptedBlob = new Blob([encrypted.encryptedData]);
        const iv = encrypted.iv;

        const encryptedFile = new File([encryptedBlob], filePreview.name, { type: filePreview.type });

        // Show uploading status
        setUploadStatus(prev => ({ ...prev, [filePreview.name]: 'Uploading...' }));
        
        const uploadResponse = await fileAPI.upload(encryptedFile, '', undefined, (progress) => {
          setUploadProgress(prev => ({ ...prev, [filePreview.name]: progress }));
        });

        socket.emit('send-message', {
          roomId: selectedRoom.id,
          content: `[File: ${filePreview.name}]`,
          encryptedKey: '',
          iv: iv,
          fileUrl: uploadResponse.data.file.url,
          fileName: filePreview.name,
          fileType: filePreview.type,
        });
        // Clear progress and status for this file
        setUploadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[filePreview.name];
          return newProgress;
        });
        setUploadStatus(prev => {
          const newStatus = { ...prev };
          delete newStatus[filePreview.name];
          return newStatus;
        });
      } catch (error: any) {
        console.error('Failed to upload file:', filePreview.name, error);
        const errorMsg = error.response?.status === 413 ? 'File too large' : 
                        error.response?.status === 504 ? 'Upload timeout' :
                        error.message || 'Upload failed';
        setUploadErrors(prev => ({ ...prev, [filePreview.name]: errorMsg }));
        setUploadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[filePreview.name];
          return newProgress;
        });
        setUploadStatus(prev => {
          const newStatus = { ...prev };
          delete newStatus[filePreview.name];
          return newStatus;
        });
      }
    });

    await Promise.all(uploadPromises);
    
    // Clear previews and revoke URLs
    filePreviews.forEach(f => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    setFilePreviews([]);
    setUploadStatus({});
    setIsUploading(false);
    // Clear errors after 5 seconds
    setTimeout(() => setUploadErrors({}), 5000);
  };

  const handleDownload = async (message: ChatMessage) => {
    if (!message.fileUrl) return;
    
    try {
      const sharedKey = getSharedKey(message.roomId);
      const response = await fetch(getFullFileUrl(message.fileUrl!));
      const encryptedBlob = await response.blob();
      const encryptedBuffer = await encryptedBlob.arrayBuffer();
      const decryptedBuffer = await CryptoService.decryptFileWithAES(
        encryptedBuffer,
        message.iv,
        sharedKey
      );
      
      const blob = new Blob([decryptedBuffer]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = message.fileName || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download file:', error);
      alert('Failed to download file');
    }
  };

  const handleDelete = (messageId: string) => {
    if (!socket) return;
    // Instantly remove from local state for immediate feedback
    deleteMessage(messageId);
    // Clean up decrypted content
    setDecryptedMessages(prev => {
      const newState = { ...prev };
      delete newState[messageId];
      return newState;
    });
    setDecryptedImages(prev => {
      const newState = { ...prev };
      delete newState[messageId];
      return newState;
    });
    socket.emit('delete-message', { messageId, roomId: selectedRoom?.id });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFullFileUrl = (url: string) => {
    if (url.startsWith('http')) return url;
    return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${url}`;
  };

  const getOtherMember = () => {
    if (!selectedRoom || !user) return null;
    return selectedRoom.members.find((m: any) => m.user.id !== user.id);
  };

  const handleOpenUserModal = async () => {
    const otherMember = getOtherMember();
    if (otherMember && selectedRoom?.type === 'DM') {
      // Fetch full user profile to get createdAt
      try {
        const res = await fetch(`/api/auth/user/${encodeURIComponent(otherMember.user.username)}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (res.ok) {
          const data = await res.json();
          setModalUser({
            id: otherMember.user.id,
            username: otherMember.user.username,
            pfpUrl: otherMember.user.pfpUrl,
            createdAt: data.user?.createdAt
          });
        } else {
          setModalUser({
            id: otherMember.user.id,
            username: otherMember.user.username,
            pfpUrl: otherMember.user.pfpUrl
          });
        }
      } catch {
        setModalUser({
          id: otherMember.user.id,
          username: otherMember.user.username,
          pfpUrl: otherMember.user.pfpUrl
        });
      }
      setShowUserModal(true);
    }
  };

  const handleUnfriend = async () => {
    if (!modalUser) return;
    try {
      const res = await fetch(`/api/friends/unfriend/${modalUser.id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        // Remove the room from the list
        setRooms(rooms.filter(r => r.id !== selectedRoom?.id));
        setSelectedRoom(null);
      }
    } catch (error) {
      console.error('Failed to unfriend:', error);
    }
  };

  const handleBlock = async () => {
    if (!modalUser) return;
    try {
      const res = await fetch(`/api/friends/block/${modalUser.id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        // Remove the room from the list
        setRooms(rooms.filter(r => r.id !== selectedRoom?.id));
        setSelectedRoom(null);
      }
    } catch (error) {
      console.error('Failed to block:', error);
    }
  };

  const handleDeleteChat = async () => {
    if (!selectedRoom) return;
    try {
      const res = await fetch(`/api/rooms/${selectedRoom.id}/leave`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        // Remove the room from the list for this user only
        setRooms(rooms.filter(r => r.id !== selectedRoom.id));
        setSelectedRoom(null);
        // Clear last opened chat
        localStorage.removeItem('lastOpenedChat');
      }
    } catch (error) {
      console.error('Failed to delete chat:', error);
    }
  };

  const primaryBg = user?.primaryColor || '#0f172a';
  const secondaryBg = user?.secondaryColor || '#1e293b';
  const primaryColor = user?.primaryColor || '#3b82f6';
  const textColor = '#ffffff';

  // Discord-style: Focus input on any key press when not typing in an input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is already typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Don't intercept special keys
      if (e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }

      // Don't intercept navigation/function keys
      if (['Escape', 'Tab', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Delete'].includes(e.key)) {
        return;
      }

      // Focus the message input and append the key
      if (messageInputRef.current && selectedRoom) {
        messageInputRef.current.focus();
        // Append the character to the input
        if (e.key.length === 1) {
          setInputMessage(prev => prev + e.key);
          // Prevent default to avoid double input
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRoom]);

  if (!selectedRoom) {
    return null;
  }

  return (
    <div style={{ flex: 1, display: 'flex', backgroundColor: primaryBg, height: '100%' }}>
      {/* Main Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <div style={{ 
          height: '60px', 
          borderBottom: `1px solid ${secondaryBg}`, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          padding: '0 20px',
          backgroundColor: primaryBg
        }}>
        <div 
          style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: selectedRoom?.type === 'DM' ? 'pointer' : 'default' }}
          onClick={handleOpenUserModal}
        >
          {selectedRoom?.type === 'GROUP' ? (
            selectedRoom.groupImage ? (
              <img
                src={getFullFileUrl(selectedRoom.groupImage)}
                alt=""
                style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ 
                width: '36px', 
                height: '36px', 
                borderRadius: '50%', 
                backgroundColor: secondaryBg,
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                fontSize: '16px',
                fontWeight: 'bold',
                color: 'white'
              }}>
                {selectedRoom.name.charAt(0).toUpperCase()}
              </div>
            )
          ) : getOtherMember()?.user.pfpUrl ? (
            <img
              src={getFullFileUrl(getOtherMember()?.user.pfpUrl!)}
              alt=""
              style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ 
              width: '36px', 
              height: '36px', 
              borderRadius: '50%', 
              backgroundColor: secondaryBg,
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}>
              <User size={18} style={{ color: 'white' }} />
            </div>
          )}
          <div>
            {selectedRoom?.type === 'GROUP' && isGroupOwner && editingGroupName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder={selectedRoom.name}
                  autoFocus
                  style={{
                    fontWeight: 600,
                    color: 'white',
                    fontSize: '16px',
                    backgroundColor: secondaryBg,
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleUpdateGroupName}
                  style={{
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    cursor: 'pointer',
                  }}
                >
                  <Check size={16} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontWeight: 600, color: 'white', fontSize: '16px' }}>
                  {selectedRoom?.type === 'GROUP' ? selectedRoom.name : getOtherMember()?.user.username}
                </h3>
                {selectedRoom?.type === 'GROUP' && isGroupOwner && (
                  <button
                    onClick={() => {
                      setNewGroupName(selectedRoom.name);
                      setEditingGroupName(true);
                    }}
                    style={{
                      backgroundColor: 'transparent',
                      color: '#94a3b8',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px',
                    }}
                    title="Edit group name"
                  >
                    <Edit2 size={14} />
                  </button>
                )}
              </div>
            )}
            {selectedRoom?.type === 'DM' && getOtherMember()?.user.id && (
              <p style={{ 
                fontSize: '12px', 
                color: onlineUsers.has(getOtherMember()!.user.id) ? '#10b981' : '#6b7280',
                display: 'flex', 
                alignItems: 'center', 
                gap: '4px' 
              }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: onlineUsers.has(getOtherMember()!.user.id) ? '#10b981' : '#6b7280'
                }} />
                {onlineUsers.has(getOtherMember()!.user.id) ? 'Online' : 'Offline'}
              </p>
            )}
            {selectedRoom?.type !== 'DM' && (
              <p style={{ fontSize: '12px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Lock size={10} />
                End-to-end encrypted
              </p>
            )}
          </div>
        </div>

        {/* Right side buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Media Gallery Button */}
          <button
            onClick={() => {
              // Collect all media from messages
              const items: Array<{id: string, url: string, type: 'image' | 'video', fileName?: string}> = [];
              messages.forEach(msg => {
                if (msg.fileUrl && (msg.fileType?.startsWith('image/') || msg.fileType?.startsWith('video/'))) {
                  const decryptedUrl = decryptedImages[msg.id] || decryptedVideos[msg.id];
                  if (decryptedUrl && decryptedUrl !== 'error') {
                    items.push({
                      id: msg.id,
                      url: decryptedUrl,
                      type: msg.fileType.startsWith('image/') ? 'image' : 'video',
                      fileName: msg.fileName
                    });
                  }
                }
              });
              setMediaItems(items);
              setShowMediaPanel(true);
            }}
            style={{
              backgroundColor: 'transparent',
              color: '#94a3b8',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '8px',
            }}
            title="Media Gallery"
          >
            <ImageIcon size={20} />
          </button>

          {/* Group Settings Button */}
          {selectedRoom?.type === 'GROUP' && (
            <button
              onClick={() => {
                loadFriendsForGroup();
                setNewGroupName(selectedRoom?.name || '');
                setAddMemberSearch('');
                setShowGroupSettings(true);
              }}
              style={{
                backgroundColor: 'transparent',
                color: '#94a3b8',
                border: 'none',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '8px',
              }}
              title="Group Settings"
            >
              <Settings size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Messages with Drop Zone */}
      <div 
        ref={dropZoneRef}
        style={{ 
          flex: 1, 
          position: 'relative',
          overflowY: 'auto', 
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        {/* Drag Overlay */}
        {isDragging && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: `${secondaryBg}33`,
            border: `2px dashed ${secondaryBg}`,
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            pointerEvents: 'none'
          }}>
            <div style={{
              backgroundColor: secondaryBg,
              padding: '20px 40px',
              borderRadius: '12px',
              textAlign: 'center'
            }}>
              <p style={{ color: 'white', fontSize: '18px', fontWeight: 600 }}>Drop file to upload</p>
            </div>
          </div>
        )}
        {messages.length === 0 && systemMessages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#64748b', marginTop: '40px' }}>
            <p>No messages yet</p>
            <p style={{ fontSize: '14px', marginTop: '4px' }}>Start the conversation!</p>
          </div>
        )}

        {/* Group consecutive images from same sender */}
        {groupedMessages.map((group, groupIndex) => {
            if (group.type === 'imageGroup') {
              const firstMsg = group.messages[0];
              const isMe = firstMsg.senderId === user?.id;
              
              return (
                <div
                  key={`group-${groupIndex}`}
                  style={{ 
                    display: 'flex', 
                    gap: '12px', 
                    flexDirection: isMe ? 'row-reverse' : 'row',
                    alignItems: 'flex-start'
                  }}
                >
                  {/* Avatar */}
                  <div style={{ flexShrink: 0 }}>
                    <button
                      onClick={() => setProfileUser({
                        id: firstMsg.sender.id,
                        username: firstMsg.sender.username,
                        pfpUrl: firstMsg.sender.pfpUrl
                      })}
                      style={{ padding: 0, background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      {firstMsg.sender.pfpUrl ? (
                        <img
                          src={getFullFileUrl(firstMsg.sender.pfpUrl)}
                          alt=""
                          style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{ 
                          width: '36px', 
                          height: '36px', 
                          borderRadius: '50%', 
                          backgroundColor: secondaryBg,
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center' 
                        }}>
                          <User size={18} style={{ color: 'white' }} />
                        </div>
                      )}
                    </button>
                  </div>

                  {/* Image Grid */}
                  <div style={{ maxWidth: '60%', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                    {/* Username and Time */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: '#94a3b8' }}>
                        {firstMsg.sender.username}
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        {format(new Date(firstMsg.createdAt), 'HH:mm')}
                      </span>
                    </div>

                    {/* Grid */}
                    <div style={{ 
                      display: 'grid',
                      gridTemplateColumns: group.messages.length === 1 ? '1fr' : group.messages.length === 2 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
                      gap: '4px',
                      maxWidth: group.messages.length === 1 ? '300px' : group.messages.length === 2 ? '240px' : '320px'
                    }}>
                      {group.messages.map(msg => (
                        <div
                          key={msg.id}
                          style={{
                            position: 'relative',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            overflow: 'hidden'
                          }}
                        >
                          <img
                            src={decryptedImages[msg.id]}
                            alt={msg.fileName || 'Image'}
                            style={{ 
                              maxWidth: '200px',
                              maxHeight: '200px',
                              width: 'auto',
                              height: 'auto',
                              objectFit: 'contain',
                              display: 'block',
                              borderRadius: '8px'
                            }}
                            onClick={() => setZoomedImage(decryptedImages[msg.id])}
                          />
                          {isMe && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(msg.id); }}
                              style={{
                                position: 'absolute',
                                top: '4px',
                                right: '4px',
                                padding: '4px',
                                backgroundColor: 'rgba(0,0,0,0.6)',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                color: 'white'
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            }
            
            // Single message
            const message = group.message;
            const isMe = message.senderId === user?.id;
            const decryptedText = decryptedMessages[message.id];
            const decryptedImage = decryptedImages[message.id];
            const decryptedVideo = decryptedVideos[message.id];
            const audioUrl = decryptedAudio[message.id];
            const fileNameLower = message.fileName?.toLowerCase() || '';
            const fileTypeLower = message.fileType?.toLowerCase() || '';
            const isImage = fileTypeLower.startsWith('image/');
            const isVideo = fileTypeLower.startsWith('video/') || fileNameLower.endsWith('.mp4') || fileNameLower.endsWith('.webm') || fileNameLower.endsWith('.mov') || fileNameLower.endsWith('.avi');
            const isAudio = fileTypeLower.startsWith('audio/') || (!isVideo && (fileNameLower.endsWith('.mp3') || fileNameLower.endsWith('.wav') || fileNameLower.endsWith('.ogg') || fileNameLower.endsWith('.m4a')));
            
            return (
            <div
              key={message.id}
              style={{ 
                display: 'flex', 
                gap: '12px', 
                flexDirection: isMe ? 'row-reverse' : 'row',
                alignItems: 'flex-start'
              }}
            >
              {/* Avatar */}
              <div style={{ flexShrink: 0 }}>
                <button
                  onClick={() => setProfileUser({
                    id: message.sender.id,
                    username: message.sender.username,
                    pfpUrl: message.sender.pfpUrl
                  })}
                  style={{ padding: 0, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  {message.sender.pfpUrl ? (
                    <img
                      src={getFullFileUrl(message.sender.pfpUrl)}
                      alt=""
                      style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ 
                      width: '36px', 
                      height: '36px', 
                      borderRadius: '50%', 
                      backgroundColor: secondaryBg,
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center' 
                    }}>
                      <User size={18} style={{ color: 'white' }} />
                    </div>
                  )}
                </button>
              </div>

              {/* Message Content */}
              <div style={{ maxWidth: '60%', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                {/* Username and Time */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  {isMe && (
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      {format(new Date(message.createdAt), 'HH:mm')}
                    </span>
                  )}
                  <button
                    onClick={() => setProfileUser({
                      id: message.sender.id,
                      username: message.sender.username,
                      pfpUrl: message.sender.pfpUrl
                    })}
                    style={{ 
                      padding: 0, 
                      background: 'none', 
                      border: 'none', 
                      cursor: 'pointer',
                      fontSize: '13px', 
                      fontWeight: 500, 
                      color: '#94a3b8'
                    }}
                  >
                    {message.sender.username}
                  </button>
                  {!isMe && (
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      {format(new Date(message.createdAt), 'HH:mm')}
                    </span>
                  )}
                  {message.selfDestruct && (
                    <span style={{ fontSize: '11px', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <Clock size={10} />
                      Auto-delete
                    </span>
                  )}
                </div>

                {/* Message Bubble */}
                <div 
                  style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}
                  onDoubleClick={() => isMe && !isOnlyGifUrl(decryptedText || '') && setActiveMessageId(activeMessageId === message.id ? null : message.id)}
                >
                  <div
                    style={{
                      padding: message.fileUrl ? '8px' : isOnlyGifUrl(decryptedText || '') ? '0px' : '10px 14px',
                      borderRadius: '12px',
                      backgroundColor: isOnlyGifUrl(decryptedText || '') ? 'transparent' : secondaryBg,
                      color: 'white',
                      wordBreak: 'break-word',
                      maxWidth: '100%',
                      cursor: isMe && !isOnlyGifUrl(decryptedText || '') ? 'pointer' : 'default'
                    }}
                    title={isMe && !isOnlyGifUrl(decryptedText || '') ? 'Double-click to show delete option' : ''}
                  >
                    {/* File/Image Content */}
                    {message.fileUrl ? (
                      isImage ? (
                        decryptedImage ? (
                          decryptedImage === 'error' ? (
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '10px', 
                              padding: '12px',
                              backgroundColor: 'rgba(220,38,38,0.2)',
                              borderRadius: '8px'
                            }}>
                              <Image size={32} style={{ color: '#ef4444' }} />
                              <div>
                                <p style={{ fontSize: '14px', color: '#ef4444' }}>Failed to decrypt image</p>
                              </div>
                            </div>
                          ) : (
                            <img 
                              src={decryptedImage} 
                              alt={message.fileName || 'Image'}
                              style={{ 
                                maxWidth: '400px', 
                                maxHeight: '400px', 
                                width: 'auto',
                                height: 'auto',
                                borderRadius: '8px',
                                cursor: 'zoom-in',
                                display: 'block',
                                objectFit: 'contain'
                              }}
                              onClick={() => setZoomedImage(decryptedImage)}
                            />
                          )
                        ) : (
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '10px', 
                            padding: '12px',
                            backgroundColor: 'rgba(0,0,0,0.2)',
                            borderRadius: '8px'
                          }}>
                            <Image size={32} style={{ color: '#94a3b8' }} />
                            <div>
                              <p style={{ fontSize: '14px', color: '#94a3b8' }}>Decrypting image...</p>
                            </div>
                          </div>
                        )
                      ) : isVideo ? (
                        decryptedVideo ? (
                          decryptedVideo === 'error' ? (
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '10px', 
                              padding: '12px',
                              backgroundColor: 'rgba(220,38,38,0.2)',
                              borderRadius: '8px'
                            }}>
                              <FileText size={32} style={{ color: '#ef4444' }} />
                              <div>
                                <p style={{ fontSize: '14px', color: '#ef4444' }}>Failed to decrypt video</p>
                              </div>
                            </div>
                          ) : (
                            <video 
                              src={decryptedVideo}
                              controls
                              playsInline
                              style={{ 
                                maxWidth: '400px', 
                                maxHeight: '300px', 
                                borderRadius: '8px',
                                display: 'block'
                              }}
                            />
                          )
                        ) : (
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '10px', 
                            padding: '12px',
                            backgroundColor: 'rgba(0,0,0,0.2)',
                            borderRadius: '8px'
                          }}>
                            <FileText size={32} style={{ color: '#94a3b8' }} />
                            <div>
                              <p style={{ fontSize: '14px', color: '#94a3b8' }}>Decrypting video...</p>
                            </div>
                          </div>
                        )
                      ) : isAudio ? (
                        audioUrl ? (
                          audioUrl === 'error' ? (
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '10px', 
                              padding: '12px',
                              backgroundColor: 'rgba(220,38,38,0.2)',
                              borderRadius: '8px'
                            }}>
                              <FileText size={32} style={{ color: '#ef4444' }} />
                              <div>
                                <p style={{ fontSize: '14px', color: '#ef4444' }}>Failed to decrypt audio</p>
                              </div>
                            </div>
                          ) : (
                            <AudioPlayer src={audioUrl} fileName={message.fileName} themeColor={user?.primaryColor} />
                          )
                        ) : (
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '10px', 
                            padding: '12px',
                            backgroundColor: 'rgba(0,0,0,0.2)',
                            borderRadius: '8px'
                          }}>
                            <FileText size={32} style={{ color: '#94a3b8' }} />
                            <div>
                              <p style={{ fontSize: '14px', color: '#94a3b8' }}>Decrypting audio...</p>
                            </div>
                          </div>
                        )
                      ) : (
                        <div 
                          onClick={() => handleDownload(message)}
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '10px', 
                            padding: '12px',
                            backgroundColor: 'rgba(0,0,0,0.2)',
                            borderRadius: '8px',
                            cursor: 'pointer'
                          }}
                        >
                          <FileText size={32} style={{ color: '#94a3b8' }} />
                          <div>
                            <p style={{ fontSize: '14px', fontWeight: 500, textDecoration: 'underline' }}>{message.fileName || 'File'}</p>
                            <p style={{ fontSize: '12px', color: '#94a3b8' }}>Click to download</p>
                          </div>
                        </div>
                      )
                    ) : isOnlyGifUrl(decryptedText || '') ? (
                      // Render GIF-only message like an image - no bubble background
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <img
                          src={decryptedText}
                          alt="GIF"
                          style={{
                            maxWidth: '300px',
                            maxHeight: '300px',
                            borderRadius: '8px',
                            cursor: 'zoom-in',
                            display: 'block'
                          }}
                          onClick={() => setZoomedImage(decryptedText || '')}
                        />
                        {isMe && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(message.id); }}
                            style={{
                              position: 'absolute',
                              top: '8px',
                              right: '8px',
                              padding: '6px',
                              backgroundColor: 'rgba(0,0,0,0.6)',
                              borderRadius: '6px',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'white'
                            }}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: '14px', lineHeight: '1.5', backgroundColor: 'transparent', padding: 0 }}>{decryptedText ? renderTextWithLinks(decryptedText, setZoomedImage, secondaryBg) : '[Decrypting...]'}</div>
                    )}
                  </div>

                  {/* Action Buttons - only show on double-click */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {isMe && activeMessageId === message.id && (
                      <button
                        onClick={() => {
                          handleDelete(message.id);
                          setActiveMessageId(null);
                        }}
                        style={{
                          padding: '6px',
                          backgroundColor: 'rgba(0,0,0,0.6)',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'white'
                        }}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

              </div>
            </div>
          );
        })}
        
        {/* System Messages at bottom */}
        {systemMessages.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            {systemMessages.slice(-3).map((sysMsg, index) => (
              <div
                key={`sys-bottom-${index}`}
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  margin: '4px 0'
                }}
              >
                <div
                  style={{
                    backgroundColor: sysMsg.type === 'self-destruct-changed' ? '#374151' : '#f59e0b20',
                    border: `1px solid ${sysMsg.type === 'self-destruct-changed' ? '#4b5563' : '#f59e0b40'}`,
                    borderRadius: '16px',
                    padding: '6px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {sysMsg.type === 'self-destruct-changed' ? (
                    <>
                      <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 500 }}>System:</span>
                      <span style={{ fontSize: '12px', color: '#d1d5db' }}>{sysMsg.message}</span>
                    </>
                  ) : (
                    <>
                      <Clock size={12} style={{ color: '#f59e0b' }} />
                      <span style={{ fontSize: '12px', color: '#fbbf24' }}>{sysMsg.message}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* File Upload List - Discord Style */}
      {filePreviews.length > 0 && (
        <div style={{ 
          padding: '12px 20px', 
          backgroundColor: secondaryBg, 
          borderTop: `1px solid ${primaryBg}`
        }}>
          {filePreviews.map(preview => (
            <div 
              key={preview.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                backgroundColor: primaryBg,
                borderRadius: '8px',
                marginBottom: '8px'
              }}
            >
              {/* File Icon */}
              <div style={{
                width: '40px',
                height: '40px',
                backgroundColor: secondaryBg,
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                {preview.previewUrl ? (
                  <img 
                    src={preview.previewUrl}
                    alt=""
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      borderRadius: '8px'
                    }}
                  />
                ) : (
                  <Film size={20} style={{ color: textColor }} />
                )}
              </div>

              {/* File Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ 
                  color: 'white', 
                  fontSize: '14px', 
                  margin: '0 0 4px 0',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {preview.name}
                </p>
                <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>
                  {uploadStatus[preview.name] || formatFileSize(preview.file.size)}
                </p>

                {/* Progress Bar */}
                {uploadProgress[preview.name] !== undefined && (
                  <div style={{
                    height: '4px',
                    backgroundColor: '#404040',
                    borderRadius: '2px',
                    overflow: 'hidden',
                    marginTop: '8px'
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${uploadProgress[preview.name]}%`,
                      backgroundColor: user?.primaryColor || '#3b82f6',
                      transition: 'width 0.2s ease'
                    }} />
                  </div>
                )}

                {/* Error Message */}
                {uploadErrors[preview.name] && (
                  <p style={{ color: '#ef4444', fontSize: '11px', margin: '4px 0 0 0' }}>
                    {uploadErrors[preview.name]}
                  </p>
                )}
              </div>

              {/* Remove Button */}
              <button
                onClick={() => removeFilePreview(preview.id)}
                style={{
                  padding: '8px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={20} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div style={{ 
        padding: '16px 20px', 
        borderTop: `1px solid ${secondaryBg}`,
        backgroundColor: primaryBg
      }}>
        {/* Self-destruct selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Clock size={14} style={{ color: '#64748b' }} />
          <span style={{ fontSize: '12px', color: '#64748b' }}>Self-destruct:</span>
          <select
            value={selfDestructMinutes}
            onChange={(e) => {
              const value = Number(e.target.value);
              const label = SELF_DESTRUCT_OPTIONS.find(o => o.value === value)?.label || 'Off';
              setSelfDestructMinutes(value);
              localStorage.setItem(getSelfDestructKey(), value.toString());
              // Emit to other user in the room
              if (socket && selectedRoom) {
                socket.emit('self-destruct-change', {
                  roomId: selectedRoom.id,
                  minutes: value,
                  label
                });
              }
            }}
            style={{ 
              backgroundColor: secondaryBg, 
              color: 'white', 
              fontSize: '12px', 
              borderRadius: '6px', 
              padding: '6px 10px', 
              border: `1px solid ${secondaryBg}`,
              outline: 'none'
            }}
          >
            {SELF_DESTRUCT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Message Input */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            multiple
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            style={{ 
              padding: '12px', 
              backgroundColor: secondaryBg, 
              borderRadius: '10px', 
              border: 'none',
              cursor: isUploading ? 'not-allowed' : 'pointer',
              color: isUploading ? '#64748b' : '#94a3b8'
            }}
          >
            <Paperclip size={20} />
          </button>
          <input
            ref={messageInputRef}
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message..."
            style={{ 
              flex: 1, 
              backgroundColor: secondaryBg, 
              color: 'white', 
              padding: '12px 16px', 
              borderRadius: '10px', 
              border: `1px solid ${secondaryBg}`,
              outline: 'none',
              fontSize: '14px'
            }}
          />
          <button
            onClick={handleSend}
            disabled={!inputMessage.trim() && filePreviews.length === 0}
            style={{ 
              padding: '12px 20px', 
              backgroundColor: primaryColor, 
              borderRadius: '10px', 
              border: 'none',
              cursor: (inputMessage.trim() || filePreviews.length > 0) ? 'pointer' : 'not-allowed',
              color: 'white',
              opacity: (inputMessage.trim() || filePreviews.length > 0) ? 1 : 0.5
            }}
          >
            <Send size={20} />
          </button>
        </div>
      </div>

      {/* Image Zoom Modal */}
      {zoomedImage && (
        <div 
          onClick={() => setZoomedImage(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            cursor: 'zoom-out',
            padding: '20px'
          }}
        >
          <img 
            src={zoomedImage} 
            alt="Zoomed"
            style={{
              maxWidth: '90%',
              maxHeight: '90%',
              objectFit: 'contain',
              borderRadius: '8px'
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* File Size Warning Modal */}
      {showSizeWarning && (
        <div 
          onClick={() => setShowSizeWarning(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#2d2d2d',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '400px',
              width: '100%',
              border: '1px solid #404040'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                backgroundColor: 'rgba(239,68,68,0.2)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <h3 style={{ color: 'white', margin: 0, fontSize: '18px', fontWeight: 600 }}>
                File Too Large
              </h3>
            </div>
            
            <p style={{ color: '#9ca3af', margin: '0 0 20px 0', fontSize: '14px', lineHeight: '1.5' }}>
              Some files exceed the 50 MB upload limit. Please remove them and try again.
            </p>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSizeWarning(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'transparent',
                  color: '#9ca3af',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowSizeWarning(false);
                  const oversized = filePreviews.filter(p => p.file.size > MAX_FILE_SIZE);
                  oversized.forEach(f => removeFilePreview(f.id));
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: user?.primaryColor || '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                Remove Large Files
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
        socket={socket}
        onMessage={() => {
          // Already in chat, just close
          setProfileUser(null);
        }}
        onUnfriend={async () => {
          if (profileUser && selectedRoom) {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/friends/${profileUser.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            
            if (data.roomDeleted) {
              socket?.emit('delete-room', { roomId: selectedRoom.id, targetUserId: profileUser.id });
              setSelectedRoom(null);
              setMessages([]);
            }
          }
          setProfileUser(null);
        }}
        onBlock={async () => {
          if (profileUser && selectedRoom) {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/friends/block', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ targetUserId: profileUser.id })
            });
            const data = await res.json();
            
            if (data.roomDeleted) {
              socket?.emit('delete-room', { roomId: selectedRoom.id, targetUserId: profileUser.id });
              setSelectedRoom(null);
              setMessages([]);
            }
          }
          setProfileUser(null);
        }}
        isFriend={true}
      />

      {/* Group Settings Modal */}
      {showGroupSettings && selectedRoom?.type === 'GROUP' && (
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 600 }}>Group Settings</h2>
              <button
                onClick={() => setShowGroupSettings(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={24} />
              </button>
            </div>

            {/* Group Image & Name - Owner Only */}
            {isGroupOwner && (
              <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: secondaryBg, borderRadius: '12px' }}>
                <h3 style={{ color: textColor, fontSize: '14px', marginBottom: '16px', opacity: 0.7 }}>Group Info</h3>
                
                {/* Group Image */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ position: 'relative' }}>
                    {selectedRoom.groupImage ? (
                      <img
                        src={getFullFileUrl(selectedRoom.groupImage)}
                        alt=""
                        style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{ 
                        width: '64px', 
                        height: '64px', 
                        borderRadius: '50%', 
                        backgroundColor: secondaryBg,
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        fontSize: '24px',
                        fontWeight: 'bold',
                        color: 'white'
                      }}>
                        {selectedRoom.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <button
                      onClick={() => groupImageInputRef.current?.click()}
                      style={{
                        position: 'absolute',
                        bottom: '0',
                        right: '0',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: secondaryBg,
                        border: `2px solid ${secondaryBg}`,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Edit2 size={12} style={{ color: 'white' }} />
                    </button>
                    <input
                      type="file"
                      ref={groupImageInputRef}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpdateGroupImage(file);
                      }}
                      accept="image/*"
                      style={{ display: 'none' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: textColor, fontSize: '12px', marginBottom: '4px', opacity: 0.6 }}>Group Name</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="text"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder={selectedRoom.name}
                        style={{
                          flex: 1,
                          backgroundColor: primaryBg,
                          border: `1px solid ${secondaryBg}`,
                          borderRadius: '6px',
                          padding: '8px 12px',
                          color: textColor,
                          fontSize: '14px'
                        }}
                      />
                      <button
                        onClick={handleUpdateGroupName}
                        disabled={!newGroupName.trim() || newGroupName.trim() === selectedRoom.name}
                        style={{
                          padding: '8px',
                          backgroundColor: newGroupName.trim() && newGroupName.trim() !== selectedRoom.name ? primaryColor : secondaryBg,
                          border: 'none',
                          borderRadius: '6px',
                          cursor: newGroupName.trim() && newGroupName.trim() !== selectedRoom.name ? 'pointer' : 'not-allowed',
                          color: 'white'
                        }}
                      >
                        <Check size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Members List */}
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '12px' }}>
                Members ({selectedRoom.members?.length || 0})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedRoom.members?.map((member) => (
                  <div
                    key={member.user.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px',
                      backgroundColor: secondaryBg,
                      borderRadius: '8px',
                    }}
                  >
                    {member.user.pfpUrl ? (
                      <img
                        src={member.user.pfpUrl.startsWith('http') ? member.user.pfpUrl : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${member.user.pfpUrl}`}
                        alt=""
                        style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: secondaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <User size={18} style={{ color: 'white' }} />
                      </div>
                    )}
                    <span style={{ color: 'white', fontSize: '14px', flex: 1 }}>
                      {member.user.username}
                      {member.user.id === selectedRoom.ownerId && (
                        <span style={{ color: '#f59e0b', fontSize: '12px', marginLeft: '8px' }}>(Owner)</span>
                      )}
                    </span>
                    {isGroupOwner && member.user.id !== user?.id && (
                      <button
                        onClick={() => handleKickMember(member.user.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          padding: '4px',
                        }}
                        title="Kick member"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Add Members (Owner only) */}
            {isGroupOwner && groupFriends.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '12px' }}>Add Members</h3>
                {/* Search bar for adding members */}
                <div style={{ marginBottom: '12px' }}>
                  <input
                    type="text"
                    placeholder="Search friends..."
                    value={addMemberSearch}
                    onChange={(e) => setAddMemberSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: secondaryBg,
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '14px',
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '150px', overflowY: 'auto' }}>
                  {groupFriends
                    .filter(friend => friend.username.toLowerCase().includes(addMemberSearch.toLowerCase()))
                    .map((friend) => (
                    <div
                      key={friend.id}
                      onClick={() => handleAddMember(friend.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px',
                        backgroundColor: secondaryBg,
                        borderRadius: '8px',
                        cursor: 'pointer',
                      }}
                    >
                      {friend.pfpUrl ? (
                        <img
                          src={friend.pfpUrl.startsWith('http') ? friend.pfpUrl : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${friend.pfpUrl}`}
                          alt=""
                          style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: secondaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <User size={18} style={{ color: 'white' }} />
                        </div>
                      )}
                      <span style={{ color: 'white', fontSize: '14px', flex: 1 }}>{friend.username}</span>
                      <span style={{ color: '#10b981', fontSize: '12px' }}>+ Add</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {isGroupOwner ? (
                <button
                  onClick={handleDeleteGroup}
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: 'transparent',
                    color: '#ef4444',
                    border: '1px solid #ef4444',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <Trash2 size={18} />
                  Delete Group
                </button>
              ) : (
                <button
                  onClick={handleLeaveGroup}
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: 'transparent',
                    color: '#f59e0b',
                    border: '1px solid #f59e0b',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <LogOut size={18} />
                  Leave Group
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      </div>{/* End Main Chat Area */}

      {/* User Profile Modal */}
      <UserProfileModal
        user={modalUser}
        isOpen={showUserModal}
        onClose={() => setShowUserModal(false)}
        socket={socket}
        onUnfriend={handleUnfriend}
        onBlock={handleBlock}
        onDeleteChat={handleDeleteChat}
        isFriend={true}
        showDeleteChat={true}
      />

      {/* Media Gallery Sidebar */}
      {showMediaPanel && (
        <div 
          style={{
            width: '340px',
            borderLeft: `1px solid ${secondaryBg}`,
            backgroundColor: primaryBg,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Header */}
          <div style={{
            height: '60px',
            borderBottom: `1px solid ${secondaryBg}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            backgroundColor: primaryBg,
            flexShrink: 0
          }}>
            <h2 style={{ color: textColor, fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ImageIcon size={18} />
              Media ({mediaItems.length})
            </h2>
            <button
              onClick={() => setShowMediaPanel(false)}
              style={{
                backgroundColor: 'transparent',
                color: textColor,
                border: 'none',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px'
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Media Grid - 2 columns, scrollable */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '12px',
            alignContent: 'start'
          }}>
            {mediaItems.length === 0 ? (
              <div style={{
                gridColumn: '1 / -1',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: textColor,
                height: '200px'
              }}>
                <ImageIcon size={40} style={{ marginBottom: '12px', opacity: 0.5 }} />
                <p style={{ fontSize: '14px' }}>No media</p>
              </div>
            ) : (
              mediaItems.map(item => {
                const isGif = item.fileName?.toLowerCase().includes('.gif') || item.url.toLowerCase().includes('.gif');
                return (
                <div
                  key={item.id}
                  style={{
                    backgroundColor: secondaryBg,
                    borderRadius: '8px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    aspectRatio: '1',
                    position: 'relative'
                  }}
                >
                  <div onClick={() => {
                    if (item.type === 'image' || item.type === 'gif') {
                      setZoomedImage(item.url);
                    } else {
                      setPlayingVideo(item.url);
                    }
                  }} style={{ width: '100%', height: '100%' }}>
                    {item.type === 'video' ? (
                      <div style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: primaryBg
                      }}>
                        <Film size={32} style={{ color: secondaryBg }} />
                      </div>
                    ) : (
                      <img
                        src={item.url}
                        alt={item.fileName || 'Image'}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block'
                        }}
                      />
                    )}
                  </div>
                  {/* GIF Badge */}
                  {isGif && (
                    <span style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      backgroundColor: 'rgba(0, 0, 0, 0.6)',
                      color: 'white',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'uppercase'
                    }}>
                      GIF
                    </span>
                  )}
                </div>
              );
              })
            )}
          </div>
        </div>
      )}

      {/* Video Player Modal */}
      {playingVideo && (
        <div 
          onClick={() => setPlayingVideo(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.95)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <video
            src={playingVideo}
            controls
            autoPlay
            style={{
              maxWidth: '100%',
              maxHeight: '90vh',
              borderRadius: '8px'
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setPlayingVideo(null)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              padding: '10px',
              backgroundColor: 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              color: 'white'
            }}
          >
            <X size={24} />
          </button>
        </div>
      )}
    </div>
  );
}

