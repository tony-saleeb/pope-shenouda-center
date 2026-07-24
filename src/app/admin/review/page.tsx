'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  collection, query, where, orderBy, limit, getDocs,
  startAfter, QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/context';
import type { Registrant } from '@/lib/types';

interface ReviewItem {
  id: string;
  data: Registrant;
}

export default function ReviewPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'pending' | 'approved'>('pending');
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [approvedItems, setApprovedItems] = useState<Set<string>>(new Set());
  const [selectedImageModal, setSelectedImageModal] = useState<{ url: string; name?: string } | null>(null);

  const PAGE_SIZE = 20;

  const fetchItems = useCallback(async (after?: QueryDocumentSnapshot) => {
    try {
      const statuses = activeTab === 'pending'
        ? ['manual_review', 'pending_verification']
        : ['approved', 'auto_approved'];

      let q = query(
        collection(db, 'registrants'),
        where('status', 'in', statuses),
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE)
      );

      if (after) {
        q = query(q, startAfter(after));
      }

      const snapshot = await getDocs(q);
      const newItems = snapshot.docs.map((doc) => ({
        id: doc.id,
        data: doc.data() as Registrant,
      }));

      if (after) {
        setItems((prev) => [...prev, ...newItems]);
      } else {
        setItems(newItems);
      }

      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === PAGE_SIZE);
    } catch (error) {
      console.error('Error fetching review items:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    setLoading(true);
    setItems([]);
    setLastDoc(null);
    fetchItems();
  }, [activeTab, fetchItems]);

  const handleAction = async (registrantId: string, action: 'approve' | 'reject') => {
    if (!user) return;
    setActionLoading(registrantId);

    try {
      const token = await user.getIdToken(true);
      const response = await fetch(`/api/admin/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ registrantId }),
      });

      if (response.ok) {
        if (action === 'approve') {
          setApprovedItems((prev) => new Set(prev).add(registrantId));
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
    const ticketUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/ticket/${item.id}`;
    const text = encodeURIComponent(
      `تم قبول تسجيلك في مؤتمر القرن العاشر بنجاح 🎉\n\n` +
      `📲 رابط تذكرتك:\n${ticketUrl}\n\n` +
      `يرجى إظهار التذكرة عند الدخول.`
    );
    const phone = item.data.whatsappNumber?.startsWith('0')
      ? `2${item.data.whatsappNumber}`
      : item.data.whatsappNumber || item.data.phoneNumber;
    return `https://api.whatsapp.com/send?phone=${phone}&text=${text}`;
  };

  const dismissApproved = (registrantId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== registrantId));
    setApprovedItems((prev) => {
      const next = new Set(prev);
      next.delete(registrantId);
      return next;
    });
  };

  const getConfidenceBadge = (confidence: string | null) => {
    switch (confidence) {
      case 'high':
        return <span className="badge badge-approved">دقة عالية</span>;
      case 'low':
        return <span className="badge badge-pending">دقة منخفضة</span>;
      case 'failed':
        return <span className="badge badge-rejected">فشل المستخرج</span>;
      default:
        return <span className="badge badge-review">بانتظار التحقق</span>;
    }
  };

  return (
    <div>
      {/* Page Title Bar */}
      <div style={{
        marginBottom: '2rem',
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
            مراجعة الطلبات وإرسال التذاكر
          </h1>
          <p style={{ color: 'rgba(247, 240, 228, 0.55)', fontSize: '0.875rem' }}>
            مراجعة إيصالات الدفع، إقرار الموافقة، وإرسال التذاكر عبر واتساب في أي وقت
          </p>
        </div>

        <button
          className="btn btn-ghost"
          onClick={() => { setLoading(true); fetchItems(); }}
          style={{
            padding: '0.625rem 1.25rem',
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
          <span>تحديث القائمة</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '2rem',
        background: 'rgba(19, 12, 5, 0.6)',
        padding: '0.375rem',
        borderRadius: '0.75rem',
        border: '1px solid rgba(242, 158, 19, 0.2)',
        maxWidth: '30rem',
      }}>
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
        <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
          <div className="spinner spinner-lg" style={{ margin: '0 auto 1.5rem', borderTopColor: '#fbba33' }} />
          <p style={{ color: 'rgba(247, 240, 228, 0.65)', fontSize: '0.9375rem' }}>جاري تحميل الطلبات...</p>
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

            return (
              <div
                key={item.id}
                className="glass-card"
                style={{
                  padding: '1.75rem',
                  border: `1px solid ${isApproved ? 'rgba(16, 185, 129, 0.3)' : 'rgba(242, 158, 19, 0.2)'}`,
                  background: isApproved ? 'rgba(16, 185, 129, 0.04)' : 'rgba(31, 19, 6, 0.65)',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1.5rem', alignItems: 'start' }}>
                  {/* Registrant Data */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f7f0e4' }}>{item.data.fullName}</h3>
                      {isApproved ? (
                        <span className="badge badge-approved" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>تمت الموافقة</span>
                        </span>
                      ) : (
                        getConfidenceBadge(item.data.ocrConfidence)
                      )}
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
                      gap: '0.75rem',
                      fontSize: '0.875rem',
                      color: 'rgba(247, 240, 228, 0.75)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbba33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 22V8a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14" />
                          <path d="M4 22h16" />
                          <path d="M12 2v4" />
                        </svg>
                        <span>{item.data.church}</span>
                      </div>

                      <div dir="ltr" style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <span>{item.data.phoneNumber}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbba33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                          <line x1="12" y1="18" x2="12.01" y2="18" />
                        </svg>
                      </div>

                      {item.data.ocrExtractedReference && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbba33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="4" y1="9" x2="20" y2="9" />
                            <line x1="4" y1="15" x2="20" y2="15" />
                            <line x1="10" y1="3" x2="8" y2="21" />
                            <line x1="16" y1="3" x2="14" y2="21" />
                          </svg>
                          <span>مرجع: {item.data.ocrExtractedReference}</span>
                        </div>
                      )}

                      {item.data.ocrExtractedAmount != null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbba33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="6" width="20" height="12" rx="2" />
                            <circle cx="12" cy="12" r="2" />
                          </svg>
                          <span style={{ fontWeight: 700, color: '#fbba33' }}>{item.data.ocrExtractedAmount} جم</span>
                        </div>
                      )}

                      {item.data.ocrExtractedSenderName && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbba33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                          <span>المرسل: {item.data.ocrExtractedSenderName}</span>
                        </div>
                      )}
                    </div>

                    {item.data.adminNotes && (
                      <div style={{
                        marginTop: '1rem',
                        padding: '0.75rem 1rem',
                        background: 'rgba(245, 158, 11, 0.12)',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        borderRadius: '0.75rem',
                        fontSize: '0.8125rem',
                        color: '#fbba33',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        <span>ملاحظات النواقص: {item.data.adminNotes}</span>
                      </div>
                    )}
                  </div>

                  {/* Screenshot Preview */}
                  {item.data.paymentScreenshotUrl && (
                    <div
                      onClick={() => setSelectedImageModal({ url: item.data.paymentScreenshotUrl!, name: item.data.fullName })}
                      style={{
                        width: '6rem',
                        height: '6rem',
                        borderRadius: '0.75rem',
                        overflow: 'hidden',
                        flexShrink: 0,
                        border: '1.5px solid rgba(242, 158, 19, 0.3)',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.4)',
                        cursor: 'pointer',
                        position: 'relative',
                      }}
                      title="اضغط لمشاهدة الإيصال بوضوح"
                    >
                      <img
                        src={item.data.paymentScreenshotUrl}
                        alt="إيصال الدفع"
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
                  )}
                </div>

                {/* Action Buttons or Permanent WhatsApp Share */}
                {isApproved ? (
                  /* Approved — WhatsApp button is ALWAYS accessible */
                  <div style={{ marginTop: '1.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <a
                        href={getWhatsAppUrl(item)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ flex: 1, textDecoration: 'none', display: 'block' }}
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
                          <span>إرسال التذكرة على واتساب</span>
                        </button>
                      </a>

                      {activeTab === 'pending' && (
                        <button
                          className="btn btn-ghost"
                          onClick={() => dismissApproved(item.id)}
                          style={{
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
                  </div>
                ) : (
                  /* Pending — show approve/reject */
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
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
              onClick={() => lastDoc && fetchItems(lastDoc)}
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

      {/* Full-Screen Lightbox Image Preview Modal */}
      {selectedImageModal && (
        <div
          onClick={() => setSelectedImageModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(0, 0, 0, 0.92)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '44rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem',
            }}
          >
            <h3 style={{ color: '#f7f0e4', fontWeight: 800, fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbba33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
              <span>معاينة إيصال الدفع {selectedImageModal.name ? `— ${selectedImageModal.name}` : ''}</span>
            </h3>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <a
                href={selectedImageModal.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: 'rgba(255, 255, 255, 0.12)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  color: '#fff',
                  padding: '0.4rem 0.875rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                فتح الحجم الأصلي ↗
              </a>
              <button
                onClick={() => setSelectedImageModal(null)}
                style={{
                  background: 'rgba(239, 68, 68, 0.85)',
                  border: 'none',
                  color: '#fff',
                  width: '2.25rem',
                  height: '2.25rem',
                  borderRadius: '50%',
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>
          </div>

          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-card"
            style={{
              maxWidth: '44rem',
              maxHeight: '80vh',
              padding: '0.75rem',
              borderRadius: '1rem',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(19, 12, 5, 0.95)',
              border: '1px solid rgba(242, 158, 19, 0.3)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
            }}
          >
            <img
              src={selectedImageModal.url}
              alt="إيصال الدفع"
              style={{
                maxWidth: '100%',
                maxHeight: '75vh',
                objectFit: 'contain',
                borderRadius: '0.625rem',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
