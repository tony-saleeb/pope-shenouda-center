'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth/context';
import Papa from 'papaparse';
import { matchesAdminSearch } from '@/lib/validation';
import {
  EVENT_DAYS,
  EVENT_DAY_OTHER,
  defaultEventDayId,
  eventDayIdForTimestamp,
  EVENT_TIME_ZONE,
  type GateDayId,
} from '@/lib/eventDays';

interface ScannedTicketItem {
  id: string;
  registrantId: string;
  registrantName: string;
  church: string;
  phoneNumber: string;
  usedAt: string | null;
  usedByUsherId: string;
}

const PLACEHOLDER_UNKNOWN_CHURCH = 'غير محدد';
const PLACEHOLDER_UNNAMED_ATTENDEE = 'حاضر بدون اسم';
const PLACEHOLDER_UNKNOWN_TIME = 'غير محدد';
const POLL_MS = 20_000;

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

function formatEntryTime(iso: string | null): string {
  if (!iso) return PLACEHOLDER_UNKNOWN_TIME;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return PLACEHOLDER_UNKNOWN_TIME;
  return new Intl.DateTimeFormat('ar-EG', {
    timeZone: EVENT_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

function dayLabel(dayId: GateDayId): string {
  if (dayId === 'all') return 'كل الأيام';
  if (dayId === EVENT_DAY_OTHER) return 'أيام أخرى';
  return EVENT_DAYS.find((day) => day.id === dayId)?.labelAr ?? dayId;
}

function exportFileStub(dayId: GateDayId): string {
  if (dayId === 'all') return 'كل_الأيام';
  if (dayId === EVENT_DAY_OTHER) return 'أيام_أخرى';
  return dayId;
}

export default function ScannedAttendeesPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<ScannedTicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [churchFilter, setChurchFilter] = useState('');
  const [activeDay, setActiveDay] = useState<GateDayId>(defaultEventDayId);

  useEffect(() => {
    if (!user) return;

    const currentUser = user;
    let cancelled = false;

    async function loadScanned() {
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch('/api/admin/scanned', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error('list_failed');
        }
        const payload = (await response.json()) as { items?: ScannedTicketItem[] };
        if (cancelled) return;
        setTickets(Array.isArray(payload.items) ? payload.items : []);
        setLoadError(false);
      } catch (error) {
        console.error('Error fetching scanned tickets:', error);
        if (!cancelled) {
          setLoadError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadScanned();
    const interval = setInterval(() => {
      void loadScanned();
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user]);

  const countsByDay = useMemo(() => {
    const counts: Record<string, number> = { all: tickets.length };
    for (const day of EVENT_DAYS) counts[day.id] = 0;
    counts[EVENT_DAY_OTHER] = 0;
    for (const ticket of tickets) {
      const dayId = eventDayIdForTimestamp(ticket.usedAt);
      counts[dayId] = (counts[dayId] ?? 0) + 1;
    }
    return counts;
  }, [tickets]);

  const showOtherTab = (countsByDay[EVENT_DAY_OTHER] ?? 0) > 0;

  const dayTickets = useMemo(() => {
    if (activeDay === 'all') return tickets;
    return tickets.filter((ticket) => eventDayIdForTimestamp(ticket.usedAt) === activeDay);
  }, [tickets, activeDay]);

  const churchesList = useMemo(() => {
    const set = new Set<string>();
    dayTickets.forEach((ticket) => {
      if (ticket.church && ticket.church !== PLACEHOLDER_UNKNOWN_CHURCH) {
        set.add(ticket.church);
      }
    });
    return Array.from(set).sort();
  }, [dayTickets]);

  const filteredTickets = useMemo(() => {
    return dayTickets.filter((ticket) => {
      if (churchFilter && ticket.church !== churchFilter) return false;
      return matchesAdminSearch(
        [ticket.registrantName, ticket.phoneNumber, ticket.church],
        searchTerm
      );
    });
  }, [dayTickets, searchTerm, churchFilter]);

  const exportExcel = (dayId: GateDayId) => {
    const rows =
      dayId === 'all'
        ? tickets
        : tickets.filter((ticket) => eventDayIdForTimestamp(ticket.usedAt) === dayId);
    if (rows.length === 0) return;

    const csv = Papa.unparse(
      rows.map((ticket, idx) => ({
        '#': idx + 1,
        'الاسم الكامل': ticket.registrantName || PLACEHOLDER_UNNAMED_ATTENDEE,
        الكنيسة: ticket.church || PLACEHOLDER_UNKNOWN_CHURCH,
        'رقم الموبايل': ticket.phoneNumber ? `="${ticket.phoneNumber}"` : '',
        'وقت الدخول': formatEntryTime(ticket.usedAt),
        اليوم: dayLabel(eventDayIdForTimestamp(ticket.usedAt)),
      }))
    );

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `حضور_البوابة_${exportFileStub(dayId)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <div className="spinner spinner-lg spinner-gold" style={{ margin: '0 auto 1rem' }} />
        <p style={{ color: 'rgba(255,255,255,0.6)' }}>جاري تحميل تفاصيل المسجلين في البوابة...</p>
      </div>
    );
  }

  const dayTabs: Array<{ id: GateDayId; label: string }> = [
    { id: 'all', label: 'كل الأيام' },
    ...EVENT_DAYS.map((day) => ({ id: day.id as GateDayId, label: day.shortLabelAr })),
    ...(showOtherTab ? [{ id: EVENT_DAY_OTHER as GateDayId, label: 'أيام أخرى' }] : []),
  ];

  return (
    <div className="space-y-6">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#ffffff', margin: 0, marginBottom: '0.25rem' }}>
            المسجلون في البوابة
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'rgba(247, 240, 228, 0.6)', margin: 0 }}>
            حضور الدورة حسب يوم الدخول — ٢٧ و٢٨ و٢٩ أغسطس
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          padding: '0.35rem',
          background: 'rgba(12, 7, 3, 0.45)',
          border: '1px solid rgba(242, 158, 19, 0.18)',
          borderRadius: '0.9rem',
        }}
      >
        {dayTabs.map((tab) => {
          const active = activeDay === tab.id;
          const count = countsByDay[tab.id] ?? 0;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveDay(tab.id);
                setChurchFilter('');
              }}
              style={{
                flex: '1 1 auto',
                minWidth: '7.5rem',
                padding: '0.7rem 0.9rem',
                borderRadius: '0.7rem',
                border: active ? '1px solid rgba(242, 158, 19, 0.55)' : '1px solid transparent',
                background: active ? 'rgba(242, 158, 19, 0.2)' : 'transparent',
                color: active ? '#fbba33' : 'rgba(247, 240, 228, 0.7)',
                fontWeight: 800,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              {tab.label}
              <span style={{ marginRight: '0.4rem', opacity: 0.85 }}>
                ({count.toLocaleString('ar-EG')})
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
        {EVENT_DAYS.map((day) => (
          <button
            key={day.id}
            type="button"
            onClick={() => exportExcel(day.id)}
            disabled={(countsByDay[day.id] ?? 0) === 0}
            className="btn btn-ghost"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#34d399',
              fontSize: '0.8125rem',
              fontWeight: 700,
              padding: '0.55rem 0.9rem',
              borderRadius: '0.75rem',
              opacity: (countsByDay[day.id] ?? 0) === 0 ? 0.45 : 1,
              cursor: (countsByDay[day.id] ?? 0) === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            تصدير إكسل — {day.shortLabelAr}
          </button>
        ))}
      </div>

      {loadError && (
        <div
          style={{
            padding: '0.85rem 1rem',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '0.75rem',
            color: '#fca5a5',
            fontSize: '0.875rem',
          }}
        >
          حدث خطأ، برجاء المحاولة مرة أخرى
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        <KpiCard
          title={`حضور ${dayLabel(activeDay)}`}
          value={filteredTickets.length}
          unit="شخصاً"
          color="#fbba33"
        />
        <KpiCard
          title="عدد الكنائس في هذا اليوم"
          value={churchesList.length}
          unit="كنيسة"
          color="#34d399"
        />
      </div>

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
              {churchesList.map((church) => (
                <option key={church} value={church}>
                  {church}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {filteredTickets.length === 0 ? (
        <div className="glass-card" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
          <p style={{ fontSize: '1rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
            {tickets.length === 0
              ? 'لم يتم تسجيل أي حضور بالبوابة حتى الآن'
              : 'لا يوجد حضور في هذا اليوم'}
          </p>
          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.25rem' }}>
            {tickets.length === 0
              ? 'عند مسح تذكرة الحاضرين عند مدخل القاعة ستظهر أسماؤهم وبياناتهم الكاملة هنا'
              : 'جرّب يوماً آخر أو أزل كلمات البحث'}
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
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((ticket, idx) => (
                  <tr
                    key={ticket.id}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    }}
                  >
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)' }}>
                      {(idx + 1).toLocaleString('ar-EG')}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontWeight: 700, color: '#ffffff' }}>
                      {ticket.registrantName || PLACEHOLDER_UNNAMED_ATTENDEE}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'rgba(255,255,255,0.8)' }}>
                      {ticket.church || PLACEHOLDER_UNKNOWN_CHURCH}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }} dir="ltr">
                      {ticket.phoneNumber || '—'}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.875rem', color: '#34d399', fontWeight: 600 }}>
                      {formatEntryTime(ticket.usedAt)}
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
