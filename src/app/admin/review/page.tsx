'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth/context';
import type { Registrant } from '@/lib/types';
import { formatTrackTitle, getTrack, trackRequiresAttendanceQr } from '@/lib/registrationTracks';
import { ImageLightboxModal } from '@/components/ui/ImageLightboxModal';
import { getWhatsAppTicketUrl } from '@/lib/services/whatsappService';
import { loadAdminStoredImage } from '@/lib/adminStoredImage';

interface ReviewItem {
  id: string;
  data: Registrant;
  hasPortrait?: boolean;
  hasReceipt?: boolean;
}

function ReviewThumb({
  registrantId,
  kind,
  name,
  title,
  alt,
  onOpen,
  compact = false,
}: {
  registrantId: string;
  kind: 'portrait' | 'receipt';
  name: string;
  title: string;
  alt: string;
  onOpen: (url: string, name: string) => void;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const frameSize = compact ? '4.5rem' : '6rem';

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '160px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !user) return;
    let cancelled = false;
    const currentUser = user;
    void (async () => {
      try {
        const src = await loadAdminStoredImage(
          () => currentUser.getIdToken(),
          kind,
          registrantId
        );
        if (cancelled) return;
        if (!src) {
          setFailed(true);
          return;
        }
        setUrl(src);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, user, kind, registrantId]);

  if (failed) {
    return (
      <div style={{
        width: frameSize,
        height: frameSize,
        borderRadius: '0.75rem',
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        color: '#ef4444',
        fontSize: '0.75rem',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '0.25rem',
      }}>
        صورة غير صالحة
      </div>
    );
  }

  if (!url) {
    return (
      <div
        ref={frameRef}
        className="skeleton"
        style={{
          width: frameSize,
          height: frameSize,
          borderRadius: '0.75rem',
          flexShrink: 0,
        }}
        title={title}
      />
    );
  }

  return (
    <div
      onClick={() => onOpen(url, name)}
      style={{
        width: frameSize,
        height: frameSize,
        borderRadius: '0.75rem',
        overflow: 'hidden',
        flexShrink: 0,
        border: '1.5px solid rgba(242, 158, 19, 0.3)',
        boxShadow: '0 4px 15px rgba(0,0,0,0.4)',
        cursor: 'pointer',
        position: 'relative',
      }}
      title={title}
    >
      <img
        src={url}
        alt={alt}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="11" y1="8" x2="11" y2="14" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </div>
    </div>
  );
}

export default function ReviewPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'pending' | 'approved'>('pending');
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [approvedItems, setApprovedItems] = useState<Set<string>>(new Set());
  const [selectedImageModal, setSelectedImageModal] = useState<{ url: string; name?: string } | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const fetchItems = useCallback(async (cursor?: string | null) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({ tab: activeTab });
      if (cursor) params.set('cursor', cursor);
      const response = await fetch(`/api/admin/review?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error('review_failed');
      }
      const payload = (await response.json()) as {
        items?: ReviewItem[];
        nextCursor?: string | null;
      };
      const newItems = Array.isArray(payload.items) ? payload.items : [];

      if (cursor) {
        setItems((prev) => [...prev, ...newItems]);
      } else {
        setItems(newItems);
      }

      setNextCursor(payload.nextCursor ?? null);
      setHasMore(Boolean(payload.nextCursor));
    } catch (error) {
      console.error('Error fetching review items:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, user]);

  useEffect(() => {
    setLoading(true);
    setItems([]);
    setNextCursor(null);
    setDetailsId(null);
    void fetchItems();
  }, [activeTab, fetchItems]);

  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  const handleAction = async (registrantId: string, action: 'approve' | 'reject') => {
    if (!user) return;
    setActionLoading(registrantId);

    const targetItem = items.find((i) => i.id === registrantId);

    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/admin/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ registrantId }),
      });

      if (response.ok) {
        const resData = await response.json();
        if (action === 'approve') {
          setApprovedItems((prev) => new Set(prev).add(registrantId));
          if (resData.attendanceQrIssued) {
            if (resData.whatsappSent) {
              setNotification({ message: '✓ تم قبول الطلب وإرسال كود الحضور تلقائياً عبر البوت!', type: 'success' });
            } else if (targetItem) {
              window.open(getWhatsAppUrl(targetItem), '_blank');
              setNotification({ message: '✓ تم فتح الواتساب لإرسال كود الحضور!', type: 'info' });
            }
          } else {
            setNotification({
              message: '✓ تم قبول الطلب (بدون كود حضور — المسار ليس انتظامي)',
              type: 'success',
            });
          }
          setTimeout(() => setNotification(null), 4000);
        } else {
          setItems((prev) => prev.filter((item) => item.id !== registrantId));
        }
      } else {
        const errData = await response.json();
        alert(errData.error || `حدث خطأ أثناء ${action === 'approve' ? 'الموافقة' : 'الرفض'}`);
      }
    } catch (error) {
      console.error(`Error ${action}ing:`, error);
      alert('حدث خطأ في الاتصال بالسيرفر');
    } finally {
      setActionLoading(null);
    }
  };

  const getWhatsAppUrl = (item: ReviewItem) => {
    const phone = item.data.whatsappNumber || item.data.phoneNumber || '';
    return getWhatsAppTicketUrl(item.id, phone);
  };

  const dismissApproved = (registrantId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== registrantId));
    setApprovedItems((prev) => {
      const next = new Set(prev);
      next.delete(registrantId);
      return next;
    });
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>مراجعة الطلبات</h1>
          <p>راجع الإيصال والصورة ثم وافق أو ارفض — كود الحضور للانتظامي عبر واتساب</p>
        </div>
        <button
          className="btn btn-ghost"
          onClick={() => { setLoading(true); void fetchItems(); }}
          style={{
            padding: '0.625rem 1.1rem',
            fontSize: '0.875rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'rgba(19, 12, 5, 0.6)',
            border: '1px solid rgba(242, 158, 19, 0.2)',
            color: '#f7f0e4',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          <span>تحديث</span>
        </button>
      </div>

      {notification && (
        <div style={{
          marginBottom: '1.5rem',
          padding: '0.875rem 1.25rem',
          borderRadius: '0.75rem',
          background: notification.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(242, 158, 19, 0.15)',
          border: `1px solid ${notification.type === 'success' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(242, 158, 19, 0.4)'}`,
          color: notification.type === 'success' ? '#10b981' : '#fbba33',
          fontWeight: 700,
          fontSize: '0.9375rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <span>{notification.message}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="admin-tabs">
        <button
          onClick={() => setActiveTab('pending')}
          style={{
            flex: 1,
            padding: '0.625rem 1rem',
            borderRadius: '0.5rem',
            border: 'none',
            fontSize: '0.875rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: activeTab === 'pending' ? '#fbba33' : 'transparent',
            color: activeTab === 'pending' ? '#1a0f05' : 'rgba(247, 240, 228, 0.7)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>بانتظار المراجعة</span>
        </button>

        <button
          onClick={() => setActiveTab('approved')}
          style={{
            flex: 1,
            padding: '0.625rem 1rem',
            borderRadius: '0.5rem',
            border: 'none',
            fontSize: '0.875rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: activeTab === 'approved' ? '#10b981' : 'transparent',
            color: activeTab === 'approved' ? '#ffffff' : 'rgba(247, 240, 228, 0.7)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
          <span>الطلبات المقبولة</span>
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="glass-card skeleton" style={{ height: '5.5rem', border: '1px solid rgba(242, 158, 19, 0.2)' }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        /* Empty State */
        <div className="glass-card" style={{ padding: '4rem 2rem', textAlign: 'center', maxWidth: '32rem', margin: '2rem auto' }}>
          <div style={{
            width: '4.5rem',
            height: '4.5rem',
            borderRadius: '50%',
            background: activeTab === 'approved' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(242, 158, 19, 0.12)',
            border: `1px solid ${activeTab === 'approved' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(242, 158, 19, 0.25)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={activeTab === 'approved' ? '#10b981' : '#fbba33'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f7f0e4', marginBottom: '0.5rem' }}>
            {activeTab === 'pending' ? 'لا توجد طلبات بانتظار المراجعة' : 'لا توجد طلبات مقبولة حالياً'}
          </h2>
          <p style={{ color: 'rgba(247, 240, 228, 0.5)', fontSize: '0.875rem' }}>
            {activeTab === 'pending'
              ? 'تمت مراجعة ومطابقة جميع طلبات التسجيل بنجاح.'
              : 'الطلبات المقبولة ستظهر هنا دائماً لإمكانية إرسال التذاكر عبر الواتساب في أي وقت.'}
          </p>
        </div>
      ) : (
        /* Review Items Grid */
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          {items.map((item) => {
            const isApproved = activeTab === 'approved' || item.data.status === 'approved' || item.data.status === 'auto_approved' || approvedItems.has(item.id);
            const detailsOpen = detailsId === item.id;
            const track = getTrack(item.data.track);
            const hasExtraContact = Boolean(
              item.data.nationalId ||
              item.data.email ||
              (item.data.whatsappNumber && item.data.whatsappNumber !== item.data.phoneNumber)
            );

            return (
              <div
                key={item.id}
                className="glass-card admin-review-card"
                style={{
                  padding: '0.9rem 1rem',
                  border: `1px solid ${isApproved ? 'rgba(16, 185, 129, 0.3)' : 'rgba(242, 158, 19, 0.2)'}`,
                  background: isApproved ? 'rgba(16, 185, 129, 0.04)' : 'rgba(31, 19, 6, 0.65)',
                }}
              >
                <div className="admin-review-summary">
                  {(item.hasReceipt ?? Boolean(item.data.paymentScreenshotUrl)) ? (
                    <ReviewThumb
                      registrantId={item.id}
                      kind="receipt"
                      name={item.data.fullName}
                      title="اضغط لمشاهدة الإيصال بوضوح"
                      alt="إيصال الدفع"
                      compact
                      onOpen={(url, name) => setSelectedImageModal({ url, name })}
                    />
                  ) : null}
                  <div className="admin-review-summary-text">
                    <button
                      type="button"
                      className={`admin-review-name${detailsOpen ? ' is-open' : ''}`}
                      aria-expanded={detailsOpen}
                      onClick={() => setDetailsId((current) => (current === item.id ? null : item.id))}
                    >
                      <span>{item.data.fullName}</span>
                      <svg className="admin-review-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    <div className="admin-review-meta">
                      <span className="admin-review-phone" dir="ltr">{item.data.phoneNumber}</span>
                      {isApproved ? (
                        <span className="badge badge-approved">تمت الموافقة</span>
                      ) : (
                        <span className="badge badge-review">بانتظار المراجعة</span>
                      )}
                    </div>
                  </div>
                </div>

                {detailsOpen ? (
                  <div className="admin-review-drawer">
                    <section className="admin-group-wrap">
                      <h3>الكنيسة والخدمة</h3>
                      <div className="admin-place">
                        <div className="admin-place-head">
                          {(item.hasPortrait ?? Boolean(item.data.portraitUrl)) ? (
                            <ReviewThumb
                              registrantId={item.id}
                              kind="portrait"
                              name={item.data.fullName}
                              title="اضغط لمشاهدة الصورة الشخصية"
                              alt="الصورة الشخصية"
                              compact
                              onOpen={(url, name) => setSelectedImageModal({ url, name })}
                            />
                          ) : (
                            <span className="admin-place-mark" aria-hidden>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 21h18" />
                                <path d="M6 21V8l6-4 6 4v13" />
                                <path d="M10 21v-5h4v5" />
                              </svg>
                            </span>
                          )}
                          <div className="admin-place-head-text">
                            <strong>{item.data.church || '—'}</strong>
                            {item.data.eparchy ? <span>{item.data.eparchy}</span> : null}
                          </div>
                        </div>
                        <div className="admin-place-rows">
                          {track ? (
                            <div className="admin-place-row">
                              <span className="admin-place-k">المسار</span>
                              <span className="admin-place-v">{formatTrackTitle(track)}</span>
                            </div>
                          ) : null}
                          {item.data.confessionFather ? (
                            <div className="admin-place-row">
                              <span className="admin-place-k">أب الاعتراف</span>
                              <span className="admin-place-v">{item.data.confessionFather}</span>
                            </div>
                          ) : null}
                          {item.data.confessionFatherChurch ? (
                            <div className="admin-place-row">
                              <span className="admin-place-k">كنيسة أب الاعتراف</span>
                              <span className="admin-place-v">{item.data.confessionFatherChurch}</span>
                            </div>
                          ) : null}
                          {item.data.currentService ? (
                            <div className="admin-place-row">
                              <span className="admin-place-k">الخدمة</span>
                              <span className="admin-place-v">{item.data.currentService}</span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </section>

                    {hasExtraContact ? (
                    <section className="admin-group-wrap">
                      <h3>البيانات</h3>
                      <dl className="admin-group">
                        {item.data.nationalId ? (
                          <div className="admin-field">
                            <dt>الرقم القومي</dt>
                            <dd><span className="admin-field-value is-ltr" dir="ltr">{item.data.nationalId}</span></dd>
                          </div>
                        ) : null}
                        {item.data.email ? (
                          <div className="admin-field">
                            <dt>البريد</dt>
                            <dd><span className="admin-field-value is-ltr" dir="ltr">{item.data.email}</span></dd>
                          </div>
                        ) : null}
                        {item.data.whatsappNumber && item.data.whatsappNumber !== item.data.phoneNumber ? (
                          <div className="admin-field">
                            <dt>واتساب</dt>
                            <dd><span className="admin-field-value is-ltr" dir="ltr">{item.data.whatsappNumber}</span></dd>
                          </div>
                        ) : null}
                      </dl>
                    </section>
                    ) : null}
                  </div>
                ) : null}

                {/* Action Buttons or WhatsApp share for onsite (انتظامي) track */}
                {isApproved ? (
                  <div style={{ marginTop: '1.5rem' }}>
                    {trackRequiresAttendanceQr(item.data.track) && (
                      <a
                        href={getWhatsAppUrl(item)}
                        target="_blank" rel="noopener noreferrer"
                        style={{ display: 'block', textDecoration: 'none', marginBottom: activeTab === 'pending' ? '0.75rem' : 0 }}
                      >
                        <button className="btn btn-success btn-full" style={{
                          padding: '0.75rem',
                          fontSize: '0.9375rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem',
                          width: '100%',
                          boxShadow: '0 4px 15px rgba(16, 185, 129, 0.25)',
                        }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                          </svg>
                          <span>إرسال كود الحضور على واتساب</span>
                        </button>
                      </a>
                    )}
                    {activeTab === 'pending' && (
                      <button
                        className="btn btn-ghost"
                        onClick={() => dismissApproved(item.id)}
                        style={{
                          width: '100%',
                          padding: '0.75rem 1.25rem',
                          border: '1px solid rgba(242, 158, 19, 0.2)',
                          color: 'rgba(247, 240, 228, 0.6)',
                          fontSize: '0.875rem',
                        }}
                      >
                        تخطي
                      </button>
                    )}
                  </div>
                ) : (
                  /* Pending — show approve/reject */
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-success"
                      onClick={() => handleAction(item.id, 'approve')}
                      disabled={actionLoading === item.id}
                      style={{
                        flex: 1,
                        padding: '0.75rem 1.25rem',
                        fontSize: '0.9375rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      {actionLoading === item.id ? (
                        <span className="spinner" />
                      ) : (
                        <>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>موافقة على الطلب</span>
                        </>
                      )}
                    </button>

                    <button
                      className="btn btn-error"
                      onClick={() => handleAction(item.id, 'reject')}
                      disabled={actionLoading === item.id}
                      style={{
                        flex: 1,
                        padding: '0.75rem 1.25rem',
                        fontSize: '0.9375rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                      <span>رفض الطلب</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {hasMore && (
            <button
              className="btn btn-ghost btn-full"
              onClick={() => nextCursor && void fetchItems(nextCursor)}
              style={{
                padding: '1rem',
                marginTop: '1rem',
                border: '1px solid rgba(242, 158, 19, 0.2)',
                color: '#fbba33',
              }}
            >
              تحميل المزيد من الطلبات
            </button>
          )}
        </div>
      )}

      {selectedImageModal && (
        <ImageLightboxModal
          imageUrl={selectedImageModal.url}
          onClose={() => setSelectedImageModal(null)}
        />
      )}
    </div>
  );
}
