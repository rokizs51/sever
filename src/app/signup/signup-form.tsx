'use client';

import { useState } from 'react';
import Link from 'next/link';
import { buttonCls } from '@/components/ui/button';

const inputCls =
  'w-full border border-line-2 bg-surface px-4 py-2.5 text-sm text-ink transition-colors placeholder:text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

export default function SignupForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    setLoading(true);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || 'Signup failed');
        return;
      }

      // Success - redirect to login or dashboard
      window.location.href = '/dashboard';
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className={inputCls}
        />
      </div>

      {error && (
        <div role="alert" className="bg-wash-red px-4 py-2.5 text-sm text-tone-red">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className={buttonCls('primary', 'lg', 'w-full')}
      >
        {loading ? 'Signing up...' : 'Sign up'}
      </button>

      <p className="text-xs text-mute">
        By creating an account you agree to our{' '}
        <Link href="/terms" className="underline underline-offset-2 hover:text-ink">Terms</Link>
        {' '}and{' '}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">Privacy policy</Link>.
      </p>
    </form>
  );
}
