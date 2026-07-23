'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth/context';
import type { AdminUserRecord } from '@/app/api/admin/admins/route';

export default function AdminsPage() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<AdminUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchAdmins = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken(true);
      const res = await fetch('/api/admin/admins', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAdmins(data.admins || []);
      }
    } catch (err) {
      console.error('Error fetching admins:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !email.trim()) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const token = await user.getIdToken(true);
      const res = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: email.trim(),
          password: password.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(data.message || 'تمت إضافة الأدمن بنجاح');
        setEmail('');
        setPassword('');
        setShowAddModal(false);
        fetchAdmins();
      } else {
        setError(data.error || 'حدث خطأ في إضافة الأدمن');
      }
    } catch {
      setError('حدث خطأ في الاتصال بالسيرفر');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAdmin = async (targetEmail: string) => {
    if (!user) return;
    setDeletingEmail(targetEmail);
    try {
      const token = await user.getIdToken(true);
      const res = await fetch('/api/admin/admins', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: targetEmail }),
      });

      if (res.ok) {
        setConfirmDelete(null);
        fetchAdmins();
      } else {
        const data = await res.json();
        alert(data.error || 'حدث خطأ في إلغاء صلاحية الأدمن');
      }
    } catch {
      alert('حدث خطأ في الاتصال بالسيرفر');
    } finally {
      setDeletingEmail(null);
    }
  };

  return (
    <div>
      {/* Title Bar */}
      <div style={{
        marginBottom: '2.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        borderBottom: '1px solid rgba(242, 158, 19, 0.12)',
        paddingBottom: '1.25rem',
      }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f7f0e4', marginBottom: '0.25rem' }}>
            إدارة مسؤولين النظام (الأدمن) 👑
          </h1>
          <p style={{ color: 'rgba(247, 240, 228, 0.55)', fontSize: '0.875rem' }}>
            إضافة وإلغاء صلاحيات حسابات المسؤولين المسموح لهم بإدارة المؤتمر والطلبات
          </p>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => { setShowAddModal(true); setError(null); setSuccess(null); }}
          style={{
            padding: '0.625rem 1.25rem',
            fontSize: '0.9375rem',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>إضافة أدمن جديد</span>
        </button>
      </div>

      {success && (
        <div style={{
          padding: '1rem 1.25rem',
          background: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '0.75rem',
          color: '#10b981',
          marginBottom: '1.5rem',
          fontWeight: 700,
          fontSize: '0.9375rem',
        }}>
          ✓ {success}
        </div>
      )}

      {/* Add Admin Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          padding: '1rem',
        }}>
          <div className="glass-card" style={{
            padding: '2rem',
            maxWidth: '28rem',
            width: '100%',
            border: '1px solid rgba(242, 158, 19, 0.3)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f7f0e4' }}>
                إضافة أدمن جديد 👑
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '1.25rem' }}
              >
                ✕
              </button>
            </div>

            {error && (
              <div style={{
                padding: '0.75rem 1rem',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '0.5rem',
                color: '#ef4444',
                fontSize: '0.8125rem',
                marginBottom: '1rem',
                fontWeight: 600,
              }}>
                ⚠️ {error}
              </div>
            )}

            <form onSubmit={handleAddAdmin}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" htmlFor="adminEmail">البريد الإلكتروني للأدمن</label>
                <input
                  id="adminEmail"
                  type="email"
                  className="form-input"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  style={{ direction: 'ltr', textAlign: 'left' }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label className="form-label" htmlFor="adminPassword">
                  كلمة السر (اختياري - 6 أحرف على الأقل)
                </label>
                <input
                  id="adminPassword"
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  style={{ direction: 'ltr', textAlign: 'left' }}
                />
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: '0.375rem' }}>
                  إذا كان الحساب موجوداً مسبقاً في النظام سيتلقى صلاحيات الأدمن مباشرة.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowAddModal(false)}
                  style={{ flex: 1, padding: '0.75rem', border: '1px solid rgba(242, 158, 19, 0.25)', color: '#f7f0e4' }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || !email.trim()}
                  style={{ flex: 1, padding: '0.75rem', opacity: submitting ? 0.7 : 1 }}
                >
                  {submitting ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="spinner" style={{ width: '1rem', height: '1rem' }} />
                      جاري الإضافة...
                    </span>
                  ) : (
                    'تأكيد إضافة الأدمن'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revoke Confirmation Modal */}
      {confirmDelete && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(6px)',
          padding: '1rem',
        }}>
          <div className="glass-card" style={{
            padding: '2rem',
            maxWidth: '26rem',
            width: '100%',
            textAlign: 'center',
            border: '1px solid rgba(239, 68, 68, 0.3)',
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f7f0e4', marginBottom: '0.5rem' }}>
              إلغاء صلاحية الأدمن
            </h3>
            <p style={{ color: 'rgba(247, 240, 228, 0.6)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              هل أنت تأكد من سحب صلاحيات الأدمن عن الحساب (<b>{confirmDelete}</b>)؟
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                className="btn btn-ghost"
                onClick={() => setConfirmDelete(null)}
                style={{ flex: 1, padding: '0.75rem', border: '1px solid rgba(242, 158, 19, 0.25)', color: '#f7f0e4' }}
              >
                إلغاء
              </button>
              <button
                className="btn btn-full"
                onClick={() => handleDeleteAdmin(confirmDelete)}
                disabled={deletingEmail === confirmDelete}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: 'rgba(239, 68, 68, 0.8)',
                  border: '1px solid rgba(239, 68, 68, 0.5)',
                  color: '#fff',
                  fontWeight: 700,
                }}
              >
                {deletingEmail === confirmDelete ? 'جاري السحب...' : 'سحب الصلاحية'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table Section */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
          <div className="spinner spinner-lg" style={{ margin: '0 auto 1.5rem', borderTopColor: '#fbba33' }} />
          <p style={{ color: 'rgba(247, 240, 228, 0.65)', fontSize: '0.9375rem' }}>جاري تحميل قائمة الأدمن...</p>
        </div>
      ) : (
        <div className="glass-card" style={{ overflow: 'hidden', padding: 0, border: '1px solid rgba(242, 158, 19, 0.2)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(12, 7, 3, 0.7)', borderBottom: '1px solid rgba(242, 158, 19, 0.18)' }}>
                  <th style={{ color: '#fbba33', padding: '1rem 1.25rem', textAlign: 'right', fontWeight: 700 }}>البريد الإلكتروني</th>
                  <th style={{ color: '#fbba33', padding: '1rem 1.25rem', textAlign: 'right', fontWeight: 700 }}>نوع الحساب</th>
                  <th style={{ color: '#fbba33', padding: '1rem 1.25rem', textAlign: 'right', fontWeight: 700 }}>حالة التسجيل</th>
                  <th style={{ color: '#fbba33', padding: '1rem 1.25rem', textAlign: 'center', fontWeight: 700 }}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((adm) => (
                  <tr
                    key={adm.email}
                    style={{
                      borderBottom: '1px solid rgba(242, 158, 19, 0.08)',
                      transition: 'background 0.2s ease',
                    }}
                  >
                    <td style={{ fontWeight: 700, color: '#f7f0e4', padding: '1rem 1.25rem', fontFamily: 'monospace' }}>
                      {adm.email}
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      {adm.isPrimary ? (
                        <span className="badge badge-approved" style={{ background: 'rgba(242, 158, 19, 0.2)', color: '#fbba33', border: '1px solid rgba(242, 158, 19, 0.4)' }}>
                          👑 أدمن رئيسي
                        </span>
                      ) : (
                        <span className="badge badge-approved">
                          أدمن معتمد
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      {adm.hasAuthAccount ? (
                        <span style={{ color: '#10b981', fontSize: '0.875rem', fontWeight: 600 }}>
                          ✓ مفعل في النظام
                        </span>
                      ) : (
                        <span style={{ color: '#fbba33', fontSize: '0.875rem', fontWeight: 600 }}>
                          ⏳ بانتظار إنشاء كلمة السر
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      {!adm.isPrimary ? (
                        <button
                          onClick={() => setConfirmDelete(adm.email)}
                          title="سحب صلاحية الأدمن"
                          style={{
                            background: 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '0.5rem',
                            padding: '0.5rem 0.875rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.375rem',
                            fontSize: '0.8125rem',
                            color: '#ef4444',
                            fontWeight: 600,
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                          <span>سحب الصلاحية</span>
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>أساسي</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
