'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/context';

/** Cache TTL: 15 minutes in milliseconds */
const CACHE_TTL_MS = 15 * 60 * 1000;
/** Cleanup interval: 5 minutes in milliseconds */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

interface CachedRegistrantInfo {
  fullName: string;
  church: string;
  phoneNumber: string;
  fetchedAt: number;
}

interface ScannedTicketItem {
  id: string;
  registrantId?: string;
  registrantName?: string;
  church?: string;
  phoneNumber?: string;
  usedAt?: any;
  usedByUsherId?: string;
}

export default function ScannedAttendeesPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<ScannedTicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [churchFilter, setChurchFilter] = useState('');

  // TTL Cache for registrant details by registrantId to prevent N+1 Firestore reads
  const registrantsCacheRef = useRef<Map<string, CachedRegistrantInfo>>(new Map());

  // Automatic periodic garbage collector to sweep expired entries every 5 minutes
  useEffect(() => {
    const sweeper = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of registrantsCacheRef.current.entries()) {
        if (now - entry.fetchedAt > CACHE_TTL_MS) {
          registrantsCacheRef.current.delete(key);
        }
      }
    }, CLEANUP_INTERVAL_MS);

    return () => clearInterval(sweeper);
  }, []);

  // Real-time listener for scanned tickets
  useEffect(() => {
    if (!user) return;

    const qScanned = query(
      collection(db, 'tickets'),
      where('used', '==', true)
    );

    const unsubscribeScanned = onSnapshot(
      qScanned,
      async (snapshot) => {
        const rawTickets = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as any),
        }));

        // Resolve detailed registrant info (Name, Church, Phone) for each scanned ticket using TTL cache
        const resolvedItems: ScannedTicketItem[] = await Promise.all(
          rawTickets.map(async (data: any) => {
            const regId = data.registrantId || data.id;
            let name = data.registrantName;
            let ch = data.church;
            let phone = data.phoneNumber || '';

            const isMissingData = !name || name === 'زائر' || !ch || ch === 'غير محدد' || !phone;

            if (isMissingData) {
              const now = Date.now();
              const cached = registrantsCacheRef.current.get(regId);
              const isExpired = cached && now - cached.fetchedAt > CACHE_TTL_MS;

              if (cached && !isExpired) {
                name = cached.fullName || name;
                ch = cached.church || ch;
                phone = cached.phoneNumber || phone;
              } else {
                if (isExpired) {
                  registrantsCacheRef.current.delete(regId);
                }
                try {
                  const regSnap = await getDoc(doc(db, 'registrants', regId));
                  if (regSnap.exists()) {
                    const r = regSnap.data();
                    const fetchedInfo: CachedRegistrantInfo = {
                      fullName: r.fullName || '',
                      church: r.church || '',
                      phoneNumber: r.phoneNumber || '',
                      fetchedAt: now,
                    };
                    registrantsCacheRef.current.set(regId, fetchedInfo);

                    if (fetchedInfo.fullName) name = fetchedInfo.fullName;
                    if (fetchedInfo.church) ch = fetchedInfo.church;
                    if (fetchedInfo.phoneNumber) phone = fetchedInfo.phoneNumber;
                  }
                } catch (e) {
                  console.error('Error fetching registrant for ticket:', regId, e);
                }
              }
            }

            return {
              id: data.id,
              registrantId: regId,
              registrantName: name || 'حاضر بدون اسم',
              church: ch || 'غير محدد',
              phoneNumber: phone,
              usedAt: data.usedAt,
              usedByUsherId: data.usedByUsherId || 'الماسح الإلكتروني',
            };
          })
        );

        // Sort by check-in time descending
        resolvedItems.sort((a, b) => {
          const tA = a.usedAt?.toMillis?.() || a.usedAt?.seconds * 1000 || 0;
          const tB = b.usedAt?.toMillis?.() || b.usedAt?.seconds * 1000 || 0;
          return tB - tA;
        });

        setTickets(resolvedItems);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching scanned tickets:', err);
        setLoading(false);
      }
    );

    return () => unsubscribeScanned();
  }, [user]);

  // Unique list of churches for filtering
  const churchesList = useMemo(() => {
    const set = new Set<string>();
    tickets.forEach((t) => {
      if (t.church && t.church !== 'غير محدد') {
        set.add(t.church);
      }
    });
    return Array.from(set).sort();
  }, [tickets]);

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      const matchSearch =
        !searchTerm.trim() ||
        (t.registrantName && t.registrantName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (t.phoneNumber && t.phoneNumber.includes(searchTerm));

      const matchChurch = !churchFilter || t.church === churchFilter;

      return matchSearch && matchChurch;
    });
  }, [tickets, searchTerm, churchFilter]);

  // Format timestamp helper
  const formatTime = (ts: any) => {
    if (!ts) return 'غير محدد';
    try {
      const date = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
      return new Intl.DateTimeFormat('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).format(date);
    } catch {
      return 'غير محدد';
    }
  };

  // Export CSV helper
  const exportCSV = () => {
    if (filteredTickets.length === 0) return;

    const headers = ['#', 'الاسم الكامل', 'الكنيسة', 'رقم الموبايل', 'وقت الدخول', 'معرّف التذكرة'];
    const rows = filteredTickets.map((t, idx) => [
      idx + 1,
      `"${t.registrantName || ''}"`,
      `"${t.church || ''}"`,
      `"${t.phoneNumber || ''}"`,
      `"${formatTime(t.usedAt)}"`,
      `"${t.id}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `كشف_حضور_البوابة_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <div className="spinner spinner-lg spinner-gold" style={{ margin: '0 auto 1rem' }} />
        <p style={{ color: 'rgba(255,255,255,0.6)' }}>جاري تحميل تفاصيل المسجلين في البوابة...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Title & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#ffffff', margin: 0, marginBottom: '0.25rem' }}>
            المسجلون في البوابة
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'rgba(247, 240, 228, 0.6)', margin: 0 }}>
            بيانات الأشخاص الذين تم مسح تذاكرهم ودخولهم الفعلي لقاعة المؤتمر
          </p>
        </div>

        <button
          onClick={exportCSV}
          disabled={filteredTickets.length === 0}
          className="btn btn-ghost"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'rgba(242, 158, 19, 0.12)',
            border: '1px solid rgba(242, 158, 19, 0.3)',
            color: '#fbba33',
            fontSize: '0.875rem',
            fontWeight: 700,
            padding: '0.6rem 1rem',
            borderRadius: '0.75rem',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>تصدير كشف الحضور (CSV)</span>
        </button>
      </div>

      {/* KPI Cards: Total Scanned & Total Unique Churches */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        {/* Card 1: Total Scanned at Gate */}
        <div className="glass-card" style={{ padding: '1.25rem', textAlign: 'right' }}>
          <span style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '0.35rem' }}>
            إجمالي الحضور الفعلي بالبوابة
          </span>
          <div style={{ fontSize: '2.25rem', fontWeight: 900, color: '#fbba33', lineHeight: 1.1 }}>
            {tickets.length.toLocaleString('ar-EG')}
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginRight: '0.4rem' }}>شخصاً</span>
          </div>
        </div>

        {/* Card 2: Total Unique Churches */}
        <div className="glass-card" style={{ padding: '1.25rem', textAlign: 'right' }}>
          <span style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '0.35rem' }}>
            عدد الكنائس الممثلة بالدخول
          </span>
          <div style={{ fontSize: '2.25rem', fontWeight: 900, color: '#34d399', lineHeight: 1.1 }}>
            {churchesList.length.toLocaleString('ar-EG')}
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginRight: '0.4rem' }}>كنيسة</span>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="glass-card" style={{ padding: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
        <div style={{ flex: '1 1 200px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="بحث باسم الحاضر أو رقم الموبايل..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        {churchesList.length > 0 && (
          <div style={{ flex: '0 0 180px' }}>
            <select
              className="form-input"
              value={churchFilter}
              onChange={(e) => setChurchFilter(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">جميع الكنائس</option>
              {churchesList.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Scanned Attendees Table */}
      {filteredTickets.length === 0 ? (
        <div className="glass-card" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem', opacity: 0.5 }}>🎫</div>
          <p style={{ fontSize: '1rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
            لم يتم تسجيل أي حضور بالبوابة حتى الآن
          </p>
          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.25rem' }}>
            عند مسح تذكرة الحاضرين عند مدخل القاعة ستظهر أسماؤهم وبياناتهم الكاملة هنا فوراً
          </p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden" style={{ padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
              <thead>
                <tr style={{ background: 'rgba(242, 158, 19, 0.08)', borderBottom: '1px solid rgba(242, 158, 19, 0.2)' }}>
                  <th style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem', color: '#fbba33' }}>#</th>
                  <th style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem', color: '#fbba33' }}>اسم الحاضر</th>
                  <th style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem', color: '#fbba33' }}>الكنيسة</th>
                  <th style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem', color: '#fbba33' }}>رقم الموبايل</th>
                  <th style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem', color: '#fbba33' }}>وقت الدخول</th>
                  <th style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem', color: '#fbba33' }}>الماسح / الخادم</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((t, idx) => (
                  <tr
                    key={t.id}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      transition: 'background 0.2s ease',
                    }}
                  >
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)' }}>
                      {(idx + 1).toLocaleString('ar-EG')}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontWeight: 700, color: '#ffffff' }}>
                      {t.registrantName}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'rgba(255,255,255,0.8)' }}>
                      {t.church}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }} dir="ltr">
                      {t.phoneNumber || '-'}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.875rem', color: '#34d399', fontWeight: 600 }}>
                      {formatTime(t.usedAt)}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
                      {t.usedByUsherId}
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
