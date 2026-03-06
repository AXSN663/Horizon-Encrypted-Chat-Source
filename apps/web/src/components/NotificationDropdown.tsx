'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, X, Check, UserPlus, MessageCircle, Users } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

interface Notification {
  id: string;
  type: 'message' | 'friend_request' | 'group_invite';
  title: string;
  content?: string;
  senderId?: string;
  roomId?: string;
  requestId?: string;
  isRead: boolean;
  createdAt: string;
}

interface NotificationDropdownProps {
  onFriendRequestHandled?: () => void;
}

export default function NotificationDropdown({ onFriendRequestHandled }: NotificationDropdownProps) {
  const { user } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const secondaryBg = user?.secondaryColor || '#1e293b';

  // Load notifications
  const loadNotifications = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  };

  // Mark notification as read
  const markAsRead = async (id: string) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/notifications/read-all', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  // Handle friend request accept/decline
  const handleFriendRequest = async (requestId: string, action: 'accept' | 'decline') => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      await fetch(`/api/friends/request/${requestId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Remove the notification
      setNotifications(prev => prev.filter(n => n.requestId !== requestId));
      setUnreadCount(prev => Math.max(0, prev - 1));
      
      if (onFriendRequestHandled) {
        onFriendRequestHandled();
      }
    } catch (error) {
      console.error('Failed to handle friend request:', error);
    } finally {
      setLoading(false);
    }
  };

  // Delete notification
  const deleteNotification = async (id: string) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/notifications/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const wasUnread = notifications.find(n => n.id === id)?.isRead === false;
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (wasUnread) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  // Load notifications on mount
  useEffect(() => {
    loadNotifications();
  }, []);

  // Listen for socket events
  useEffect(() => {
    const { io } = require('socket.io-client');
    const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000', {
      auth: { token: localStorage.getItem('token') }
    });

    socket.on('new-notification', (notification: Notification) => {
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
      // Play notification sound or show browser notification could be added here
    });

    socket.on('notification-updated', () => {
      loadNotifications();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Refresh notifications when dropdown opens
  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case 'message':
        return <MessageCircle size={18} style={{ color: secondaryBg }} />;
      case 'friend_request':
        return <UserPlus size={18} style={{ color: '#10b981' }} />;
      case 'group_invite':
        return <Users size={18} style={{ color: '#8b5cf6' }} />;
      default:
        return <Bell size={18} style={{ color: '#94a3b8' }} />;
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Bell Button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) loadNotifications();
        }}
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isOpen ? secondaryBg : 'transparent',
          color: isOpen ? 'white' : '#94a3b8',
          border: 'none',
          cursor: 'pointer',
          transition: 'all 0.2s',
          position: 'relative',
        }}
        title="Notifications"
      >
        <Bell size={24} />
        
        {/* Unread Badge */}
        {unreadCount > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              minWidth: '20px',
              height: '20px',
              backgroundColor: '#ef4444',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 'bold',
              color: 'white',
              padding: '0 6px',
              border: '2px solid #0f172a',
              animation: 'pulse 2s infinite',
            }}
          >
            {unreadCount > 99 ? '!' : unreadCount}
          </div>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '56px',
            left: '0',
            width: '360px',
            maxHeight: '480px',
            backgroundColor: secondaryBg,
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
            border: '1px solid #334155',
            overflow: 'hidden',
            zIndex: 1000,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px',
              borderBottom: '1px solid #334155',
            }}
          >
            <h3 style={{ color: 'white', fontSize: '16px', fontWeight: 600, margin: 0 }}>
              Notifications
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: secondaryBg,
                  fontSize: '13px',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: '4px',
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div
                style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: '#64748b',
                }}
              >
                <Bell size={40} style={{ marginBottom: '12px', opacity: 0.5 }} />
                <p style={{ margin: 0 }}>No notifications</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => !notification.isRead && markAsRead(notification.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '16px',
                    borderBottom: '1px solid #334155',
                    backgroundColor: notification.isRead ? 'transparent' : 'rgba(59, 130, 246, 0.1)',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                  }}
                >
                  {/* Icon */}
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      backgroundColor: secondaryBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {getIcon(notification.type)}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '4px',
                      }}
                    >
                      <p
                        style={{
                          color: 'white',
                          fontSize: '14px',
                          fontWeight: notification.isRead ? 400 : 600,
                          margin: 0,
                          flex: 1,
                        }}
                      >
                        {notification.title}
                      </p>
                      <span style={{ color: '#64748b', fontSize: '12px', flexShrink: 0 }}>
                        {formatTime(notification.createdAt)}
                      </span>
                    </div>
                    {notification.content && (
                      <p
                        style={{
                          color: '#94a3b8',
                          fontSize: '13px',
                          margin: '0 0 8px 0',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {notification.content}
                      </p>
                    )}

                    {/* Action Buttons for Friend Requests */}
                    {notification.type === 'friend_request' && notification.requestId && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFriendRequest(notification.requestId!, 'accept');
                          }}
                          disabled={loading}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '13px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Check size={14} />
                          Accept
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFriendRequest(notification.requestId!, 'decline');
                          }}
                          disabled={loading}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '13px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                          }}
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNotification(notification.id);
                    }}
                    style={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: '#64748b',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '4px',
                      opacity: 0,
                      transition: 'opacity 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* CSS for pulse animation */}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.1);
          }
        }
      `}</style>
    </div>
  );
}
