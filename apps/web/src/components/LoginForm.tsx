'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { CryptoService } from '@chat/shared';

// Cloudflare Turnstile site key - hardcoded for now
const TURNSTILE_SITE_KEY = '0x4AAAAAACkIQuYEIsWfRd4e';

// Extend window type for Turnstile
declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement | string, options: {
        sitekey: string;
        callback?: (token: string) => void;
        theme?: 'light' | 'dark' | 'auto';
      }) => string;
      reset: (widgetIdOrContainer: HTMLElement | string) => void;
    };
  }
}

export default function LoginForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const turnstileRef = useRef<HTMLDivElement>(null);
  const { login, register, isLoading } = useAuthStore();

  // Load Turnstile script and render widget
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !turnstileRef.current) return;
    
    // Check if script already exists
    if (!document.querySelector('script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]')) {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        // Render widget after script loads
        if (window.turnstile && turnstileRef.current) {
          window.turnstile.render(turnstileRef.current, {
            sitekey: TURNSTILE_SITE_KEY,
            callback: (token: string) => {
              setCaptchaToken(token);
            },
            theme: 'dark',
          });
        }
      };
      document.body.appendChild(script);
    } else if (window.turnstile && turnstileRef.current) {
      // Script already loaded, just render
      window.turnstile.render(turnstileRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token: string) => {
          setCaptchaToken(token);
        },
        theme: 'dark',
      });
    }

    return () => {
      // Reset widget on unmount
      if (window.turnstile && turnstileRef.current) {
        window.turnstile.reset(turnstileRef.current);
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      if (isLogin) {
        await login(username, password, captchaToken);
      } else {
        setIsGenerating(true);
        const keyPair = await CryptoService.generateKeyPair();
        localStorage.setItem('privateKey', keyPair.privateKey);
        setIsGenerating(false);
        await register(username, password, keyPair.publicKey, captchaToken);
      }
      // Reset CAPTCHA after successful submission
      setCaptchaToken('');
      if (window.turnstile && turnstileRef.current) {
        window.turnstile.reset(turnstileRef.current);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'An error occurred');
      setIsGenerating(false);
      // Reset CAPTCHA on error
      if (window.turnstile && turnstileRef.current) {
        window.turnstile.reset(turnstileRef.current);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Username
        </label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-colors"
          placeholder="Enter your username"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-colors"
          placeholder="Enter your password"
          required
        />
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {isGenerating && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-400 text-sm">
          Generating encryption keys... This may take a moment.
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading || isGenerating}
        className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors shadow-lg shadow-blue-600/20"
      >
        {isLoading ? 'Loading...' : isLogin ? 'Sign In' : 'Create Account'}
      </button>

      <div className="text-center pt-2">
        <button
          type="button"
          onClick={() => setIsLogin(!isLogin)}
          className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
        >
          {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>

      {/* Cloudflare Turnstile CAPTCHA */}
      {TURNSTILE_SITE_KEY && (
        <div className="flex justify-center">
          <div ref={turnstileRef} />
        </div>
      )}

      {!isLogin && (
        <div className="text-xs text-gray-500 text-center pt-2">
          Your private encryption key will be generated and stored locally.
          <br />Never share it with anyone.
        </div>
      )}
    </form>
  );
}
