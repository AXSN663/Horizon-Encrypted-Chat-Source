'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { MessageCircle, UserX, Ban, X, Trash2, User } from 'lucide-react';
import { Socket } from 'socket.io-client';

interface UserProfileModalProps {
  user: {
    id: string;
    username: string;
    pfpUrl?: string;
    createdAt?: string;
  } | null;
  isOpen: boolean;
  onClose: () => void;
  onMessage?: () => void;
  onUnfriend?: () => void;
  onBlock?: () => void;
  onDeleteChat?: () => void;
  isFriend?: boolean;
  showDeleteChat?: boolean;
  socket?: Socket | null;
}

const getFullFileUrl = (url: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${url}`;
};

export default function UserProfileModal({ 
  user, 
  isOpen, 
  onClose, 
  onMessage,
  onUnfriend,
  onBlock,
  onDeleteChat,
  isFriend = false,
  showDeleteChat = false,
  socket
}: UserProfileModalProps) {
  const { user: currentUser } = useAuthStore();
  const [showConfirm, setShowConfirm] = useState<'unfriend' | 'block' | 'delete' | null>(null);
  const [livePfpUrl, setLivePfpUrl] = useState<string | undefined>(user?.pfpUrl);
  
  const primaryBg = currentUser?.primaryColor || '#0f172a';
  const secondaryBg = currentUser?.secondaryColor || '#1e293b';

  // Update livePfpUrl when user prop changes
  useEffect(() => {
    setLivePfpUrl(user?.pfpUrl);
  }, [user?.pfpUrl, user?.id]);

  // Listen for real-time PFP updates
  useEffect(() => {
    if (!socket || !user) return;

    const handlePfpUpdate = ({ userId, pfpUrl }: { userId: string; pfpUrl: string }) => {
      if (userId === user.id) {
        setLivePfpUrl(pfpUrl);
      }
    };

    socket.on('user-pfp-updated', handlePfpUpdate);
    return () => {
      socket.off('user-pfp-updated', handlePfpUpdate);
    };
  }, [socket, user?.id]);

  if (!isOpen || !user) return null;

  const isSelf = user.id === currentUser?.id;

  const handleUnfriend = () => {
    if (onUnfriend) {
      onUnfriend();
      setShowConfirm(null);
      onClose();
    }
  };

  const handleBlock = () => {
    if (onBlock) {
      onBlock();
      setShowConfirm(null);
      onClose();
    }
  };

  const handleDeleteChat = () => {
    if (onDeleteChat) {
      onDeleteChat();
      setShowConfirm(null);
      onClose();
    }
  };

  return (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.8)',
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
          backgroundColor: primaryBg,
          borderRadius: '16px',
          width: '100%',
          maxWidth: '400px',
          overflow: 'hidden'
        }}
      >
        {/* Header with close button */}
        <div style={{ position: 'relative', padding: '24px 24px 0' }}>
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              padding: '8px',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#94a3b8',
              borderRadius: '8px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Avatar and Name */}
        <div style={{ padding: '0 24px 24px', textAlign: 'center' }}>
          <div style={{ position: 'relative', display: 'inline-block', marginBottom: '16px' }}>
            {livePfpUrl ? (
              <img
                src={getFullFileUrl(livePfpUrl)}
                alt=""
                style={{ 
                  width: '100px', 
                  height: '100px', 
                  borderRadius: '50%', 
                  objectFit: 'cover',
                  border: `4px solid ${secondaryBg}`
                }}
              />
            ) : (
              <div style={{ 
                width: '100px', 
                height: '100px', 
                borderRadius: '50%', 
                backgroundColor: secondaryBg,
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                border: `4px solid ${secondaryBg}`
              }}>
                <User size={48} style={{ color: 'white' }} />
              </div>
            )}
          </div>

          <h2 style={{ color: 'white', fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
            {user.username}
          </h2>

          {/* Username with badges */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ color: '#94a3b8', fontSize: '14px' }}>
              {user.username}
            </span>
            {/* User Badge */}
            <div 
              title="User"
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                backgroundColor: secondaryBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
          </div>

          {/* Action Buttons */}
          {!isSelf && (
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              {isFriend && (
                <button
                  onClick={() => setShowConfirm('unfriend')}
                  style={{
                    padding: '10px',
                    backgroundColor: secondaryBg,
                    color: 'white',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                  title="Unfriend"
                >
                  <UserX size={18} />
                </button>
              )}

              {showDeleteChat && (
                <button
                  onClick={() => setShowConfirm('delete')}
                  style={{
                    padding: '10px',
                    backgroundColor: secondaryBg,
                    color: 'white',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                  title="Delete Chat"
                >
                  <Trash2 size={18} />
                </button>
              )}

              <button
                onClick={() => setShowConfirm('block')}
                style={{
                  padding: '10px',
                  backgroundColor: secondaryBg,
                  color: 'white',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer'
                }}
                title="Block"
              >
                <Ban size={18} />
              </button>
            </div>
          )}
        </div>

        {/* Member Since */}
        <div style={{ 
          padding: '16px 24px', 
          borderTop: `1px solid ${secondaryBg}`,
          backgroundColor: primaryBg
        }}>
          <p style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            Member Since
          </p>
          <p style={{ color: 'white', fontSize: '14px' }}>
            {user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { 
              day: 'numeric', 
              month: 'short', 
              year: 'numeric' 
            }) : 'Unknown'}
          </p>
        </div>

        {/* Confirmation Dialog */}
        {showConfirm && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            borderRadius: '16px'
          }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: 'white', fontSize: '16px', marginBottom: '16px' }}>
                {showConfirm === 'unfriend' 
                  ? `Unfriend ${user.username}?`
                  : showConfirm === 'delete'
                  ? `Delete chat with ${user.username}? This will only delete it for you.`
                  : `Block ${user.username}?`
                }
              </p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button
                  onClick={showConfirm === 'unfriend' ? handleUnfriend : showConfirm === 'delete' ? handleDeleteChat : handleBlock}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#dc2626',
                    color: 'white',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  {showConfirm === 'unfriend' ? 'Unfriend' : showConfirm === 'delete' ? 'Delete' : 'Block'}
                </button>
                <button
                  onClick={() => setShowConfirm(null)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: secondaryBg,
                    color: 'white',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
