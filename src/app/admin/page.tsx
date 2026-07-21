'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, getCountFromServer } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

interface Stats {
  total: number;
  pending: number;
  review: number;
  approved: number;
  rejected: number;
  checkedIn: number;
}

interface StatCardConfig {
  key: keyof Stats;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
}

const STAT_CARDS: StatCardConfig[] = [
  {
    key: 'total',
    label: 'إجمالي المسجّلين',
    color: '#fbba33',
    bgColor: 'rgba(242, 158, 19, 0.15)',
    borderColor: 'rgba(242, 158, 19, 0.3)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbba33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    key: 'approved',
    label: 'تمت الموافقة',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
  {
    key: 'pending',
    label: 'قيد التحقق التلقائي',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    key: 'review',
    label: 'تحتاج مراجعة',
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    key: 'rejected',
    label: 'الطلبات المرفوضة',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  },
  {
    key: 'checkedIn',
    label: 'المسجلون في البوابة',
    color: '#ec4899',
    bgColor: 'rgba(236, 72, 153, 0.15)',
    borderColor: 'rgba(236, 72, 153, 0.3)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 8h10" />
        <path d="M7 12h10" />
        <path d="M7 16h6" />
      </svg>
    ),
  },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    total: 0, pending: 0, review: 0, approved: 0, rejected: 0, checkedIn: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const registrantsRef = collection(db, 'registrants');
        const ticketsRef = collection(db, 'tickets');

        const [total, pending, review, approved, autoApproved, rejected, checkedIn] =
          await Promise.all([
            getCountFromServer(registrantsRef),
            getCountFromServer(query(registrantsRef, where('status', '==', 'pending_verification'))),
            getCountFromServer(query(registrantsRef, where('status', '==', 'manual_review'))),
            getCountFromServer(query(registrantsRef, where('status', '==', 'approved'))),
            getCountFromServer(query(registrantsRef, where('status', '==', 'auto_approved'))),
            getCountFromServer(query(registrantsRef, where('status', '==', 'rejected'))),
            getCountFromServer(query(ticketsRef, where('used', '==', true))),
          ]);

        setStats({
          total: total.data().count,
          pending: pending.data().count,
          review: review.data().count,
          approved: approved.data().count + autoApproved.data().count,
          rejected: rejected.data().count,
          checkedIn: checkedIn.data().count,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      {/* Header section */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '2.5rem',
        borderBottom: '1px solid rgba(242, 158, 19, 0.12)',
        paddingBottom: '1.25rem',
      }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f7f0e4', marginBottom: '0.25rem' }}>
            نظرة عامة على الإحصائيات
          </h1>
          <p style={{ color: 'rgba(247, 240, 228, 0.55)', fontSize: '0.875rem' }}>
            متابعة فورية لأعداد التسجيلات والحضور — يتم التحديث كل 30 ثانية
          </p>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.8125rem',
          color: '#fbba33',
          background: 'rgba(242, 158, 19, 0.1)',
          padding: '0.5rem 0.875rem',
          borderRadius: '0.75rem',
          border: '1px solid rgba(242, 158, 19, 0.25)',
        }}>
          <div className="pulse-dot" style={{ background: '#fbba33' }} />
          <span>مباشر</span>
        </div>
      </div>

      {/* Stats Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))',
        gap: '1.25rem',
      }}>
        {STAT_CARDS.map((card) => (
          <div
            key={card.key}
            className="glass-card"
            style={{
              padding: '1.5rem',
              position: 'relative',
              overflow: 'hidden',
              border: `1px solid ${card.borderColor}`,
              background: 'rgba(31, 19, 6, 0.65)',
            }}
          >
            {/* Accent Top Line */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '3px',
              background: card.color,
            }} />

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1.25rem',
            }}>
              <span style={{ fontSize: '0.875rem', color: 'rgba(247, 240, 228, 0.7)', fontWeight: 600 }}>
                {card.label}
              </span>
              <div style={{
                width: '2.75rem',
                height: '2.75rem',
                borderRadius: '0.75rem',
                background: card.bgColor,
                border: `1px solid ${card.borderColor}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {card.icon}
              </div>
            </div>

            {loading ? (
              <div className="spinner" style={{ borderTopColor: card.color, margin: '0.5rem 0' }} />
            ) : (
              <div style={{
                fontSize: '2.25rem',
                fontWeight: 900,
                color: card.color,
                lineHeight: 1,
                letterSpacing: '-0.02em',
              }}>
                {stats[card.key].toLocaleString('ar-EG')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
