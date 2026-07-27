'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import {
  collection, query, where, orderBy, limit,
  onSnapshot, getDocs, documentId, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/context';

/** Cache TTL: 15 minutes in milliseconds */
const CACHE_TTL_MS = 15 * 60 * 1000;
/** Cleanup interval: 5 minutes in milliseconds */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
/** Max scanned tickets limit for real-time stream */
const SCANNED_TICKETS_LIMIT = 300;

interface CachedRegistrantInfo {
  fullName: string;
  church: string;
  phoneNumber: string;
  fetchedAt: number;
}

interface RawTicketData {
  id: string;
  registrantId?: string;
  registrantName?: string;
  church?: string;
  phoneNumber?: string;
  used?: boolean;
  usedAt?: Timestamp | null;
  usedByUsherId?: string;
}

interface ScannedTicketItem {
  id: string;
  registrantId?: string;
  registrantName?: string;
  church?: string;
  phoneNumber?: string;
  usedAt?: Timestamp | null;
  usedByUsherId?: string;
}

/**
 * KPI summary card component to avoid inline JSX repetition.
 */
function KpiCard({
  title,
  value,
  unit,
  color,
}: {
  title: string;
  value: number;
  unit: string;
  color: string;
}) {
  return (
    <div className="glass-card" style={{ padding: '1.25rem', textAlign: 'right' }}>
      <span style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '0.35rem' }}>
        {title}
      </span>
      <div style={{ fontSize: '2.25rem', fontWeight: 900, color, lineHeight: 1.1 }}>
        {value.toLocaleString('ar-EG')}
        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginRight: '0.4rem' }}>
          {unit}
        </span>
      </div>
    </div>
  );
}

/**
 * Properly escapes CSV field values according to RFC 4180.
 * Doubles any embedded double quotes and wraps the field in double quotes.
 */
function escapeCsvField(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Format Timestamp helper safely.
 */
function formatTime(ts?: Timestamp | null): string {
  if (!ts) return 'غير محدد';
  try {
    const date = ts.toDate ? ts.toDate() : new Date((ts as any).seconds * 1000);
    return new Intl.DateTimeFormat('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return 'غير محدد';
  }
}

/**
 * Batched resolver that hydrates scanned tickets with registrant details.
 * Replaces N+1 per-ticket getDoc calls with batched 'in' queries (chunks of 10)
 * while maintaining 15-minute TTL cache and negative caching semantics.
 */
async function resolveScannedTickets(
  rawTickets: RawTicketData[],
  cacheMap: Map<string, CachedRegistrantInfo>
): Promise<ScannedTicketItem[]> {
  const now = Date.now();

  // 1. Collect unique registrantIds that need fetching from Firestore
  const missingIdsSet = new Set<string>();

  for (const data of rawTickets) {
    const regId = data.registrantId;
    let name = data.registrantName;
    let ch = data.church;
    let phone = data.phoneNumber || '';

    const isMissingData = !name || name === 'زائر' || !ch || ch === 'غير محدد' || !phone;

    if (isMissingData && regId) {
      const cached = cacheMap.get(regId);
      const isExpired = cached && now - cached.fetchedAt > CACHE_TTL_MS;

      if (!cached || isExpired) {
        if (isExpired) {
          cacheMap.delete(regId);
        }
        missingIdsSet.add(regId);
      }
    }
  }

  // 2. Batch fetch missing IDs in chunks of 10 using documentId() 'in' query
  const idsToFetch = Array.from(missingIdsSet);
  const CHUNK_SIZE = 10;

  for (let i = 0; i < idsToFetch.length; i += CHUNK_SIZE) {
    const chunk = idsToFetch.slice(i, i + CHUNK_SIZE);
    try {
      const q = query(
        collection(db, 'registrants'),
        where(documentId(), 'in', chunk)
      );
      const snap = await getDocs(q);

      const foundIds = new Set<string>();
      snap.forEach((docSnap) => {
        foundIds.add(docSnap.id);
        const r = docSnap.data();
        cacheMap.set(docSnap.id, {
          fullName: r.fullName || '',
          church: r.church || '',
          phoneNumber: r.phoneNumber || '',
          fetchedAt: now,
        });
      });

      // Negative caching for any registrant IDs not found in Firestore
      chunk.forEach((id) => {
        if (!foundIds.has(id)) {
          cacheMap.set(id, {
            fullName: '',
            church: '',
            phoneNumber: '',
            fetchedAt: now,
          });
        }
      });
    } catch (err) {
      console.error('Error batch-fetching registrants chunk:', err);
    }
  }

  // 3. Hydrate rawTickets from ticket fields + cache (preserving Firestore orderBy usedAt desc order)
  return rawTickets.map((data) => {
    const regId = data.registrantId;
    let name = data.registrantName;
    let ch = data.church;
    let phone = data.phoneNumber || '';

    if (regId) {
      const cached = cacheMap.get(regId);
      if (cached) {
        if (cached.fullName) name = cached.fullName;
        if (cached.church) ch = cached.church;
        if (cached.phoneNumber) phone = cached.phoneNumber;
      }
    }

    return {
      id: data.id,
      registrantId: regId || data.id,
      registrantName: name || 'حاضر بدون اسم',
      church: ch || 'غير محدد',
      phoneNumber: phone,
      usedAt: data.usedAt,
      usedByUsherId: data.usedByUsherId || 'الماسح الإلكتروني',
    };
  });
}

export default function ScannedAttendeesPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<ScannedTicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [churchFilter, setChurchFilter] = useState('');

  // TTL Cache for registrant details by registrantId to prevent N+1 Firestore reads
  const registrantsCacheRef = useRef<Map<string, CachedRegistrantInfo>>(new Map());
  // Version counter to prevent out-of-order state updates during fast snapshot emissions
  const snapshotVersionRef = useRef<number>(0);

  // Automatic periodic garbage collector to sweep expired entries every 5 minutes and clear on unmount
  useEffect(() => {
    const sweeper = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of registrantsCacheRef.current.entries()) {
        if (now - entry.fetchedAt > CACHE_TTL_MS) {
          registrantsCacheRef.current.delete(key);
        }
      }
    }, CLEANUP_INTERVAL_MS);

    return () => {
      clearInterval(sweeper);
      registrantsCacheRef.current.clear();
    };
  }, []);

  // Real-time listener for scanned tickets
  useEffect(() => {
    if (!user) return;

    const qScanned = query(
      collection(db, 'tickets'),
      where('used', '==', true),
      orderBy('usedAt', 'desc'),
      limit(SCANNED_TICKETS_LIMIT)
    );

    const unsubscribeScanned = onSnapshot(
      qScanned,
      async (snapshot) => {
        // Track snapshot version to guard against race conditions
        const currentVersion = ++snapshotVersionRef.current;

        const rawTickets: RawTicketData[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<RawTicketData, 'id'>),
        }));

        // Resolve detailed registrant info using batched 'in' queries & TTL cache
        const resolvedItems = await resolveScannedTickets(
          rawTickets,
          registrantsCacheRef.current
        );

        // Discard out-of-order snapshot resolution if a newer snapshot was triggered in the meantime
        if (currentVersion !== snapshotVersionRef.current) {
          return;
        }

        // Firestore query already provides results ordered by usedAt desc; no manual sort needed
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

  // Export CSV helper with proper escaping and object URL revocation
  const exportCSV = () => {
    if (filteredTickets.length === 0) return;

    const rawHeaders = ['#', 'الاسم الكامل', 'الكنيسة', 'رقم الموبايل', 'وقت الدخول', 'معرّف التذكرة'];
    const headersLine = rawHeaders.map(escapeCsvField).join(',');

    const rowsLines = filteredTickets.map((t, idx) => {
      return [
        escapeCsvField(idx + 1),
        escapeCsvField(t.registrantName || ''),
        escapeCsvField(t.church || ''),
        escapeCsvField(t.phoneNumber || ''),
        escapeCsvField(formatTime(t.usedAt)),
        escapeCsvField(t.id),
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headersLine, ...rowsLines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `كشف_حضور_البوابة_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Revoke object URL after download trigger to avoid memory leaks
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
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

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        <KpiCard
          title="إجمالي الحضور الفعلي بالبوابة"
          value={tickets.length}
          unit="شخصاً"
          color="#fbba33"
        />
        <KpiCard
          title="عدد الكنائس الممثلة بالدخول"
          value={churchesList.length}
          unit="كنيسة"
          color="#34d399"
        />
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
