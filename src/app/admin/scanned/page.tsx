'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth/context';
import Papa from 'papaparse';
import { matchesAdminSearch } from '@/lib/validation';
import { cairoDateKey, type CourseSession } from '@/lib/eventDays';

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

const PLACEHOLDER_UNKNOWN_CHURCH = 'غير محدد';
const PLACEHOLDER_UNNAMED = 'دارس بدون اسم';
const POLL_MS = 20_000;

function cairoMonthKey(now: Date = new Date()): string {
  return cairoDateKey(now)?.slice(0, 7) ?? '';
}

function PresentMark() {
  return (
    <span className="att-mark is-present" title="حضر">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
        <line x1="6" y1="6" x2="18" y2="18" />
        <line x1="18" y1="6" x2="6" y2="18" />
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

function Congregation({
  title,
  count,
  tone,
  students,
  atRiskIds,
  onSelect,
}: {
  title: string;
  count: number;
  tone: 'present' | 'absent' | 'wait';
  students: AttendanceStudent[];
  atRiskIds: Set<string>;
  onSelect: (id: string) => void;
}) {
  const clusters = groupByChurch(students).map((cluster) => ({
    ...cluster,
    people: [...cluster.people].sort((a, b) => {
      const riskDelta = Number(atRiskIds.has(b.id)) - Number(atRiskIds.has(a.id));
      if (riskDelta !== 0) return riskDelta;
      return a.registrantName.localeCompare(b.registrantName, 'ar');
    }),
  }));
  const showChurches = clusters.length > 1;
  const dense = students.length > 28;

  return (
    <section className={`att-congregation is-${tone}`}>
      <header>
        <h3>{title}</h3>
        <b>{count.toLocaleString('ar-EG')}</b>
      </header>
      {students.length === 0 ? (
        <p className="att-congregation-empty">لا أحد في هذه المجموعة</p>
      ) : (
        clusters.map((cluster) => (
          <div key={cluster.church} className="att-cluster">
            {showChurches && (
              <h4>
                <span>{cluster.church}</span>
                <span>{cluster.people.length.toLocaleString('ar-EG')}</span>
              </h4>
            )}
            <div className={`att-mosaic${dense ? ' is-dense' : ''}`}>
              {cluster.people.map((student) => {
                const name = student.registrantName || PLACEHOLDER_UNNAMED;
                const toneColors = avatarTone(name);
                const risk = atRiskIds.has(student.id);
                return (
                  <button
                    key={student.id}
                    type="button"
                    className={`att-face${risk ? ' is-risk' : ''}`}
                    onClick={() => onSelect(student.id)}
                    title={name}
                  >
                    <span className="att-avatar" style={{ background: toneColors.bg, color: toneColors.fg }}>
                      {initials(name)}
                    </span>
                    <span className="att-face-name">{shortName(name)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}
    </section>
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

  const presentOnFocus = useMemo(() => {
    if (!focusDay) return 0;
    return filteredStudents.filter((student) => student.attended[focusDay]).length;
  }, [filteredStudents, focusDay]);

  const attendanceRate = useMemo(() => {
    if (filteredStudents.length === 0 || pastSessions.length === 0) return 0;
    const marks = filteredStudents.reduce((sum, student) => {
      return sum + pastSessions.filter((session) => student.attended[session.id]).length;
    }, 0);
    return Math.round((marks / (filteredStudents.length * pastSessions.length)) * 100);
  }, [filteredStudents, pastSessions]);

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

  const shiftMonth = (delta: number) => {
    if (monthKey === 'all') {
      const target = delta < 0 ? months[months.length - 1] : months[0];
      if (target) setMonthKey(target.id);
      return;
    }
    const next = months[monthIndex + delta];
    if (next) setMonthKey(next.id);
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

  const selectedStudent = filteredStudents.find((student) => student.id === selectedId)
    ?? students.find((student) => student.id === selectedId)
    ?? null;

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
    link.setAttribute('download', 'كشف_الحضور.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <div className="spinner spinner-lg spinner-gold" style={{ margin: '0 auto 1rem' }} />
        <p style={{ color: 'rgba(255,255,255,0.6)' }}>جاري تحميل كشف الحضور...</p>
      </div>
    );
  }

  return (
    <div className="att-page">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#ffffff', margin: 0, marginBottom: '0.25rem' }}>
            تسجيل الحضور
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'rgba(247, 240, 228, 0.6)', margin: 0 }}>
            كشف حضور الدارسين — جلسات الدراسة كل ثلاثاء وسبت
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={exportSheet}
          disabled={filteredStudents.length === 0}
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
            opacity: filteredStudents.length === 0 ? 0.45 : 1,
            cursor: filteredStudents.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          تصدير الكشف
        </button>
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

      <div className="att-kpis">
        <div className="glass-card att-kpi is-students">
          <span>الدارسون</span>
          <strong>{filteredStudents.length.toLocaleString('ar-EG')}</strong>
        </div>
        <div className="glass-card att-kpi is-present">
          <span>حضور الجلسة</span>
          <strong>{presentOnFocus.toLocaleString('ar-EG')}</strong>
        </div>
        <div className="glass-card att-kpi is-rate">
          <span>نسبة الحضور</span>
          <strong>{attendanceRate.toLocaleString('ar-EG')}٪</strong>
        </div>
      </div>

      {months.length > 0 && (
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
                    setMonthKey(
                      months.some((month) => month.id === nowMonth)
                        ? nowMonth
                        : months[0]?.id ?? 'all'
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
                          onSelect={setFocusDay}
                        />
                        <div className="att-thread" aria-hidden="true" />
                        <SessionTile
                          session={week.sat}
                          todayKey={todayKey}
                          focusDay={focusDay}
                          present={week.sat ? presentByDay[week.sat.id] ?? 0 : 0}
                          total={filteredStudents.length}
                          onSelect={setFocusDay}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="glass-card att-filters">
        <input
          type="text"
          className="form-input"
          placeholder="بحث باسم الدارس أو رقم الموبايل..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {churchesList.length > 0 && (
          <select
            className="form-input"
            value={churchFilter}
            onChange={(e) => setChurchFilter(e.target.value)}
          >
            <option value="">جميع الكنائس</option>
            {churchesList.map((church) => (
              <option key={church} value={church}>
                {church}
              </option>
            ))}
          </select>
        )}
      </div>

      {filteredStudents.length === 0 ? (
        <div className="glass-card" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
          <p style={{ fontSize: '1rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
            {students.length === 0 ? 'لا يوجد دارسون مقبولون بعد' : 'لا توجد نتائج مطابقة للبحث'}
          </p>
          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.25rem' }}>
            {students.length === 0
              ? 'بعد قبول التسجيلات سيظهر الحضور هنا كقاعة: من حضر ومن غاب في الجلسة المختارة'
              : 'جرّب اسمًا آخر أو أزل التصفية'}
          </p>
        </div>
      ) : (
        <div className="att-roll">
          {focusSession && (
            <div className="att-stage">
              <div>
                <span className="att-stage-kicker">{focusUpcoming ? 'جلسة قادمة' : 'قاعة الجلسة'}</span>
                <h2>{focusSession.labelAr}</h2>
              </div>
              <p>
                {focusUpcoming
                  ? `${waitingStudents.length.toLocaleString('ar-EG')} في انتظار المسح`
                  : `${presentStudents.length.toLocaleString('ar-EG')} في القاعة · ${absentStudents.length.toLocaleString('ar-EG')} لم يحضروا`}
              </p>
            </div>
          )}

          {atRiskStudents.length > 0 && !focusUpcoming && (
            <p className="att-risk">
              {atRiskStudents.length.toLocaleString('ar-EG')} غابوا عن آخر جلستين — اضغط الاسم لمعرفة التفاصيل
            </p>
          )}

          {focusUpcoming ? (
            <Congregation
              title="في انتظار المسح"
              count={waitingStudents.length}
              tone="wait"
              students={waitingStudents}
              atRiskIds={atRiskIds}
              onSelect={setSelectedId}
            />
          ) : (
            <>
              <Congregation
                title="في القاعة"
                count={presentStudents.length}
                tone="present"
                students={presentStudents}
                atRiskIds={new Set()}
                onSelect={setSelectedId}
              />
              <Congregation
                title="لم يحضروا"
                count={absentStudents.length}
                tone="absent"
                students={absentStudents}
                atRiskIds={atRiskIds}
                onSelect={setSelectedId}
              />
            </>
          )}
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
            <p className="att-drawer-score">
              حضور {pastSessions.filter((session) => selectedStudent.attended[session.id]).length.toLocaleString('ar-EG')}
              {' / '}
              {pastSessions.length.toLocaleString('ar-EG')} جلسة
            </p>
            {missedLastTwo(selectedStudent, pastSessions) && (
              <p className="att-risk att-risk-inline">غاب عن آخر جلستين</p>
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
                    return (
                      <div
                        key={session.id}
                        className={`att-person-slot${session.id === focusDay ? ' is-focus' : ''}${session.id === todayKey ? ' is-today' : ''}`}
                      >
                        <span className="att-person-slot-label">
                          {session.weekdayAr}
                          <b>{session.dayAr || session.shortLabelAr}</b>
                        </span>
                        {present ? <PresentMark /> : upcoming ? <UpcomingMark /> : <AbsentMark />}
                      </div>
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
