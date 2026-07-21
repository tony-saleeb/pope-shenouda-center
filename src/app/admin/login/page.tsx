'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth/context';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const { signIn, loading: authLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
      router.push('/admin');
    } catch {
      setError('بيانات الدخول غير صحيحة');
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <main style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner spinner-lg spinner-gold" />
      </main>
    );
  }

  return (
    <main className="page-enter" style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div style={{ width: '100%', maxWidth: '24rem' }}>
        <div className="glass-card" style={{ padding: '2.5rem 2rem' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              width: '3.5rem', height: '3.5rem', margin: '0 auto 1rem',
              borderRadius: '0.875rem',
              background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-800))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" x2="3" y1="12" y2="12" />
              </svg>
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>لوحة التحكم</h1>
            <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.25rem' }}>
              تسجيل دخول المشرفين
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label className="form-label" htmlFor="email">البريد الإلكتروني</label>
              <input
                id="email"
                type="email"
                className="form-input"
                placeholder="admin@church.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
                style={{ textAlign: 'left' }}
                required
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label className="form-label" htmlFor="password">كلمة المرور</label>
              <input
                id="password"
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
                style={{ textAlign: 'left' }}
                required
              />
            </div>

            {error && (
              <div style={{
                padding: '0.75rem', background: 'rgba(239,68,68,0.1)',
                borderRadius: '0.75rem', marginBottom: '1rem', textAlign: 'center',
              }}>
                <p className="form-error" style={{ margin: 0 }}>{error}</p>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={loading || !email || !password}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  <span>جاري الدخول...</span>
                </>
              ) : (
                <span>تسجيل الدخول</span>
              )}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
