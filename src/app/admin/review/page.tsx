'use client';

import { useEffect, useState } from 'react';
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
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [approvedItems, setApprovedItems] = useState<Set<string>>(new Set());

  const PAGE_SIZE = 20;

  const fetchItems = async (after?: QueryDocumentSnapshot) => {
    try {
      let q = query(
        collection(db, 'registrants'),
        where('status', 'in', ['manual_review', 'pending_verification']),
        orderBy('createdAt', 'asc'),
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
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          // Show WhatsApp share button instead of removing the card
          setApprovedItems((prev) => new Set(prev).add(registrantId));
        } else {
          // For reject, remove the card immediately
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
      `✅ مبروك يا ${item.data.fullName}!\n\n` +
      `تم قبول تسجيلك في مؤتمر الكنيسة بنجاح 🎉\n\n` +
      `📲 رابط تذكرتك:\n${ticketUrl}\n\n` +
      `يرجى إظهار التذكرة عند الدخول.`
    );
    const phone = item.data.whatsappNumber.startsWith('0')
      ? `2${item.data.whatsappNumber}`
      : item.data.whatsappNumber;
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

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <div className="spinner spinner-lg" style={{ margin: '0 auto 1.5rem', borderTopColor: '#fbba33' }} />
        <p style={{ color: 'rgba(247, 240, 228, 0.65)', fontSize: '0.9375rem' }}>جاري تحميل طلبات المراجعة...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Page Title Bar */}
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
            قائمة المراجعة اليدوية
          </h1>
          <p style={{ color: 'rgba(247, 240, 228, 0.55)', fontSize: '0.875rem' }}>
            {items.length.toLocaleString('ar-EG')} طلبات بحاجة لمراجعة المشرفين
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

      {items.length === 0 ? (
        /* Empty State */
        <div className="glass-card" style={{ padding: '4rem 2rem', textAlign: 'center', maxWidth: '32rem', margin: '2rem auto' }}>
          <div style={{
            width: '4.5rem',
            height: '4.5rem',
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f7f0e4', marginBottom: '0.5rem' }}>
            لا توجد طلبات بانتظار المراجعة
          </h2>
          <p style={{ color: 'rgba(247, 240, 228, 0.5)', fontSize: '0.875rem' }}>
            تمت مراجعة ومطابقة جميع طلبات التسجيل بنجاح.
          </p>
        </div>
      ) : (
        /* Review Items Grid */
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          {items.map((item) => (
            <div
              key={item.id}
              className="glass-card"
              style={{
                padding: '1.75rem',
                border: '1px solid rgba(242, 158, 19, 0.2)',
                background: 'rgba(31, 19, 6, 0.65)',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1.5rem', alignItems: 'start' }}>
                {/* Registrant Data */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f7f0e4' }}>{item.data.fullName}</h3>
                    {getConfidenceBadge(item.data.ocrConfidence)}
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
                    gap: '0.75rem',
                    fontSize: '0.875rem',
                    color: 'rgba(247, 240, 228, 0.75)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ color: '#fbba33' }}>⛪</span>
                      <span>{item.data.church}</span>
                    </div>

                    <div dir="ltr" style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <span>{item.data.phoneNumber}</span>
                      <span style={{ color: '#fbba33' }}>📱</span>
                    </div>

                    {item.data.ocrExtractedReference && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: '#fbba33' }}>🔢</span>
                        <span>مرجع: {item.data.ocrExtractedReference}</span>
                      </div>
                    )}

                    {item.data.ocrExtractedAmount != null && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: '#fbba33' }}>💰</span>
                        <span style={{ fontWeight: 700, color: '#fbba33' }}>{item.data.ocrExtractedAmount} جم</span>
                      </div>
                    )}

                    {item.data.ocrExtractedSenderName && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: '#fbba33' }}>👤</span>
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
                    }}>
                      ⚠️ ملاحظات النواقص: {item.data.adminNotes}
                    </div>
                  )}
                </div>

                {/* Screenshot Preview */}
                {item.data.paymentScreenshotUrl && (
                  <a
                    href={item.data.paymentScreenshotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      width: '6rem',
                      height: '6rem',
                      borderRadius: '0.75rem',
                      overflow: 'hidden',
                      flexShrink: 0,
                      border: '1.5px solid rgba(242, 158, 19, 0.3)',
                      boxShadow: '0 4px 15px rgba(0,0,0,0.4)',
                      display: 'block',
                    }}
                    title="تكبير صورة الإيصال"
                  >
                    <img
                      src={item.data.paymentScreenshotUrl}
                      alt="إيصال الدفع"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </a>
                )}
              </div>

              {/* Action Buttons or WhatsApp Share */}
              {approvedItems.has(item.id) ? (
                /* Approved — show WhatsApp share + dismiss */
                <div style={{ marginTop: '1.5rem' }}>
                  <div style={{
                    padding: '0.75rem 1rem',
                    background: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '0.75rem',
                    marginBottom: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    justifyContent: 'center',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span style={{ color: '#10b981', fontWeight: 700, fontSize: '0.9375rem' }}>تمت الموافقة بنجاح ✓</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <a
                      href={getWhatsAppUrl(item)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ flex: 2, textDecoration: 'none', display: 'block' }}
                    >
                      <button className="btn btn-success btn-full" style={{
                        padding: '0.75rem',
                        fontSize: '0.9375rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        width: '100%',
                      }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                        </svg>
                        <span>إرسال التذكرة على واتساب</span>
                      </button>
                    </a>
                    <button
                      className="btn btn-ghost"
                      onClick={() => dismissApproved(item.id)}
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        border: '1px solid rgba(242, 158, 19, 0.2)',
                        color: 'rgba(247, 240, 228, 0.6)',
                        fontSize: '0.875rem',
                      }}
                    >
                      تخطي
                    </button>
                  </div>
                </div>
              ) : (
                /* Not yet acted on — show approve/reject */
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
          ))}

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
    </div>
  );
}
