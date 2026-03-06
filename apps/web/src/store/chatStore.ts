import { create } from 'zustand';

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
  messages: Array<any>;
}

interface Message {
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
  };
}

interface UnreadMessage {
  roomId: string;
  senderId: string;
  senderName: string;
  count: number;
}

interface ChatState {
  rooms: Room[];
  selectedRoom: Room | null;
  messages: Message[];
  typingUsers: Record<string, { username: string; isTyping: boolean }>;
  showFriends: boolean;
  selectedServer: any | null;
  unreadMessages: number;
  pendingFriendRequests: number;
  unreadByRoom: Record<string, UnreadMessage>; // Track unread per room with sender info
  setRooms: (rooms: Room[] | ((prev: Room[]) => Room[])) => void;
  setSelectedRoom: (room: Room | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  deleteMessage: (messageId: string) => void;
  setTypingUser: (roomId: string, userId: string, username: string, isTyping: boolean) => void;
  setShowFriends: (show: boolean) => void;
  setSelectedServer: (server: any | null) => void;
  setUnreadMessages: (count: number | ((prev: number) => number)) => void;
  setPendingFriendRequests: (count: number | ((prev: number) => number)) => void;
  clearUnreadMessages: () => void;
  clearPendingFriendRequests: () => void;
  addUnreadMessage: (roomId: string, senderId: string, senderName: string) => void;
  clearUnreadForRoom: (roomId: string) => void;
  getUnreadForRoom: (roomId: string) => UnreadMessage | undefined;
}

// Load persisted notification state from localStorage
const loadPersistedNotifications = () => {
  if (typeof window === 'undefined') return { unreadMessages: 0, unreadByRoom: {}, pendingFriendRequests: 0 };
  try {
    const saved = localStorage.getItem('horizon_notifications');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load notifications:', e);
  }
  return { unreadMessages: 0, unreadByRoom: {}, pendingFriendRequests: 0 };
};

// Save notification state to localStorage
const saveNotifications = (unreadMessages: number, unreadByRoom: Record<string, UnreadMessage>, pendingFriendRequests?: number) => {
  if (typeof window === 'undefined') return;
  try {
    const current = loadPersistedNotifications();
    localStorage.setItem('horizon_notifications', JSON.stringify({ 
      unreadMessages, 
      unreadByRoom,
      pendingFriendRequests: pendingFriendRequests !== undefined ? pendingFriendRequests : current.pendingFriendRequests
    }));
  } catch (e) {
    console.error('Failed to save notifications:', e);
  }
};

const persistedNotifications = loadPersistedNotifications();

export const useChatStore = create<ChatState>((set, get) => ({
  rooms: [],
  selectedRoom: null,
  messages: [],
  typingUsers: {},
  showFriends: true,
  selectedServer: null,
  unreadMessages: persistedNotifications.unreadMessages || 0,
  pendingFriendRequests: persistedNotifications.pendingFriendRequests || 0,
  unreadByRoom: persistedNotifications.unreadByRoom || {},

  setRooms: (rooms) => {
    if (typeof rooms === 'function') {
      const currentRooms = get().rooms;
      set({ rooms: (rooms as (prev: Room[]) => Room[])(currentRooms) });
    } else {
      set({ rooms });
    }
  },
  setSelectedRoom: (room) => set({ selectedRoom: room, messages: [] }),
  setMessages: (messages) => set({ messages }),
  
  addMessage: (message) => {
    const { messages } = get();
    // Prevent duplicate messages
    if (messages.some(m => m.id === message.id)) return;
    set({ messages: [...messages, message] });
  },
  
  deleteMessage: (messageId) => {
    const { messages } = get();
    set({ 
      messages: messages.filter(m => m.id !== messageId)
    });
  },
  
  setTypingUser: (roomId, userId, username, isTyping) => {
    const { typingUsers } = get();
    set({
      typingUsers: {
        ...typingUsers,
        [`${roomId}-${userId}`]: { username, isTyping }
      }
    });
  },
  
  setShowFriends: (show) => set({ showFriends: show }),
  setSelectedServer: (server) => set({ selectedServer: server }),
  
  setUnreadMessages: (count) => {
    const newCount = typeof count === 'function' ? count(get().unreadMessages) : count;
    set({ unreadMessages: newCount });
    saveNotifications(newCount, get().unreadByRoom, get().pendingFriendRequests);
  },
  setPendingFriendRequests: (count) => {
    const newCount = typeof count === 'function' ? count(get().pendingFriendRequests) : count;
    set({ pendingFriendRequests: newCount });
    saveNotifications(get().unreadMessages, get().unreadByRoom, newCount);
  },
  clearUnreadMessages: () => {
    set({ unreadMessages: 0 });
    saveNotifications(0, get().unreadByRoom, get().pendingFriendRequests);
  },
  clearPendingFriendRequests: () => {
    set({ pendingFriendRequests: 0 });
    saveNotifications(get().unreadMessages, get().unreadByRoom, 0);
  },
  
  addUnreadMessage: (roomId: string, senderId: string, senderName: string) => {
    const { unreadByRoom } = get();
    const existing = unreadByRoom[roomId];
    const newUnreadByRoom = {
      ...unreadByRoom,
      [roomId]: {
        roomId,
        senderId,
        senderName,
        count: existing ? existing.count + 1 : 1
      }
    };
    set({ unreadByRoom: newUnreadByRoom });
    saveNotifications(get().unreadMessages, newUnreadByRoom, get().pendingFriendRequests);
  },
  
  clearUnreadForRoom: (roomId: string) => {
    const { unreadByRoom } = get();
    const newUnreadByRoom = { ...unreadByRoom };
    delete newUnreadByRoom[roomId];
    set({ unreadByRoom: newUnreadByRoom });
    saveNotifications(get().unreadMessages, newUnreadByRoom, get().pendingFriendRequests);
  },
  
  getUnreadForRoom: (roomId: string) => {
    return get().unreadByRoom[roomId];
  },
}));

