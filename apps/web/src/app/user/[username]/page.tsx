'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import Sidebar from '@/components/Sidebar';
import { User, MessageCircle, Calendar, Users, UserPlus } from 'lucide-react';

interface UserProfile {
  id: string;
  username: string;
  pfpUrl?: string;
  createdAt: string;
}

interface Friend {
  id: string;
  username: string;
  pfpUrl?: string;
}

interface Group {
  id: string;
  name: string;
  groupImage?: string;
}

const getFullFileUrl = (url: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${url}`;
};

export default function UserProfilePage() {
  const router = useRouter();
  const params = useParams();
  const username = params.username as string;
  const { isAuthenticated, checkAuth, user: currentUser } = useAuthStore();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [mutualFriends, setMutualFriends] = useState<Friend[]>([]);
  const [mutualGroups, setMutualGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(true);
  
  const primaryBg = currentUser?.primaryColor || '#0f172a';
  const secondaryBg = currentUser?.secondaryColor || '#1e293b';

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

  useEffect(() => {
    if (username && isAuthenticated && !isChecking) {
      loadUser();
    }
  }, [username, isAuthenticated, isChecking]);

  const loadUser = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/auth/user/${encodeURIComponent(username)}`);
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setMutualFriends(data.mutualFriends || []);
        setMutualGroups(data.mutualGroups || []);
      } else if (res.status === 404) {
        setError('User not found');
      } else {
        setError('Failed to load user');
      }
    } catch (error) {
      setError('Failed to load user');
    } finally {
      setLoading(false);
    }
  };

  const handleStartChat = () => {
    if (!user) return;
    // Navigate to chat and let the chat page handle creating/finding the DM
    router.push(`/chat?user=${encodeURIComponent(user.username)}`);
  };

  const isOwnProfile = currentUser?.username === username;

  // Show loading while checking auth or loading user data
  if (isChecking || (!currentUser && isAuthenticated !== false) || loading) {
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
      
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* User Profile Panel */}
        <div style={{ width: '340px', backgroundColor: secondaryBg, borderRight: `1px solid ${secondaryBg}`, padding: '24px' }}>
          {error ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>😕</div>
              <h2 style={{ color: 'white', fontSize: '18px', marginBottom: '8px' }}>{error}</h2>
              <button
                onClick={() => router.push('/friends')}
                style={{
                  backgroundColor: secondaryBg,
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 20px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Back to Friends
              </button>
            </div>
          ) : user ? (
            <>
              {/* Avatar */}
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                {user.pfpUrl ? (
                  <img
                    src={getFullFileUrl(user.pfpUrl)}
                    alt={user.username}
                    style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 16px' }}
                  />
                ) : (
                  <div style={{ width: '120px', height: '120px', borderRadius: '50%', backgroundColor: secondaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <User size={48} style={{ color: 'white' }} />
                  </div>
                )}
                <h1 style={{ color: 'white', fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>
                  {user.username}
                </h1>
                <p style={{ color: '#64748b', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <Calendar size={14} />
                  Joined {new Date(user.createdAt).toLocaleDateString()}
                </p>
              </div>

              {/* Actions */}
              {!isOwnProfile && (
                <button
                  onClick={handleStartChat}
                  style={{
                    width: '100%',
                    backgroundColor: secondaryBg,
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginBottom: '16px',
                  }}
                >
                  <MessageCircle size={18} />
                  Send Message
                </button>
              )}

              {isOwnProfile && (
                <button
                  onClick={() => router.push('/profile')}
                  style={{
                    width: '100%',
                    backgroundColor: '#334155',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600,
                    marginBottom: '16px',
                  }}
                >
                  Edit Profile
                </button>
              )}

              {/* Mutual Friends Section */}
              {mutualFriends.length > 0 && (
                <div style={{ backgroundColor: primaryBg, borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                  <h3 style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <UserPlus size={14} />
                    Mutual Friends ({mutualFriends.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {mutualFriends.slice(0, 5).map((friend) => (
                      <div key={friend.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {friend.pfpUrl ? (
                          <img src={getFullFileUrl(friend.pfpUrl)} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: secondaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <User size={16} style={{ color: 'white' }} />
                          </div>
                        )}
                        <span style={{ color: 'white', fontSize: '14px' }}>{friend.username}</span>
                      </div>
                    ))}
                    {mutualFriends.length > 5 && (
                      <p style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>+{mutualFriends.length - 5} more</p>
                    )}
                  </div>
                </div>
              )}

              {/* Mutual Groups Section */}
              {mutualGroups.length > 0 && (
                <div style={{ backgroundColor: primaryBg, borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                  <h3 style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Users size={14} />
                    Mutual Groups ({mutualGroups.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {mutualGroups.map((group) => (
                      <div key={group.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {group.groupImage ? (
                          <img 
                            src={getFullFileUrl(group.groupImage)} 
                            alt="" 
                            style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} 
                          />
                        ) : (
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: secondaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Users size={16} style={{ color: 'white' }} />
                          </div>
                        )}
                        <span style={{ color: 'white', fontSize: '14px' }}>{group.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Info Section */}
              <div style={{ backgroundColor: primaryBg, borderRadius: '12px', padding: '16px' }}>
                <h3 style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                  User Information
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '2px' }}>Username</p>
                    <p style={{ color: 'white', fontSize: '14px' }}>{user.username}</p>
                  </div>
                  <div>
                    <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '2px' }}>User ID</p>
                    <p style={{ color: 'white', fontSize: '14px', fontFamily: 'monospace' }}>{user.id.slice(0, 8)}...</p>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Empty State */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: primaryBg }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '80px', height: '80px', backgroundColor: `${secondaryBg}33`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <span style={{ fontSize: '32px' }}>👤</span>
            </div>
            <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
              User Profile
            </h2>
            <p style={{ color: '#9ca3af' }}>
              View user information and start a conversation
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
