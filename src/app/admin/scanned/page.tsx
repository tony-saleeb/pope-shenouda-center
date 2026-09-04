'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth/context';
import Papa from 'papaparse';
import { matchesAdminSearch } from '@/lib/validation';
import { cairoDateKey, EVENT_TIME_ZONE, type CourseSession } from '@/lib/eventDays';
import { formatEgyptianPhone } from '@/lib/utils/formatters';

interface AttendanceStudent {
  id: string;
  registrantId: string;
  registrantName: string;
  church: string;
  phoneNumber: string;
  attended: Record<string, string | null>;
  attendedCount: number;
}

interface AttendancePayload {
  sessions?: CourseSession[];
  students?: AttendanceStudent[];
}

type RollFilter = 'all' | 'present' | 'absent' | 'risk';
type ViewMode = 'list' | 'grid';

const PLACEHOLDER_UNKNOWN_CHURCH = 'غير محدد';
const PLACEHOLDER_UNNAMED = 'دارس بدون اسم';
const POLL_MS = 20_000;

function cairoMonthKey(now: Date = new Date()): string {
  return cairoDateKey(now)?.slice(0, 7) ?? '';
}

function formatCheckInTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ar-EG', {
    timeZone: EVENT_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function PresentMark() {
  return (
    <span className="att-mark is-present" title="حضر">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}

function AbsentMark() {
  return (
    <span className="att-mark is-absent" title="غائب">
      <span style={{ fontSize: '0.7rem', fontWeight: 800 }}>غ</span>
    </span>
  );
}

function UpcomingMark() {
  return <span className="att-mark is-upcoming" title="لم تبدأ" />;
}

const AVATAR_TONES = [
  { bg: '#3a2410', fg: '#f3e6c8' },
  { bg: '#2c1a0c', fg: '#e4c57a' },
  { bg: '#24180e', fg: '#d4af6a' },
  { bg: '#3d2c14', fg: '#f8edd4' },
  { bg: '#2a2210', fg: '#c9b27a' },
] as const;

function avatarTone(name: string): (typeof AVATAR_TONES)[number] {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '؟';
  if (parts.length === 1) return parts[0].slice(0, 1);
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`;
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return PLACEHOLDER_UNNAMED;
  if (parts.length <= 2) return parts.join(' ');
  return `${parts[0]} ${parts[1]}`;
}

function missedLastTwo(student: AttendanceStudent, past: CourseSession[]): boolean {
  if (past.length < 2) return false;
  const last = past.slice(-2);
  return last.every((session) => !student.attended[session.id]);
}

function groupByChurch(students: AttendanceStudent[]): { church: string; people: AttendanceStudent[] }[] {
  const map = new Map<string, AttendanceStudent[]>();
  for (const student of students) {
    const church = student.church?.trim() || PLACEHOLDER_UNKNOWN_CHURCH;
    const bucket = map.get(church);
    if (bucket) bucket.push(student);
    else map.set(church, [student]);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'ar'))
    .map(([church, people]) => ({ church, people }));
}

interface SessionWeek {
  id: string;
  index: number;
  tue: CourseSession | null;
  sat: CourseSession | null;
}

function groupWeeks(sessions: CourseSession[]): SessionWeek[] {
  const weeks: SessionWeek[] = [];
  for (const session of sessions) {
    if (session.weekday === 2) {
      weeks.push({ id: session.id, index: weeks.length + 1, tue: session, sat: null });
      continue;
    }
    const last = weeks[weeks.length - 1];
    if (session.weekday === 6 && last && last.tue && !last.sat) {
      last.sat = session;
      continue;
    }
    weeks.push({
      id: session.id,
      index: weeks.length + 1,
      tue: session.weekday === 2 ? session : null,
      sat: session.weekday === 2 ? null : session,
    });
  }
  return weeks;
}

function SessionTile({
  session,
  todayKey,
  focusDay,
  present,
  total,
  onSelect,
}: {
  session: CourseSession | null;
  todayKey: string;
  focusDay: string | null;
  present: number;
  total: number;
  onSelect: (id: string) => void;
}) {
  if (!session) {
    return <div className="att-tile is-empty" aria-hidden="true" />;
  }

  const isToday = session.id === todayKey;
  const isActive = session.id === focusDay;
  const upcoming = session.id > todayKey;
  const ratio = total > 0 && !upcoming ? Math.round((present / total) * 100) : 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(session.id)}
      className={`att-tile${session.weekday === 6 ? ' is-sat' : ' is-tue'}${isActive ? ' is-active' : ''}${isToday ? ' is-today' : ''}${upcoming ? ' is-upcoming' : ''}`}
    >
      <span className="att-tile-kicker">
        <span>{session.weekdayAr}</span>
        {isToday && <span className="att-tile-badge">اليوم</span>}
      </span>
      <span className="att-tile-day">{session.dayAr || session.id.slice(8)}</span>
      <span className="att-tile-meta">
        <span>{upcoming ? 'لم تبدأ' : `${present.toLocaleString('ar-EG')} حضروا`}</span>
        {!upcoming && total > 0 && <span>{ratio.toLocaleString('ar-EG')}٪</span>}
      </span>
      <span className="att-tile-bar" aria-hidden="true">
        <span style={{ width: upcoming ? '0%' : `${ratio}%` }} />
      </span>
    </button>
  );
}

function formatFreshness(updatedAt: Date, now: Date): string {
  const sec = Math.max(0, Math.round((now.getTime() - updatedAt.getTime()) / 1000));
  if (sec < 12) return 'الآن';
  if (sec < 60) return `قبل ${sec.toLocaleString('ar-EG')} ثانية`;
  const min = Math.floor(sec / 60);
  if (min === 1) return 'قبل دقيقة';
  if (min < 60) return `قبل ${min.toLocaleString('ar-EG')} دقائق`;
  const clock = formatCheckInTime(updatedAt.toISOString());
  return clock ? `آخر تحديث ${clock}` : '';
}

function WhatsAppGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.5 3.5A11 11 0 0 0 2.1 17.7L1 23l5.4-1.1A11 11 0 1 0 20.5 3.5zm-8.5 17a9.1 9.1 0 0 1-4.6-1.3l-.33-.2-3.2.66.68-3.12-.22-.34A9.1 9.1 0 1 1 12 20.5zm5-6.8c-.27-.14-1.6-.79-1.85-.88-.25-.09-.43-.14-.61.14-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.14-1.14-.42-2.17-1.34-.8-.71-1.34-1.6-1.5-1.86-.16-.27-.02-.41.12-.55.12-.12.27-.32.41-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.14-.61-1.47-.84-2.01-.22-.53-.45-.46-.61-.46h-.52c-.18 0-.48.07-.73.34-.25.27-.96.94-.96 2.3 0 1.36.98 2.67 1.12 2.86.14.18 1.93 2.95 4.67 4.13.65.28 1.16.45 1.56.57.65.21 1.25.18 1.72.11.52-.08 1.6-.65 1.83-1.28.22-.63.22-1.17.16-1.28-.07-.11-.25-.18-.52-.32z" />
    </svg>
  );
}

function StudentRow({
  student,
  focusDay,
  upcoming,
  risk,
  justIn,
  onSelect,
}: {
  student: AttendanceStudent;
  focusDay: string | null;
  upcoming: boolean;
  risk: boolean;
  justIn: boolean;
  onSelect: (id: string) => void;
}) {
  const name = student.registrantName || PLACEHOLDER_UNNAMED;
  const tones = avatarTone(name);
  const present = Boolean(focusDay && student.attended[focusDay]);
  const checkIn = focusDay ? formatCheckInTime(student.attended[focusDay]) : null;
  const waHref = student.phoneNumber
    ? `https://wa.me/${formatEgyptianPhone(student.phoneNumber)}`
    : null;

  return (
    <div className={`att-row${present ? ' is-in' : ''}${risk ? ' is-risk' : ''}${justIn ? ' is-just' : ''}`}>
      <button type="button" className="att-row-main" onClick={() => onSelect(student.id)}>
        <span className="att-avatar" style={{ background: tones.bg, color: tones.fg }}>
          {initials(name)}
        </span>
        <span className="att-row-body">
          <strong>{name}</strong>
          <span>{student.church || PLACEHOLDER_UNKNOWN_CHURCH}</span>
        </span>
        <span className="att-row-meta">
          {upcoming ? (
            <span className="att-pill is-wait">بانتظار المسح</span>
          ) : present ? (
            <span className="att-pill is-in">{justIn ? 'وصل الآن' : checkIn ? `حضر ${checkIn}` : 'في القاعة'}</span>
          ) : (
            <span className="att-pill is-out">{risk ? 'غائب — متابعة' : 'لم يحضر'}</span>
          )}
        </span>
      </button>
      {waHref && !present && !upcoming && (
        <a
          className="att-row-quick"
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          title="واتساب"
          aria-label={`واتساب ${name}`}
        >
          <WhatsAppGlyph />
        </a>
      )}
    </div>
  );
}

export default function AttendanceSheetPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<CourseSession[]>([]);
  const [students, setStudents] = useState<AttendanceStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [churchFilter, setChurchFilter] = useState('');
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [focusDay, setFocusDay] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rollFilter, setRollFilter] = useState<RollFilter>('absent');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [justArrived, setJustArrived] = useState<Set<string>>(() => new Set());
  const stripRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const prevPresentRef = useRef<{ day: string | null; ids: Set<string> }>({ day: null, ids: new Set() });

  const todayKey = cairoDateKey(new Date()) ?? '';

  useEffect(() => {
    if (!user) return;

    const currentUser = user;
    let cancelled = false;

    async function loadAttendance() {
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch('/api/admin/scanned', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error('list_failed');
        }
        const payload = (await response.json()) as AttendancePayload;
        if (cancelled) return;
        const nextSessions = Array.isArray(payload.sessions) ? payload.sessions : [];
        const nextStudents = Array.isArray(payload.students) ? payload.students : [];
        setSessions(nextSessions);
        setStudents(nextStudents);
        setLoadError(false);
        setUpdatedAt(new Date());
        setMonthKey((current) => {
          if (current === 'all') return current;
          if (current && nextSessions.some((session) => session.monthKey === current)) {
            return current;
          }
          const nowMonth = cairoMonthKey();
          if (nextSessions.some((session) => session.monthKey === nowMonth)) return nowMonth;
          return nextSessions[0]?.monthKey ?? 'all';
        });
        setFocusDay((current) => {
          if (current && nextSessions.some((session) => session.id === current)) return current;
          if (nextSessions.some((session) => session.id === todayKey)) return todayKey;
          return nextSessions.find((session) => session.id >= todayKey)?.id ?? nextSessions[0]?.id ?? null;
        });
      } catch (error) {
        console.error('Error fetching attendance:', error);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadAttendance();
    const interval = setInterval(() => {
      void loadAttendance();
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user, todayKey]);

  const months = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const session of sessions) {
      if (!byKey.has(session.monthKey)) byKey.set(session.monthKey, session.monthLabelAr);
    }
    return [...byKey.entries()].map(([id, label]) => ({ id, label }));
  }, [sessions]);

  const visibleSessions = useMemo(() => {
    if (monthKey === 'all' || monthKey === null) return sessions;
    return sessions.filter((session) => session.monthKey === monthKey);
  }, [sessions, monthKey]);

  const churchesList = useMemo(() => {
    const set = new Set<string>();
    students.forEach((student) => {
      if (student.church && student.church !== PLACEHOLDER_UNKNOWN_CHURCH) {
        set.add(student.church);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [students]);

  const filteredStudents = useMemo(() => {
    return students
      .filter((student) => {
        if (churchFilter && student.church !== churchFilter) return false;
        return matchesAdminSearch(
          [student.registrantName, student.phoneNumber, student.church],
          searchTerm
        );
      })
      .sort((a, b) => a.registrantName.localeCompare(b.registrantName, 'ar'));
  }, [students, searchTerm, churchFilter]);

  const pastSessions = useMemo(
    () => sessions.filter((session) => session.id <= todayKey),
    [sessions, todayKey]
  );

  const weeks = useMemo(() => groupWeeks(visibleSessions), [visibleSessions]);

  const monthsForCalendar = useMemo(() => {
    if (monthKey !== 'all') {
      const current = months.find((month) => month.id === monthKey);
      return current ? [{ ...current, sessions: visibleSessions }] : [];
    }
    return months.map((month) => ({
      ...month,
      sessions: sessions.filter((session) => session.monthKey === month.id),
    }));
  }, [monthKey, months, visibleSessions, sessions]);

  const monthIndex = months.findIndex((month) => month.id === monthKey);

  const selectSession = (sessionId: string) => {
    setFocusDay(sessionId);
    const session = sessions.find((item) => item.id === sessionId);
    if (session && monthKey !== 'all') {
      setMonthKey(session.monthKey);
    }
  };

  const shiftMonth = (delta: number) => {
    if (monthKey === 'all') {
      const target = delta < 0 ? months[months.length - 1] : months[0];
      if (target) {
        setMonthKey(target.id);
        const inMonth = sessions.filter((session) => session.monthKey === target.id);
        const todayIn = inMonth.find((session) => session.id === todayKey);
        setFocusDay(todayIn?.id ?? inMonth[0]?.id ?? null);
      }
      return;
    }
    const next = months[monthIndex + delta];
    if (next) {
      setMonthKey(next.id);
      const inMonth = sessions.filter((session) => session.monthKey === next.id);
      const todayIn = inMonth.find((session) => session.id === todayKey);
      setFocusDay(todayIn?.id ?? inMonth[0]?.id ?? null);
    }
  };

  const presentByDay = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const session of sessions) counts[session.id] = 0;
    for (const student of filteredStudents) {
      for (const day of Object.keys(student.attended)) {
        if (student.attended[day]) counts[day] = (counts[day] ?? 0) + 1;
      }
    }
    return counts;
  }, [sessions, filteredStudents]);

  const focusSession = sessions.find((session) => session.id === focusDay);
  const focusUpcoming = Boolean(focusDay && focusDay > todayKey);
  const focusIsToday = focusDay === todayKey;

  const presentStudents = useMemo(() => {
    if (!focusDay || focusUpcoming) return [];
    return filteredStudents.filter((student) => student.attended[focusDay]);
  }, [filteredStudents, focusDay, focusUpcoming]);

  const absentStudents = useMemo(() => {
    if (!focusDay || focusUpcoming) return [];
    return filteredStudents.filter((student) => !student.attended[focusDay]);
  }, [filteredStudents, focusDay, focusUpcoming]);

  const waitingStudents = focusUpcoming ? filteredStudents : [];

  const atRiskIds = useMemo(
    () => new Set(filteredStudents.filter((student) => missedLastTwo(student, pastSessions)).map((student) => student.id)),
    [filteredStudents, pastSessions]
  );

  const atRiskStudents = useMemo(
    () => filteredStudents.filter((student) => atRiskIds.has(student.id)),
    [filteredStudents, atRiskIds]
  );

  const searching = searchTerm.trim().length > 0;

  const chooseRoll = (next: RollFilter) => {
    setSearchTerm('');
    setRollFilter(next);
  };

  const rosterStudents = useMemo(() => {
    if (focusUpcoming) return waitingStudents;
    if (searching) return filteredStudents;
    switch (rollFilter) {
      case 'present':
        return presentStudents;
      case 'absent':
        return absentStudents;
      case 'risk':
        return atRiskStudents;
      default:
        return filteredStudents;
    }
  }, [
    focusUpcoming,
    searching,
    rollFilter,
    waitingStudents,
    filteredStudents,
    presentStudents,
    absentStudents,
    atRiskStudents,
    focusDay,
  ]);

  const selectedStudent = filteredStudents.find((student) => student.id === selectedId)
    ?? students.find((student) => student.id === selectedId)
    ?? null;

  const presentOnFocus = presentStudents.length;
  const totalOnFocus = filteredStudents.length;
  const attendanceRate = totalOnFocus > 0 && !focusUpcoming
    ? Math.round((presentOnFocus / totalOnFocus) * 100)
    : 0;

  useEffect(() => {
    if (!selectedId) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [selectedId]);

  useEffect(() => {
    if (!focusDay || !stripRef.current) return;
    const chip = stripRef.current.querySelector<HTMLElement>(`[data-session="${focusDay}"]`);
    chip?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [focusDay]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 10_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        return;
      }
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!focusDay || focusUpcoming) {
      prevPresentRef.current = { day: focusDay, ids: new Set() };
      return;
    }
    const nowPresent = new Set(
      students.filter((student) => student.attended[focusDay]).map((student) => student.id)
    );
    const previous = prevPresentRef.current;
    const newcomers: string[] = [];
    if (previous.day === focusDay && previous.ids.size > 0) {
      for (const id of nowPresent) {
        if (!previous.ids.has(id)) newcomers.push(id);
      }
    }
    prevPresentRef.current = { day: focusDay, ids: nowPresent };
    if (newcomers.length === 0) return;
    setJustArrived((current) => new Set([...current, ...newcomers]));
    const timeout = window.setTimeout(() => {
      setJustArrived((current) => {
        const next = new Set(current);
        for (const id of newcomers) next.delete(id);
        return next;
      });
    }, 8000);
    return () => window.clearTimeout(timeout);
  }, [students, focusDay, focusUpcoming]);

  const exportSheet = () => {
    if (filteredStudents.length === 0) return;
    const csv = Papa.unparse(
      filteredStudents.map((student, idx) => {
        const row: Record<string, string | number> = {
          '#': idx + 1,
          الاسم: student.registrantName || PLACEHOLDER_UNNAMED,
          الكنيسة: student.church || PLACEHOLDER_UNKNOWN_CHURCH,
          'رقم الموبايل': student.phoneNumber ? `="${student.phoneNumber}"` : '',
          'عدد الحضور': student.attendedCount,
        };
        for (const session of visibleSessions) {
          const upcoming = session.id > todayKey;
          row[session.labelAr] = student.attended[session.id]
            ? 'حاضر'
            : upcoming
              ? '—'
              : 'غائب';
        }
        return row;
      })
    );

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const stamp = focusSession?.id ?? cairoDateKey(new Date()) ?? 'attendance';
    link.setAttribute('download', `كشف_الحضور_${stamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const jumpToToday = () => {
    if (!sessions.some((session) => session.id === todayKey)) return;
    const todaySession = sessions.find((session) => session.id === todayKey);
    setFocusDay(todayKey);
    if (todaySession && monthKey !== 'all') setMonthKey(todaySession.monthKey);
    setRollFilter('absent');
  };

  if (loading) {
    return (
      <div className="att-page">
        <div className="att-hero att-hero-skeleton">
          <div className="skeleton" style={{ height: '1rem', width: '7rem', marginBottom: '0.75rem' }} />
          <div className="skeleton" style={{ height: '2rem', width: '14rem', marginBottom: '1.25rem' }} />
          <div className="skeleton" style={{ height: '5.5rem', width: '100%', borderRadius: '1rem' }} />
        </div>
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.55)' }}>جاري تجهيز قاعة الحضور...</p>
      </div>
    );
  }

  const heroKicker = focusUpcoming
    ? 'جلسة قادمة'
    : focusIsToday
      ? 'قاعة اليوم'
      : 'جلسة سابقة';

  const clusters = groupByChurch(rosterStudents).map((cluster) => ({
    ...cluster,
    people: [...cluster.people].sort((a, b) => {
      const riskDelta = Number(atRiskIds.has(b.id)) - Number(atRiskIds.has(a.id));
      if (riskDelta !== 0) return riskDelta;
      const aPresent = Boolean(focusDay && a.attended[focusDay]);
      const bPresent = Boolean(focusDay && b.attended[focusDay]);
      if (aPresent !== bPresent) return aPresent ? 1 : -1;
      return a.registrantName.localeCompare(b.registrantName, 'ar');
    }),
  }));

  return (
    <div className="att-page">
      <div className="att-top">
        <div>
          <h1>تسجيل الحضور</h1>
          <p>قاعة الانتظامي — الثلاثاء والسبت. ابحث عن الاسم أثناء المسح، وتابع من لم يصل.</p>
        </div>
        <div className="att-top-actions">
          {todayKey && sessions.some((session) => session.id === todayKey) && !focusIsToday && (
            <button type="button" className="att-ghost-btn" onClick={jumpToToday}>
              العودة لليوم
            </button>
          )}
          <button
            type="button"
            className="att-ghost-btn is-export"
            onClick={exportSheet}
            disabled={filteredStudents.length === 0}
          >
            تصدير الكشف
          </button>
        </div>
      </div>

      {loadError && (
        <div className="att-banner is-error">حدث خطأ، برجاء المحاولة مرة أخرى</div>
      )}

      <section className={`att-hero${focusIsToday ? ' is-live' : ''}${focusUpcoming ? ' is-soon' : ''}`}>
        <div className="att-hero-copy">
          <span className="att-live">
            {focusIsToday && !focusUpcoming && <i />}
            {heroKicker}
          </span>
          <h2>{focusSession?.labelAr ?? 'لا توجد جلسات'}</h2>
          <p aria-live="polite">
            {focusUpcoming
              ? `${waitingStudents.length.toLocaleString('ar-EG')} دارس منتظم — الباب لم يُفتح بعد`
              : totalOnFocus === 0
                ? 'لا يوجد دارسون انتظاميون بعد'
                : presentOnFocus === 0
                  ? 'الباب مفتوح — لم يصل أحد بعد'
                  : presentOnFocus === totalOnFocus
                    ? 'الجميع في القاعة'
                    : `${presentOnFocus.toLocaleString('ar-EG')} في القاعة من أصل ${totalOnFocus.toLocaleString('ar-EG')}`}
          </p>
        </div>

        {!focusUpcoming && totalOnFocus > 0 && (
          <div className="att-hero-meter" aria-hidden="true">
            <b>{attendanceRate.toLocaleString('ar-EG')}٪</b>
            <span>حضور الجلسة</span>
            <div className="att-hero-bar">
              <span style={{ width: `${attendanceRate}%` }} />
            </div>
          </div>
        )}

        <div className="att-hero-stats">
          <button
            type="button"
            className={`att-stat is-in${!focusUpcoming && !searching && rollFilter === 'present' ? ' is-active' : ''}`}
            onClick={() => chooseRoll('present')}
            disabled={focusUpcoming}
          >
            <strong>{(focusUpcoming ? 0 : presentOnFocus).toLocaleString('ar-EG')}</strong>
            <span>في القاعة</span>
          </button>
          <button
            type="button"
            className={`att-stat is-out${!focusUpcoming && !searching && rollFilter === 'absent' ? ' is-active' : ''}`}
            onClick={() => chooseRoll('absent')}
            disabled={focusUpcoming}
          >
            <strong>{(focusUpcoming ? waitingStudents.length : absentStudents.length).toLocaleString('ar-EG')}</strong>
            <span>{focusUpcoming ? 'بانتظار المسح' : 'لم يحضروا'}</span>
          </button>
          <button
            type="button"
            className={`att-stat is-risk${!focusUpcoming && !searching && rollFilter === 'risk' ? ' is-active' : ''}`}
            onClick={() => chooseRoll('risk')}
            disabled={focusUpcoming || atRiskStudents.length === 0}
          >
            <strong>{atRiskStudents.length.toLocaleString('ar-EG')}</strong>
            <span>يحتاجون متابعة</span>
          </button>
        </div>

        {updatedAt && (
          <p className="att-hero-fresh">
            يتحدّث تلقائياً كل ٢٠ ثانية — {formatFreshness(updatedAt, now)}
          </p>
        )}
      </section>

      {months.length > 1 && (
        <div className="att-months" role="tablist" aria-label="شهر الدراسة">
          {months.map((month) => (
            <button
              key={month.id}
              type="button"
              role="tab"
              aria-selected={monthKey === month.id}
              className={`att-month-pill${monthKey === month.id ? ' is-active' : ''}${month.id === todayKey.slice(0, 7) ? ' is-now' : ''}`}
              onClick={() => {
                setMonthKey(month.id);
                const inMonth = sessions.filter((session) => session.monthKey === month.id);
                setFocusDay(
                  inMonth.find((session) => session.id === todayKey)?.id ?? inMonth[0]?.id ?? null
                );
              }}
            >
              {month.label}
            </button>
          ))}
          <button
            type="button"
            role="tab"
            aria-selected={monthKey === 'all'}
            className={`att-month-pill${monthKey === 'all' ? ' is-active' : ''}`}
            onClick={() => setMonthKey('all')}
          >
            كل الشهور
          </button>
        </div>
      )}

      {visibleSessions.length > 0 && (
        <div className="att-strip-wrap">
          <div className="att-strip" ref={stripRef}>
            {visibleSessions.map((session) => {
              const isToday = session.id === todayKey;
              const isActive = session.id === focusDay;
              const upcoming = session.id > todayKey;
              const present = presentByDay[session.id] ?? 0;
              return (
                <button
                  key={session.id}
                  type="button"
                  data-session={session.id}
                  className={`att-chip${isActive ? ' is-active' : ''}${isToday ? ' is-today' : ''}${upcoming ? ' is-soon' : ''}`}
                  onClick={() => selectSession(session.id)}
                >
                  <em>{isToday ? 'اليوم' : session.weekdayAr}</em>
                  <b>{session.dayAr || session.shortLabelAr}</b>
                  <span>{upcoming ? 'لاحقاً' : `${present.toLocaleString('ar-EG')} حضروا`}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {months.length > 0 && (
        <details className="att-schedule">
          <summary>عرض جدول الدراسة الكامل</summary>
          <div className="glass-card att-cal">
            <div className="att-cal-nav">
              <button
                type="button"
                className="att-cal-shift"
                onClick={() => shiftMonth(-1)}
                disabled={monthKey !== 'all' && monthIndex <= 0}
                aria-label="الشهر السابق"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
              <div>
                <h2>{monthKey === 'all' ? 'كل شهور الدراسة' : (months[monthIndex]?.label ?? '')}</h2>
                <p>كل أسبوع: ثلاثاء ثم سبت</p>
                <button
                  type="button"
                  className={`att-cal-year${monthKey === 'all' ? ' is-active' : ''}`}
                  onClick={() => {
                    if (monthKey === 'all') {
                      const nowMonth = cairoMonthKey();
                      const nextMonth = months.some((month) => month.id === nowMonth)
                        ? nowMonth
                        : months[0]?.id ?? 'all';
                      setMonthKey(nextMonth);
                      const inMonth = sessions.filter((session) => session.monthKey === nextMonth);
                      setFocusDay(
                        inMonth.find((session) => session.id === todayKey)?.id ?? inMonth[0]?.id ?? null
                      );
                      return;
                    }
                    setMonthKey('all');
                  }}
                >
                  {monthKey === 'all' ? 'عرض شهر واحد' : 'عرض السنة كاملة'}
                </button>
              </div>
              <button
                type="button"
                className="att-cal-shift"
                onClick={() => shiftMonth(1)}
                disabled={monthKey !== 'all' && monthIndex >= months.length - 1}
                aria-label="الشهر التالي"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            </div>

            {monthsForCalendar.map((month) => {
              const monthWeeks = monthKey === 'all' ? groupWeeks(month.sessions) : weeks;
              return (
                <div key={month.id} className={monthKey === 'all' ? 'att-month-block' : undefined}>
                  {monthKey === 'all' && <h3>{month.label}</h3>}
                  <div className="att-weeks">
                    {monthWeeks.map((week) => (
                      <div key={week.id} className="att-week">
                        <div className="att-week-label">
                          <span>الأسبوع</span>
                          <span>{week.index.toLocaleString('ar-EG')}</span>
                        </div>
                        <div className="att-week-days">
                          <SessionTile
                            session={week.tue}
                            todayKey={todayKey}
                            focusDay={focusDay}
                            present={week.tue ? presentByDay[week.tue.id] ?? 0 : 0}
                            total={filteredStudents.length}
                            onSelect={selectSession}
                          />
                          <div className="att-thread" aria-hidden="true" />
                          <SessionTile
                            session={week.sat}
                            todayKey={todayKey}
                            focusDay={focusDay}
                            present={week.sat ? presentByDay[week.sat.id] ?? 0 : 0}
                            total={filteredStudents.length}
                            onSelect={selectSession}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}

      <div className="att-dock">
        <div className="att-filters att-toolbar">
          <input
            ref={searchRef}
            type="search"
            className="form-input"
            placeholder="من في القاعة؟ ابحث بالاسم أو رقم الموبايل"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            enterKeyHint="search"
            autoComplete="off"
            aria-label="بحث في كشف الحضور"
          />
          {churchesList.length > 0 && (
            <select
              className="form-input"
              value={churchFilter}
              onChange={(e) => setChurchFilter(e.target.value)}
              aria-label="تصفية الكنيسة"
            >
              <option value="">جميع الكنائس</option>
              {churchesList.map((church) => (
                <option key={church} value={church}>
                  {church}
                </option>
              ))}
            </select>
          )}
          <div className="att-view-toggle" role="group" aria-label="طريقة العرض">
            <button
              type="button"
              className={viewMode === 'list' ? 'is-active' : ''}
              onClick={() => setViewMode('list')}
            >
              قائمة
            </button>
            <button
              type="button"
              className={viewMode === 'grid' ? 'is-active' : ''}
              onClick={() => setViewMode('grid')}
            >
              شبكة
            </button>
          </div>
        </div>

        {!focusUpcoming && !searching && filteredStudents.length > 0 && (
          <div className="att-seg" role="tablist" aria-label="تصفية الحضور">
            {([
              ['absent', 'لم يحضروا', absentStudents.length],
              ['present', 'في القاعة', presentOnFocus],
              ['risk', 'متابعة', atRiskStudents.length],
              ['all', 'الكل', filteredStudents.length],
            ] as const).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={rollFilter === id}
                className={rollFilter === id ? 'is-active' : ''}
                onClick={() => setRollFilter(id)}
              >
                {label}
                <b>{count.toLocaleString('ar-EG')}</b>
              </button>
            ))}
          </div>
        )}

        {searching && (
          <div className="att-search-hint">
            <span>{filteredStudents.length.toLocaleString('ar-EG')} نتيجة بحث في هذه الجلسة</span>
            <button type="button" className="att-clear-search" onClick={() => setSearchTerm('')}>
              مسح البحث
            </button>
          </div>
        )}
      </div>

      {filteredStudents.length === 0 ? (
        <div className="glass-card att-empty">
          <p>
            {students.length === 0 ? 'لا يوجد دارسون انتظاميون بعد' : 'لا توجد نتائج مطابقة للبحث'}
          </p>
          <span>
            {students.length === 0
              ? 'بعد قبول مسار الانتظامي سيظهر الحضور هنا كقاعة: من وصل ومن لم يصل'
              : 'جرّب اسمًا آخر أو أزل تصفية الكنيسة'}
          </span>
        </div>
      ) : rosterStudents.length === 0 ? (
        <div className={`glass-card att-empty${rollFilter === 'absent' || rollFilter === 'risk' ? ' is-good' : ''}`}>
          <p>
            {rollFilter === 'absent'
              ? 'الجميع في القاعة'
              : rollFilter === 'present'
                ? 'لم يصل أحد بعد'
                : rollFilter === 'risk'
                  ? 'لا أحد يحتاج متابعة الآن'
                  : 'لا أحد في هذه المجموعة'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="att-mosaic att-mosaic-board">
          {rosterStudents.map((student) => {
            const name = student.registrantName || PLACEHOLDER_UNNAMED;
            const tones = avatarTone(name);
            const present = Boolean(focusDay && student.attended[focusDay]);
            const risk = atRiskIds.has(student.id);
            const checkIn = focusDay ? formatCheckInTime(student.attended[focusDay]) : null;
            const justIn = justArrived.has(student.id);
            return (
              <button
                key={student.id}
                type="button"
                className={`att-face${present ? ' is-in' : ''}${risk && !present ? ' is-risk' : ''}${justIn ? ' is-just' : ''}`}
                onClick={() => setSelectedId(student.id)}
                title={name}
              >
                <span className="att-avatar" style={{ background: tones.bg, color: tones.fg }}>
                  {initials(name)}
                </span>
                <span className="att-face-name">{shortName(name)}</span>
                <span className="att-face-meta">
                  {focusUpcoming ? 'لاحقاً' : present ? (justIn ? 'وصل الآن' : checkIn ?? 'حضر') : risk ? 'متابعة' : 'غائب'}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="att-list">
          {clusters.map((cluster) => (
            <section key={cluster.church} className="att-cluster-list">
              {clusters.length > 1 && (
                <h3>
                  <span>{cluster.church}</span>
                  <span>{cluster.people.length.toLocaleString('ar-EG')}</span>
                </h3>
              )}
              {cluster.people.map((student) => (
                <StudentRow
                  key={student.id}
                  student={student}
                  focusDay={focusDay}
                  upcoming={focusUpcoming}
                  risk={atRiskIds.has(student.id)}
                  justIn={justArrived.has(student.id)}
                  onSelect={setSelectedId}
                />
              ))}
            </section>
          ))}
        </div>
      )}

      {selectedStudent && (
        <div className="att-drawer-overlay" onClick={() => setSelectedId(null)} role="presentation">
          <div
            className="att-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="att-drawer-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="att-drawer-head">
              <div>
                <h3 id="att-drawer-title">{selectedStudent.registrantName || PLACEHOLDER_UNNAMED}</h3>
                <p>{selectedStudent.church || PLACEHOLDER_UNKNOWN_CHURCH}</p>
                {selectedStudent.phoneNumber ? (
                  <p className="att-person-phone" dir="ltr">{selectedStudent.phoneNumber}</p>
                ) : null}
              </div>
              <button type="button" className="att-cal-shift" onClick={() => setSelectedId(null)} aria-label="إغلاق">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </header>

            {selectedStudent.phoneNumber && (
              <div className="att-drawer-actions">
                <a className="att-contact is-call" href={`tel:${selectedStudent.phoneNumber}`}>
                  اتصال
                </a>
                <a
                  className="att-contact is-wa"
                  href={`https://wa.me/${formatEgyptianPhone(selectedStudent.phoneNumber)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  واتساب
                </a>
              </div>
            )}

            <p className="att-drawer-score">
              حضور {pastSessions.filter((session) => selectedStudent.attended[session.id]).length.toLocaleString('ar-EG')}
              {' / '}
              {pastSessions.length.toLocaleString('ar-EG')} جلسة
            </p>
            {missedLastTwo(selectedStudent, pastSessions) && (
              <p className="att-risk att-risk-inline">غاب عن آخر جلستين — يُفضَّل التواصل</p>
            )}
            <div className="att-spark" aria-hidden="true">
              {pastSessions.map((session) => (
                <span
                  key={session.id}
                  className={`att-spark-dot${selectedStudent.attended[session.id] ? ' is-on' : ''}`}
                  title={session.labelAr}
                />
              ))}
            </div>
            <div className="att-person-weeks">
              {groupWeeks(sessions).map((week) => (
                <div key={week.id} className="att-person-week">
                  {[week.tue, week.sat].map((session) => {
                    if (!session) return <div key={`${week.id}-empty`} className="att-person-slot is-empty" />;
                    const present = Boolean(selectedStudent.attended[session.id]);
                    const upcoming = session.id > todayKey;
                    const time = formatCheckInTime(selectedStudent.attended[session.id]);
                    return (
                      <button
                        type="button"
                        key={session.id}
                        className={`att-person-slot${session.id === focusDay ? ' is-focus' : ''}${session.id === todayKey ? ' is-today' : ''}`}
                        onClick={() => selectSession(session.id)}
                      >
                        <span className="att-person-slot-label">
                          {session.weekdayAr}
                          <b>{session.dayAr || session.shortLabelAr}</b>
                          {time && <em>{time}</em>}
                        </span>
                        {present ? <PresentMark /> : upcoming ? <UpcomingMark /> : <AbsentMark />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
