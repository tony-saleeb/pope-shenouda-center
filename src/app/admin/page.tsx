'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/context';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from 'recharts';
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
  /** Denominator for the share figure — attendance reads against approvals, not the total. */
  shareOf: 'total' | 'approved';
  shareLabel: string;
  icon: React.ReactNode;
}

const TOTAL_COLOR = '#fbba33';

const TOTAL_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const STAT_CARDS: StatCardConfig[] = [
  {
    key: 'approved',
    label: 'تمت الموافقة',
    color: '#10b981',
    shareOf: 'total',
    shareLabel: 'من الإجمالي',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
  {
    key: 'review',
    label: 'تحتاج مراجعة',
    color: '#3b82f6',
    shareOf: 'total',
    shareLabel: 'من الإجمالي',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    shareOf: 'total',
    shareLabel: 'من الإجمالي',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  },
  {
    key: 'checkedIn',
    label: 'تسجيل الحضور',
    color: '#ec4899',
    shareOf: 'approved',
    shareLabel: 'من المقبولين',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 8h10" />
        <path d="M7 12h10" />
        <path d="M7 16h6" />
      </svg>
    ),
  },
];

/** Segments of the headline distribution bar. */
const DISTRIBUTION: Array<{ key: keyof Stats; label: string; color: string }> = [
  { key: 'approved', label: 'تمت الموافقة', color: '#10b981' },
  { key: 'review', label: 'تحتاج مراجعة', color: '#3b82f6' },
  { key: 'rejected', label: 'مرفوضة', color: '#ef4444' },
];

function percentOf(value: number, base: number): number {
  if (base <= 0) return 0;
  return Math.round((value / base) * 100);
}

function accent(color: string): React.CSSProperties {
  return { '--stat-accent': color } as React.CSSProperties;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({
    total: 0, pending: 0, review: 0, approved: 0, rejected: 0, checkedIn: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const currentUser = user;

    async function fetchStats() {
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch('/api/admin/stats', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error('stats_failed');
        }
        const payload = (await response.json()) as Partial<Stats>;
        setStats({
          total: payload.total ?? 0,
          pending: payload.pending ?? 0,
          review: payload.review ?? 0,
          approved: payload.approved ?? 0,
          rejected: payload.rejected ?? 0,
          checkedIn: payload.checkedIn ?? 0,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    }

    void fetchStats();
    const interval = setInterval(() => {
      void fetchStats();
    }, 30000);
    return () => clearInterval(interval);
  }, [user]);

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
            متابعة أعداد التسجيلات والحضور — يتم التحديث كل 30 ثانية
          </p>
        </div>
      </div>

      {/* Stats Cards Grid */}
      <div className="stat-grid">
        {/* Headline metric — anchors the page and carries the status breakdown */}
        <div className="stat-card stat-hero" style={accent(TOTAL_COLOR)}>
          <div className="stat-card-head">
            <span className="stat-card-label">إجمالي المسجّلين</span>
            <span className="stat-card-icon">{TOTAL_ICON}</span>
          </div>

          <div className="stat-hero-body">
            <div className="stat-hero-figure">
              {loading ? (
                <div className="spinner" style={{ borderTopColor: TOTAL_COLOR, margin: '0.5rem 0' }} />
              ) : (
                <div className="stat-card-value" data-zero={stats.total === 0 ? 'true' : 'false'}>
                  {stats.total.toLocaleString('ar-EG')}
                </div>
              )}
            </div>

            {!loading && stats.total > 0 && (
              <div className="stat-hero-breakdown">
                <div className="stat-dist">
                  {DISTRIBUTION.map((segment) => {
                    const value = stats[segment.key];
                    if (value <= 0) return null;
                    return (
                      <div
                        key={segment.key}
                        className="stat-dist-seg"
                        style={{
                          width: `${percentOf(value, stats.total)}%`,
                          background: segment.color,
                        }}
                      />
                    );
                  })}
                </div>
                <div className="stat-legend">
                  {DISTRIBUTION.map((segment) => (
                    <span key={segment.key} className="stat-legend-item">
                      <span className="stat-legend-dot" style={{ background: segment.color }} />
                      {segment.label}
                      <b>{stats[segment.key].toLocaleString('ar-EG')}</b>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {STAT_CARDS.map((card) => {
          const value = stats[card.key];
          const share = percentOf(value, card.shareOf === 'approved' ? stats.approved : stats.total);

          return (
            <div key={card.key} className="stat-card" style={accent(card.color)}>
              <div className="stat-card-head">
                <span className="stat-card-label">{card.label}</span>
                <span className="stat-card-icon">{card.icon}</span>
              </div>

              {loading ? (
                <div className="spinner" style={{ borderTopColor: card.color, margin: '0.5rem 0' }} />
              ) : (
                <>
                  <div className="stat-card-value" data-zero={value === 0 ? 'true' : 'false'}>
                    {value.toLocaleString('ar-EG')}
                  </div>
                  <div className="stat-card-meta">
                    <strong>{share.toLocaleString('ar-EG')}%</strong>
                    <span>{card.shareLabel}</span>
                  </div>
                  <div className="stat-bar">
                    <div className="stat-bar-fill" style={{ width: `${share}%` }} />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Analytics Chart */}
      <div className="glass-card" style={{ marginTop: '2.5rem', padding: '2rem', border: '1px solid rgba(242, 158, 19, 0.2)', background: 'rgba(31, 19, 6, 0.65)' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f7f0e4', marginBottom: '1.5rem' }}>
          توزيع حالات التسجيل
        </h2>
        {loading ? (
          <div className="skeleton" style={{ width: '100%', height: '300px', borderRadius: '0.75rem' }} />
        ) : (
          <div style={{ width: '100%', height: '300px' }} dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { name: 'تمت الموافقة', value: stats.approved, fill: '#10b981' },
                  { name: 'تحتاج مراجعة', value: stats.review, fill: '#3b82f6' },
                  { name: 'قيد التحقق', value: stats.pending, fill: '#f59e0b' },
                  { name: 'مرفوضة', value: stats.rejected, fill: '#ef4444' },
                ]}
                margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                barSize={40}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" stroke="rgba(247, 240, 228, 0.5)" tick={{ fill: 'rgba(247, 240, 228, 0.7)', fontSize: 13 }} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(247, 240, 228, 0.5)" tick={{ fill: 'rgba(247, 240, 228, 0.7)', fontSize: 13 }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ backgroundColor: 'rgba(19, 12, 5, 0.9)', borderColor: 'rgba(242, 158, 19, 0.3)', borderRadius: '0.5rem', color: '#f7f0e4', direction: 'rtl' }}
                  itemStyle={{ color: '#f7f0e4' }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {
                    [
                      { fill: '#10b981' },
                      { fill: '#3b82f6' },
                      { fill: '#f59e0b' },
                      { fill: '#ef4444' }
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))
                  }
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
