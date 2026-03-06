'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import { fileAPI } from '@/lib/api';
import { Camera, Copy, Check, Key, Shield, Edit2, X, Save, LogOut, Lock, User, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { io } from 'socket.io-client';

const getFullFileUrl = (url: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${url}`;
};

export default function ProfilePanel() {
  const { user, setUser, updateUsername, updateTheme, notificationsMuted, toggleNotifications } = useAuthStore();
  const [isUploading, setIsUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameCooldown, setUsernameCooldown] = useState(0);
  const [showCooldownMessage, setShowCooldownMessage] = useState(false);
  const [showPublicKey, setShowPublicKey] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Reset password states
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Theme presets
  const themePresets = [
    { name: 'Midnight', primary: '#0f172a', secondary: '#1e293b' },
    { name: 'Ocean', primary: '#0c4a6e', secondary: '#075985' },
    { name: 'Forest', primary: '#064e3b', secondary: '#065f46' },
    { name: 'Sunset', primary: '#7c2d12', secondary: '#9a3412' },
    { name: 'Berry', primary: '#701a75', secondary: '#86198f' },
    { name: 'Slate', primary: '#1e293b', secondary: '#334155' },
    { name: 'Dark', primary: '#000000', secondary: '#1a1a1a' },
    { name: 'Crimson', primary: '#450a0a', secondary: '#7f1d1d' },
  ];
  const [selectedTheme, setSelectedTheme] = useState(user?.primaryColor || '#0f172a');
  const [isUpdatingTheme, setIsUpdatingTheme] = useState(false);
  const [themeError, setThemeError] = useState('');
  const [themeSuccess, setThemeSuccess] = useState('');

  // Image cropper states
  const [showImageEditor, setShowImageEditor] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isGif, setIsGif] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Listen for username updates from other sessions
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000', {
      auth: { token }
    });

    socket.on('user-updated', ({ userId, username }: { userId: string; username: string }) => {
      if (userId === user?.id && user) {
        // Update the current user's username in the store
        setUser({ ...user, username });
      }
    });

    // Listen for PFP updates from other sessions
    socket.on('user-pfp-updated', ({ userId, pfpUrl }: { userId: string; pfpUrl: string }) => {
      if (userId === user?.id && user) {
        // Update the current user's PFP in the store
        setUser({ ...user, pfpUrl });
      }
    });

    // Listen for theme updates from other sessions
    socket.on('theme-updated', ({ userId, primaryColor, secondaryColor }: { userId: string; primaryColor: string; secondaryColor: string }) => {
      if (userId === user?.id && user) {
        // Update the current user's theme in the store
        setUser({ ...user, primaryColor, secondaryColor });
        // Update local state
        setSelectedTheme(primaryColor);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.id, setUser]);

  // Load last username change time from localStorage
  useEffect(() => {
    const lastChange = localStorage.getItem('lastUsernameChange');
    if (lastChange) {
      const elapsed = Date.now() - parseInt(lastChange);
      const cooldown = 30 * 60 * 1000; // 30 minutes
      if (elapsed < cooldown) {
        setUsernameCooldown(Math.ceil((cooldown - elapsed) / 1000));
      }
    }
  }, []);

  // Countdown timer for username cooldown
  useEffect(() => {
    if (usernameCooldown <= 0) return;
    const timer = setInterval(() => {
      setUsernameCooldown(prev => {
        if (prev <= 1) {
          setShowCooldownMessage(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [usernameCooldown]);

  // Format cooldown time as MM:SS
  const formatCooldown = useMemo(() => {
    const mins = Math.floor(usernameCooldown / 60);
    const secs = usernameCooldown % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, [usernameCooldown]);

  const handlePFPChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Store the file for later upload
    setSelectedFile(file);
    
    // Check if it's a GIF
    const isGifFile = file.type === 'image/gif';
    setIsGif(isGifFile);

    // Read the file and show the image editor
    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedImage(event.target?.result as string);
      setShowImageEditor(true);
      setZoom(1);
      setPosition({ x: 0, y: 0 });
    };
    reader.readAsDataURL(file);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imageRef.current) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !imageRef.current) return;
    const maxOffset = 150 * zoom;
    setPosition({
      x: Math.max(-maxOffset, Math.min(maxOffset, e.clientX - dragStart.x)),
      y: Math.max(-maxOffset, Math.min(maxOffset, e.clientY - dragStart.y))
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleApplyImage = async () => {
    if (!imageRef.current || !selectedImage) return;

    setIsUploading(true);

    // For GIFs, upload the original file to preserve animation
    if (isGif && selectedFile) {
      try {
        const response = await fileAPI.uploadPFP(selectedFile);
        if (response.data.user) {
          setUser(response.data.user);
        }
        setShowImageEditor(false);
        setSelectedImage(null);
        setSelectedFile(null);
        setIsGif(false);
      } catch (error) {
        console.error('Failed to upload GIF:', error);
      }
      setIsUploading(false);
      return;
    }

    // For non-GIFs, process through canvas
    if (!canvasRef.current) {
      setIsUploading(false);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setIsUploading(false);
      return;
    }

    // Set canvas size to 512x512 for the final image
    canvas.width = 512;
    canvas.height = 512;

    const img = imageRef.current;
    
    // The preview is 300x300
    // The image is displayed at width = 300 * zoom, height = auto
    // The image is positioned with translate(-50% + position.x, -50% + position.y)
    // So the image center is at (150 + position.x, 150 + position.y)
    
    // Scale factor: source pixels per display pixel
    const displayWidth = 300 * zoom;
    const scale = img.naturalWidth / displayWidth;
    
    // The crop area is the full 300x300 preview, centered at (150, 150)
    // We need to find what part of the source image maps to this area
    
    // Image center in display coordinates
    const imageCenterX = 150 + position.x;
    const imageCenterY = 150 + position.y;
    
    // The preview center is at (150, 150)
    // The offset from image center to preview center
    const offsetX = 150 - imageCenterX;
    const offsetY = 150 - imageCenterY;
    
    // Convert offset to source pixels
    const sourceOffsetX = offsetX * scale;
    const sourceOffsetY = offsetY * scale;
    
    // The crop is 300x300 display pixels = 300*scale source pixels
    const sourceCropSize = 300 * scale;
    
    // Source coordinates: start from image center, apply offset, then go back half the crop size
    const sourceX = (img.naturalWidth / 2) + sourceOffsetX - (sourceCropSize / 2);
    const sourceY = (img.naturalHeight / 2) + sourceOffsetY - (sourceCropSize / 2);

    // Draw the cropped image
    ctx.save();
    ctx.beginPath();
    ctx.arc(256, 256, 256, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(
      img,
      Math.max(0, sourceX),
      Math.max(0, sourceY),
      Math.min(sourceCropSize, img.naturalWidth - Math.max(0, sourceX)),
      Math.min(sourceCropSize, img.naturalHeight - Math.max(0, sourceY)),
      0,
      0,
      512,
      512
    );

    ctx.restore();

    // Convert canvas to blob
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setIsUploading(false);
        return;
      }

      try {
        const file = new File([blob], 'pfp.png', { type: 'image/png' });
        const response = await fileAPI.uploadPFP(file);
        if (response.data.user) {
          setUser(response.data.user);
        }
        setShowImageEditor(false);
        setSelectedImage(null);
        setSelectedFile(null);
        setIsGif(false);
      } catch (error) {
        console.error('Failed to upload PFP:', error);
      }
      setIsUploading(false);
    }, 'image/png');
  };

  const handleReset = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  const copyPublicKey = () => {
    if (user?.publicKey && showPublicKey) {
      navigator.clipboard.writeText(user.publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const verifyPasswordAndShowKey = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password })
      });
      
      if (res.ok) {
        setShowPublicKey(true);
        setPasswordError('');
      } else {
        setPasswordError('Incorrect password');
      }
    } catch (error) {
      setPasswordError('Failed to verify password');
    }
  };

  const handleResetPassword = async () => {
    setResetPasswordError('');
    setResetPasswordSuccess('');
    
    if (newPassword.length < 6) {
      setResetPasswordError('Password must be at least 6 characters');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setResetPasswordError('Passwords do not match');
      return;
    }
    
    setIsResetting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ newPassword })
      });
      
      if (res.ok) {
        setResetPasswordSuccess('Password reset successfully! Logging out...');
        // Immediately clear all storage and redirect to login
        localStorage.removeItem('token');
        localStorage.removeItem('privateKey');
        localStorage.removeItem('currentUserId');
        localStorage.removeItem('horizon_notifications');
        window.location.href = '/';
      } else {
        const data = await res.json();
        setResetPasswordError(data.error || 'Failed to reset password');
      }
    } catch (error) {
      setResetPasswordError('Failed to reset password');
    } finally {
      setIsResetting(false);
    }
  };

  const handleUpdateTheme = async (primary: string, secondary: string) => {
    setThemeError('');
    setThemeSuccess('');
    setIsUpdatingTheme(true);
    try {
      await updateTheme(primary, secondary);
      setThemeSuccess('Theme updated successfully!');
      setTimeout(() => setThemeSuccess(''), 3000);
    } catch (error: any) {
      setThemeError(error.message || 'Failed to update theme');
    } finally {
      setIsUpdatingTheme(false);
    }
  };

  const primaryBg = user?.primaryColor || '#0f172a';
  const secondaryBg = user?.secondaryColor || '#1e293b';

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: primaryBg }}>
      {/* Header */}
      <div style={{ height: '56px', display: 'flex', alignItems: 'center', padding: '0 24px', borderBottom: `1px solid ${secondaryBg}` }}>
        <span style={{ fontWeight: 600, color: 'white', fontSize: '18px' }}>My Account</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          {/* Profile Card */}
          <div style={{ backgroundColor: secondaryBg, borderRadius: '12px', overflow: 'hidden', marginBottom: '24px' }}>
            {/* Banner */}
            <div style={{ height: '100px', backgroundColor: secondaryBg }} />
            
            {/* Avatar & Info */}
            <div style={{ padding: '0 24px 24px', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '-50px', marginBottom: '16px' }}>
                <div style={{ position: 'relative' }}>
                  {user?.pfpUrl ? (
                    <img src={getFullFileUrl(user.pfpUrl)} alt="" style={{ width: '100px', height: '100px', borderRadius: '50%', objectFit: 'cover', border: `6px solid ${secondaryBg}` }} />
                  ) : (
                    <div style={{ width: '100px', height: '100px', borderRadius: '50%', backgroundColor: secondaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `6px solid ${secondaryBg}` }}>
                      <User size={48} style={{ color: 'white' }} />
                    </div>
                  )}
                  <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} style={{ position: 'absolute', bottom: '4px', right: '4px', width: '32px', height: '32px', backgroundColor: primaryBg, borderRadius: '50%', border: `2px solid ${secondaryBg}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <Camera size={14} style={{ color: 'white' }} />
                  </button>
                  <input type="file" ref={fileInputRef} onChange={handlePFPChange} accept="image/*" style={{ display: 'none' }} />
                </div>
                
                <div style={{ marginTop: '16px', textAlign: 'center' }}>
                  {isEditingUsername ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                      <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} style={{ backgroundColor: primaryBg, border: `1px solid ${secondaryBg}`, borderRadius: '6px', padding: '8px 12px', color: 'white', fontSize: '16px', fontWeight: '600', width: '150px' }} />
                      <button onClick={async () => { 
                        try { 
                          setUsernameError(''); 
                          await updateUsername(newUsername); 
                          localStorage.setItem('lastUsernameChange', Date.now().toString());
                          setUsernameCooldown(30 * 60); // 30 minutes in seconds
                          setIsEditingUsername(false); 
                        } catch (error: any) { 
                          setUsernameError(error.message || 'Failed to update username'); 
                        } 
                      }} style={{ padding: '8px 12px', backgroundColor: '#10b981', borderRadius: '6px', border: 'none', cursor: 'pointer', color: 'white', fontSize: '12px' }}>Save</button>
                      <button onClick={() => { setIsEditingUsername(false); setNewUsername(''); setUsernameError(''); }} style={{ padding: '8px 12px', backgroundColor: secondaryBg, borderRadius: '6px', border: 'none', cursor: 'pointer', color: 'white', fontSize: '12px' }}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                      <h2 style={{ color: 'white', fontSize: '24px', fontWeight: '700' }}>{user?.username}</h2>
                      <button 
                        onClick={() => { 
                          if (usernameCooldown > 0) {
                            setShowCooldownMessage(true);
                          } else {
                            setNewUsername(user?.username || ''); 
                            setIsEditingUsername(true); 
                          }
                        }} 
                        style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                      >
                        <Edit2 size={16} />
                      </button>
                    </div>
                  )}
                  {usernameError && <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>{usernameError}</p>}
                  {showCooldownMessage && usernameCooldown > 0 && (
                    <p style={{ color: '#f59e0b', fontSize: '12px', marginTop: '4px' }}>
                      You can change your username every 30 mins. Wait {formatCooldown}
                    </p>
                  )}
                  {!showCooldownMessage && usernameCooldown === 0 && (
                    <p style={{ color: '#6b7280', fontSize: '11px', marginTop: '4px' }}>You can change your username every 30 mins</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Settings Sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Security Section */}
            <div style={{ backgroundColor: secondaryBg, borderRadius: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <Shield size={24} style={{ color: '#10b981' }} />
                <div>
                  <h3 style={{ color: 'white', fontWeight: 600 }}>End-to-End Encryption</h3>
                  <p style={{ color: '#9ca3af', fontSize: '13px' }}>Your messages are secure</p>
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#9ca3af', fontSize: '13px', marginBottom: '8px' }}>
                  <Key size={14} /> Your Public Key
                </label>
                {!showPublicKey ? (
                  <div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <input type="password" placeholder="Enter password to reveal" value={password} onChange={(e) => setPassword(e.target.value)} style={{ flex: 1, backgroundColor: primaryBg, border: `1px solid ${secondaryBg}`, borderRadius: '8px', padding: '10px 12px', color: 'white', fontSize: '13px' }} />
                      <button onClick={verifyPasswordAndShowKey} style={{ padding: '10px 16px', backgroundColor: secondaryBg, borderRadius: '8px', border: 'none', cursor: 'pointer', color: 'white', fontSize: '13px' }}>Reveal</button>
                    </div>
                    {passwordError && <p style={{ color: '#ef4444', fontSize: '12px' }}>{passwordError}</p>}
                    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', backgroundColor: primaryBg, borderRadius: '8px', border: '1px dashed #334155' }}>
                      <span style={{ color: '#64748b', fontSize: '13px', fontFamily: 'monospace' }}>********************************</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ backgroundColor: primaryBg, borderRadius: '8px', padding: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                      <input type="text" value={user?.publicKey || ''} readOnly style={{ flex: 1, backgroundColor: primaryBg, border: `1px solid ${secondaryBg}`, borderRadius: '8px', padding: '10px 12px', color: '#9ca3af', fontSize: '13px', fontFamily: 'monospace' }} />
                      <button onClick={copyPublicKey} style={{ padding: '10px', backgroundColor: copied ? '#10b981' : '#334155', borderRadius: '8px', border: 'none', cursor: 'pointer', color: 'white' }}>{copied ? <Check size={18} /> : <Copy size={18} />}</button>
                    </div>
                    <button onClick={() => { setShowPublicKey(false); setPassword(''); setPasswordError(''); }} style={{ backgroundColor: 'transparent', border: 'none', color: '#64748b', fontSize: '12px', cursor: 'pointer', padding: '4px 8px' }}>Hide public key</button>
                  </div>
                )}
              </div>
            </div>

            {/* Theme Settings */}
            <div style={{ backgroundColor: secondaryBg, borderRadius: '12px', padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <h3 style={{ color: 'white', fontWeight: 600, marginBottom: '4px' }}>Colour Themes</h3>
                <p style={{ color: '#9ca3af', fontSize: '13px' }}>Choose your favorite theme</p>
              </div>
                          
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
                {themePresets.map((theme) => (
                  <button
                    key={theme.primary}
                    onClick={() => {
                      setSelectedTheme(theme.primary);
                      handleUpdateTheme(theme.primary, theme.secondary);
                    }}
                    disabled={isUpdatingTheme}
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      borderRadius: '12px',
                      border: selectedTheme === theme.primary ? `3px solid ${secondaryBg}` : '2px solid transparent',
                      background: `linear-gradient(135deg, ${theme.primary} 50%, ${theme.secondary} 50%)`,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      position: 'relative',
                    }}
                    title={theme.name}
                  >
                    {selectedTheme === theme.primary && (
                      <div style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        width: '16px',
                        height: '16px',
                        backgroundColor: secondaryBg,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
                          
              {themeError && <p style={{ color: '#ef4444', fontSize: '13px' }}>{themeError}</p>}
              {themeSuccess && <p style={{ color: '#10b981', fontSize: '13px' }}>{themeSuccess}</p>}
            </div>

            {/* Notification Settings */}
            <div style={{ backgroundColor: secondaryBg, borderRadius: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ color: 'white', fontWeight: 600, marginBottom: '4px' }}>Notification Sounds</h3>
                  <p style={{ color: '#9ca3af', fontSize: '13px' }}>Play sound on new messages</p>
                </div>
                <button
                  onClick={toggleNotifications}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: notificationsMuted ? '#ef4444' : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500
                  }}
                >
                  {notificationsMuted ? 'Muted' : 'On'}
                </button>
              </div>
            </div>

            {/* Session Info */}
            <div style={{ backgroundColor: secondaryBg, borderRadius: '12px', padding: '20px' }}>
              <h3 style={{ color: 'white', fontWeight: 600, marginBottom: '16px' }}>Session</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#9ca3af', fontSize: '14px' }}>User ID</span>
                <span style={{ color: 'white', fontSize: '14px', fontFamily: 'monospace' }}>{user?.id?.slice(0, 8)}...</span>
              </div>
            </div>

            {/* Reset Password Section */}
            <div style={{ backgroundColor: secondaryBg, borderRadius: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <Lock size={24} style={{ color: '#ef4444' }} />
                <div>
                  <h3 style={{ color: 'white', fontWeight: 600 }}>Reset Password</h3>
                  <p style={{ color: '#9ca3af', fontSize: '13px' }}>Change your password and log out all devices</p>
                </div>
              </div>
              
              {!showResetPassword ? (
                <button onClick={() => setShowResetPassword(true)} style={{ width: '100%', padding: '12px', backgroundColor: secondaryBg, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 500 }}>Reset Password</button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={{ width: '100%', padding: '12px', backgroundColor: primaryBg, border: `1px solid ${secondaryBg}`, borderRadius: '8px', color: 'white', fontSize: '14px' }} />
                  <input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={{ width: '100%', padding: '12px', backgroundColor: primaryBg, border: `1px solid ${secondaryBg}`, borderRadius: '8px', color: 'white', fontSize: '14px' }} />
                  {resetPasswordError && <p style={{ color: '#ef4444', fontSize: '13px' }}>{resetPasswordError}</p>}
                  {resetPasswordSuccess && <p style={{ color: '#10b981', fontSize: '13px' }}>{resetPasswordSuccess}</p>}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleResetPassword} disabled={isResetting} style={{ flex: 1, padding: '12px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', cursor: isResetting ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 500, opacity: isResetting ? 0.7 : 1 }}>{isResetting ? 'Resetting...' : 'Confirm Reset'}</button>
                    <button onClick={() => { setShowResetPassword(false); setNewPassword(''); setConfirmPassword(''); setResetPasswordError(''); }} style={{ flex: 1, padding: '12px', backgroundColor: secondaryBg, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 500 }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>

            {/* Warning */}
            <div style={{ padding: '16px', backgroundColor: 'rgba(245, 158, 11, 0.1)', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
              <p style={{ color: '#f59e0b', fontSize: '13px', textAlign: 'center' }}>Never share your private key with anyone. Horizon staff will never ask for it.</p>
            </div>

            {/* Log Out */}
            <button onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('privateKey'); localStorage.removeItem('currentUserId'); window.location.reload(); }} style={{ width: '100%', padding: '12px', backgroundColor: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <LogOut size={18} /> Log Out
            </button>
          </div>
        </div>
      </div>

      {/* Image Editor Modal */}
      {showImageEditor && selectedImage && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div style={{
            backgroundColor: primaryBg,
            borderRadius: '16px',
            padding: '24px',
            width: '100%',
            maxWidth: '420px'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ color: 'white', fontSize: '18px', fontWeight: 600 }}>Edit Image</h3>
              <button 
                onClick={() => { setShowImageEditor(false); setSelectedImage(null); setSelectedFile(null); setIsGif(false); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}
              >
                <X size={24} />
              </button>
            </div>

            {/* Image Preview Area */}
            <div style={{
              width: '300px',
              height: '300px',
              margin: '0 auto 20px',
              borderRadius: '12px',
              overflow: 'hidden',
              position: 'relative',
              backgroundColor: '#374151',
              cursor: isDragging ? 'grabbing' : 'grab'
            }}
            onMouseDown={handleMouseDown}
            >
              {/* Circular Mask */}
              <div style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                zIndex: 10,
                pointerEvents: 'none'
              }} />
              
              {/* Image */}
              <img
                ref={imageRef}
                src={selectedImage}
                alt="Preview"
                style={{
                  position: 'absolute',
                  maxWidth: 'none',
                  maxHeight: 'none',
                  width: `${300 * zoom}px`,
                  height: 'auto',
                  left: '50%',
                  top: '50%',
                  transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
                  userSelect: 'none',
                  pointerEvents: 'none'
                }}
                draggable={false}
              />

            </div>

            {/* Hidden canvas for processing */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* GIF Notice */}
            {isGif && (
              <div style={{ 
                backgroundColor: secondaryBg, 
                padding: '12px 16px', 
                borderRadius: '8px', 
                marginBottom: '20px',
                textAlign: 'center'
              }}>
                <p style={{ color: '#9ca3af', fontSize: '13px', margin: 0 }}>
                  GIFs cannot be edited. The original file will be uploaded.
                </p>
              </div>
            )}

            {/* Controls - hidden for GIFs */}
            {!isGif && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '20px' }}>
              <button 
                onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
                style={{ 
                  padding: '8px', 
                  backgroundColor: secondaryBg, 
                  borderRadius: '8px', 
                  border: 'none',
                  cursor: 'pointer',
                  color: 'white'
                }}
              >
                <ZoomOut size={20} />
              </button>
              
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                style={{ width: '150px' }}
              />
              
              <button 
                onClick={() => setZoom(Math.min(3, zoom + 0.1))}
                style={{ 
                  padding: '8px', 
                  backgroundColor: secondaryBg, 
                  borderRadius: '8px', 
                  border: 'none',
                  cursor: 'pointer',
                  color: 'white'
                }}
              >
                <ZoomIn size={20} />
              </button>

              <button 
                onClick={handleReset}
                style={{ 
                  padding: '8px', 
                  backgroundColor: secondaryBg, 
                  borderRadius: '8px', 
                  border: 'none',
                  cursor: 'pointer',
                  color: 'white'
                }}
                title="Reset"
              >
                <RotateCcw size={20} />
              </button>
            </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => { setShowImageEditor(false); setSelectedImage(null); setSelectedFile(null); setIsGif(false); }}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: secondaryBg,
                  color: 'white',
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
                onClick={handleApplyImage}
                disabled={isUploading}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  opacity: isUploading ? 0.7 : 1
                }}
              >
                {isUploading ? 'Applying...' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
