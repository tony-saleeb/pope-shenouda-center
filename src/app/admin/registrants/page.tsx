'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth/context';
import type { RegistrantStatus } from '@/lib/types';
import { ImageLightboxModal } from '@/components/ui/ImageLightboxModal';
import { getWhatsAppRegistrantUrl } from '@/lib/services/whatsappService';
import { matchesAdminSearch } from '@/lib/validation';
import { formatTrackTitle, getTrack } from '@/lib/registrationTracks';
import { forgetAdminStoredImage, loadAdminStoredImage } from '@/lib/adminStoredImage';
import Papa from 'papaparse';

interface RegistrantItem {
  id: string;
  fullName: string;
  phoneNumber: string;
  whatsappNumber: string;
  church: string;
  eparchy: string;
  nationalId: string;
  email: string;
  confessionFather: string;
  confessionFatherChurch: string;
  currentService: string;
  status: RegistrantStatus;
  track: string;
  feeAmount: number | null;
  feeCurrency: string;
  createdAt: string | null;
}

const STATUS_LABELS: Record<RegistrantStatus, { label: string; className: string; tone: 'ok' | 'pending' | 'review' | 'no' }> = {
  pending_verification: { label: 'قيد التحقق', className: 'badge-pending', tone: 'pending' },
  auto_approved: { label: 'موافقة تلقائية', className: 'badge-approved', tone: 'ok' },
  manual_review: { label: 'تحتاج مراجعة', className: 'badge-review', tone: 'review' },
  approved: { label: 'موافق عليه', className: 'badge-approved', tone: 'ok' },
  rejected: { label: 'مرفوض', className: 'badge-rejected', tone: 'no' },
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'الكل' },
  { value: 'pending_verification', label: 'قيد التحقق' },
  { value: 'approved', label: 'موافق عليه' },
];

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

function displayValue(value: string | null | undefined): string {
  const text = value?.trim();
  return text ? text : '—';
}

function CopyIcon({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="13" height="13" x="9" y="9" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function Field({
  label,
  value,
  ltr = false,
  href,
  copied = false,
  onCopy,
}: {
  label: string;
  value: string;
  ltr?: boolean;
  href?: string;
  copied?: boolean;
  onCopy?: () => void;
}) {
  const shown = displayValue(value);
  const hasValue = Boolean(value?.trim());
  const isExternal = Boolean(href?.startsWith('http'));
  return (
    <div className="admin-field">
      <dt>{label}</dt>
      <dd>
        <span className={`admin-field-value${ltr ? ' is-ltr' : ''}`} dir={ltr ? 'ltr' : undefined}>
          {href && hasValue ? (
            <a
              href={href}
              className="admin-field-link"
              {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {shown}
            </a>
          ) : (
            shown
          )}
        </span>
        {onCopy && hasValue ? (
          <button
            type="button"
            className={`admin-field-copy${copied ? ' is-done' : ''}`}
            onClick={onCopy}
            aria-label={copied ? 'تم النسخ' : 'نسخ'}
            title={copied ? 'تم النسخ' : 'نسخ'}
          >
            <CopyIcon copied={copied} />
          </button>
        ) : null}
      </dd>
    </div>
  );
}

export default function RegistrantsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<RegistrantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedImageModal, setSelectedImageModal] = useState<{ url: string; name?: string } | null>(null);
  const [screenshotLoadingId, setScreenshotLoadingId] = useState<string | null>(null);
  const [sheetPortrait, setSheetPortrait] = useState<string | null>(null);
  const [sheetReceipt, setSheetReceipt] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    pointerId: -1,
    startY: 0,
    lastY: 0,
    lastT: 0,
    dy: 0,
    vy: 0,
    dragging: false,
  });
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;

    const currentUser = user;
    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      setLoadError(false);
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch('/api/admin/registrants', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error('list_failed');
        }
        const payload = (await response.json()) as { items?: RegistrantItem[] };
        if (!cancelled) {
          setItems(Array.isArray(payload.items) ? payload.items : []);
        }
      } catch (error) {
        console.error('Error fetching registrants:', error);
        if (!cancelled) {
          setLoadError(true);
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadAll();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleDelete = async (registrantId: string) => {
    if (!user) return;
    setDeleteLoading(registrantId);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ registrantId }),
      });

      if (response.ok) {
        forgetAdminStoredImage('portrait', registrantId);
        forgetAdminStoredImage('receipt', registrantId);
        setItems((prev) => prev.filter((item) => item.id !== registrantId));
        setConfirmDelete(null);
        setSelectedId(null);
      } else {
        const errData = await response.json();
        alert(errData.error || 'حدث خطأ أثناء حذف المسجّل');
      }
    } catch (error) {
      console.error('Error deleting:', error);
      alert('حدث خطأ في الاتصال بالسيرفر');
    } finally {
      setDeleteLoading(null);
    }
  };

  const getWhatsAppUrl = (item: RegistrantItem) => {
    const phone = item.whatsappNumber || item.phoneNumber || '';
    return getWhatsAppRegistrantUrl(item.id, phone, item.track);
  };

  const openStoredImage = async (item: RegistrantItem, kind: 'receipt' | 'portrait') => {
    if (!user) return;
    setScreenshotLoadingId(`${kind}:${item.id}`);
    const failed =
      kind === 'portrait' ? 'تعذّر عرض الصورة الشخصية' : 'تعذّر عرض صورة الإيصال';
    try {
      const src = await loadAdminStoredImage(() => user.getIdToken(), kind, item.id);
      if (!src) {
        alert(failed);
        return;
      }
      if (kind === 'portrait') setSheetPortrait(src);
      else setSheetReceipt(src);
      setSelectedImageModal({ url: src, name: item.fullName });
    } catch (error) {
      console.error('Error loading image:', error);
      alert(failed);
    } finally {
      setScreenshotLoadingId(null);
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      return matchesAdminSearch(
        [
          item.fullName,
          item.phoneNumber,
          item.whatsappNumber,
          item.church,
          item.eparchy,
          item.nationalId,
          item.email,
          item.confessionFather,
          item.confessionFatherChurch,
          item.currentService,
          getTrack(item.track) ? formatTrackTitle(getTrack(item.track)!) : '',
        ],
        searchTerm
      );
    });
  }, [items, searchTerm, statusFilter]);

  const selected = filteredItems.find((item) => item.id === selectedId) ?? null;
  const selectedWhatsAppHref = selected
    ? getWhatsAppUrl(selected)
    : '';
  const selectedTrack = selected ? getTrack(selected.track) : null;
  const selectedSubtitle = selected
    ? [
        selected.church,
        selected.currentService,
        selectedTrack?.tagAr ?? selectedTrack?.titleAr ?? '',
      ]
        .filter((part) => part.trim())
        .join(' · ')
    : '';

  const closeSheet = useCallback((animate = false) => {
    if (closeTimerRef.current != null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (!animate) {
      setSelectedId(null);
      return;
    }
    const sheet = sheetRef.current;
    if (sheet) {
      sheet.style.transition = 'transform 0.22s ease-in';
      sheet.style.transform = `translateY(${Math.max(window.innerHeight * 0.75, 480)}px)`;
    }
    const backdrop = backdropRef.current;
    if (backdrop) {
      backdrop.style.transition = 'opacity 0.22s ease-in';
      backdrop.style.opacity = '0';
    }
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setSelectedId(null);
    }, 220);
  }, []);

  const onGrabPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (closeTimerRef.current != null) return;
    const sheet = sheetRef.current;
    if (sheet) sheet.style.animation = 'none';
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastT: performance.now(),
      dy: 0,
      vy: 0,
      dragging: true,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onGrabPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging || event.pointerId !== dragRef.current.pointerId) return;
    const now = performance.now();
    const dy = Math.max(0, event.clientY - dragRef.current.startY);
    const dt = Math.max(1, now - dragRef.current.lastT);
    dragRef.current.vy = (event.clientY - dragRef.current.lastY) / dt;
    dragRef.current.lastY = event.clientY;
    dragRef.current.lastT = now;
    dragRef.current.dy = dy;
    const sheet = sheetRef.current;
    if (sheet) {
      sheet.style.transition = 'none';
      sheet.style.transform = `translateY(${dy}px)`;
    }
    const backdrop = backdropRef.current;
    if (backdrop) {
      backdrop.style.transition = 'none';
      backdrop.style.opacity = String(Math.max(0.16, 1 - dy / 420));
    }
  };

  const onGrabPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging || event.pointerId !== dragRef.current.pointerId) return;
    dragRef.current.dragging = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
    const { dy, vy } = dragRef.current;
    if (dy > 96 || (dy > 36 && vy > 0.55)) {
      closeSheet(true);
      return;
    }
    const sheet = sheetRef.current;
    if (sheet) {
      sheet.style.transition = 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
      sheet.style.transform = 'translateY(0)';
    }
    const backdrop = backdropRef.current;
    if (backdrop) {
      backdrop.style.transition = 'opacity 0.28s ease';
      backdrop.style.opacity = '1';
    }
  };

  useEffect(() => {
    setCopiedKey(null);
    setSheetReceipt(null);
    if (!selectedId || !user) {
      setSheetPortrait(null);
      return;
    }
    let cancelled = false;
    const currentUser = user;
    const id = selectedId;
    void (async () => {
      try {
        const src = await loadAdminStoredImage(
          () => currentUser.getIdToken(),
          'portrait',
          id
        );
        if (cancelled) return;
        setSheetPortrait(src);
      } catch {
        if (!cancelled) setSheetPortrait(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, user]);

  useEffect(() => {
    if (!selected) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSheet();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
      if (closeTimerRef.current != null) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [selected, closeSheet]);

  const handleExportCSV = () => {
    const csvData = filteredItems.map((item) => ({
      'الاسم الكامل': item.fullName,
      'نوع التسجيل': getTrack(item.track) ? formatTrackTitle(getTrack(item.track)!) : '',
      'المدفوع': item.feeAmount != null
        ? `${item.feeAmount} ${item.feeCurrency === 'USD' ? 'USD' : 'EGP'}`
        : '',
      'الكنيسة': item.church,
      'الإيبارشية': item.eparchy,
      'الرقم القومي': item.nationalId ? `="${item.nationalId}"` : '',
      'البريد الإلكتروني': item.email,
      'أب الاعتراف': item.confessionFather,
      'كنيسة أب الاعتراف': item.confessionFatherChurch,
      'الخدمة الحالية': item.currentService,
      'رقم الموبايل': item.phoneNumber ? `="${item.phoneNumber}"` : '',
      'رقم الواتساب': (item.whatsappNumber || item.phoneNumber) ? `="${item.whatsappNumber || item.phoneNumber}"` : '',
      'حالة الطلب': STATUS_LABELS[item.status]?.label || item.status,
      'تاريخ التسجيل': item.createdAt
        ? new Date(item.createdAt).toLocaleDateString('ar-EG')
        : '',
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `registrants_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="admin-list-page">
      <div className="admin-page-head">
        <div>
          <h1>المسجّلون</h1>
          <p>اضغط على الاسم لفتح الملف الكامل</p>
        </div>
        <button
          type="button"
          className="admin-export-btn"
          onClick={handleExportCSV}
          disabled={filteredItems.length === 0}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          تصدير CSV
        </button>
      </div>

      <div className="admin-toolbar">
        <div className="admin-toolbar-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            className="form-input"
            placeholder="بحث بالاسم أو الرقم القومي أو الكنيسة أو الخدمة..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="admin-chips" role="tablist" aria-label="تصفية الحالة">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value || 'all'}
            type="button"
            className={`admin-chip${statusFilter === opt.value ? ' is-on' : ''}`}
            onClick={() => setStatusFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {!loading && (
        <p className="admin-count">
          {filteredItems.length.toLocaleString('ar-EG')} مسجّل
        </p>
      )}

      {confirmDelete && (
        <div className="admin-sheet-backdrop" style={{ zIndex: 80 }} onClick={() => setConfirmDelete(null)}>
          <div
            className="glass-card"
            style={{
              margin: '1rem',
              padding: '1.5rem',
              maxWidth: '26rem',
              width: '100%',
              textAlign: 'center',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              alignSelf: 'center',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f7f0e4', marginBottom: '0.5rem' }}>
              تأكيد حذف المسجّل
            </h3>
            <p style={{ color: 'rgba(247, 240, 228, 0.6)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              سيتم حذف بيانات المسجّل والتذكرة المرتبطة نهائياً.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: '0.75rem' }}>
                إلغاء
              </button>
              <button
                className="btn btn-full"
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleteLoading === confirmDelete}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: 'rgba(239, 68, 68, 0.8)',
                  border: '1px solid rgba(239, 68, 68, 0.5)',
                  color: '#fff',
                  fontWeight: 700,
                }}
              >
                {deleteLoading === confirmDelete ? 'جاري الحذف...' : 'حذف نهائي'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="admin-record-list">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '4.5rem', borderRadius: '1rem' }} />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="glass-card" style={{ padding: '3rem 1.25rem', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f7f0e4', marginBottom: '0.4rem' }}>
            {loadError ? 'تعذّر تحميل القائمة' : 'لا توجد نتائج مطابقة'}
          </h2>
          <p style={{ color: 'rgba(247, 240, 228, 0.5)', fontSize: '0.875rem' }}>
            {loadError
              ? 'حدث خطأ، برجاء المحاولة مرة أخرى'
              : 'جرّب البحث باسم أو رقم قومي أو غيّر فلتر الحالة.'}
          </p>
        </div>
      ) : (
        <div className="admin-record-list">
          {filteredItems.map((item) => {
            const statusInfo = STATUS_LABELS[item.status] ?? {
              label: item.status,
              className: 'badge-pending',
            };
            const tone = avatarTone(item.fullName);
            const track = getTrack(item.track);
            return (
              <button
                key={item.id}
                type="button"
                className="admin-record"
                onClick={() => setSelectedId(item.id)}
              >
                <span className="admin-avatar" style={{ background: tone.bg, color: tone.fg }}>
                  {initials(item.fullName)}
                </span>
                <span className="admin-record-body">
                  <span className="admin-record-top">
                    <span className="admin-record-name">{item.fullName}</span>
                    <span className={`badge ${statusInfo.className}`}>{statusInfo.label}</span>
                  </span>
                  <span className="admin-record-meta">
                    {track && <span>{track.tagAr ?? track.titleAr}</span>}
                    {item.church && <span>{item.church}</span>}
                    {item.currentService && <span>{item.currentService}</span>}
                  </span>
                </span>
                <svg className="admin-record-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <div
          ref={backdropRef}
          className="admin-sheet-backdrop"
          onClick={() => closeSheet()}
        >
          <div
            ref={sheetRef}
            className="admin-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="registrant-sheet-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="admin-sheet-grab"
              onPointerDown={onGrabPointerDown}
              onPointerMove={onGrabPointerMove}
              onPointerUp={onGrabPointerUp}
              onPointerCancel={onGrabPointerUp}
              aria-label="اسحب للأسفل للإغلاق"
            >
              <div className="admin-sheet-handle" />
            </div>
            <header className="admin-sheet-hero">
              <button
                type="button"
                className="admin-sheet-photo"
                onClick={() => {
                  if (sheetPortrait) setSelectedImageModal({ url: sheetPortrait, name: selected.fullName });
                  else void openStoredImage(selected, 'portrait');
                }}
                style={
                  sheetPortrait
                    ? undefined
                    : { background: avatarTone(selected.fullName).bg, color: avatarTone(selected.fullName).fg }
                }
              >
                {sheetPortrait ? (
                  <img src={sheetPortrait} alt="الصورة الشخصية" />
                ) : (
                  initials(selected.fullName)
                )}
              </button>
              <div className="admin-sheet-id">
                <div className="admin-sheet-id-top">
                  <h2 id="registrant-sheet-title">{selected.fullName}</h2>
                  <span className={`admin-sheet-status is-${STATUS_LABELS[selected.status]?.tone ?? 'pending'}`}>
                    {STATUS_LABELS[selected.status]?.label ?? selected.status}
                  </span>
                </div>
                {selectedSubtitle ? <p className="admin-sheet-sub">{selectedSubtitle}</p> : null}
              </div>
            </header>

            <div className="admin-sheet-body">
              <section className="admin-group-wrap">
                <h3>التسجيل</h3>
                <div className="admin-ticket">
                  <div className="admin-ticket-head">
                    <span className="admin-ticket-mark" aria-hidden>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 5H5a2 2 0 0 0-2 2v4a2 2 0 0 1 0 4v4a2 2 0 0 0 2 2h10" />
                        <path d="M21 8v8" />
                        <path d="M18 5v14" />
                      </svg>
                    </span>
                    <div className="admin-ticket-head-text">
                      <strong>{selectedTrack ? formatTrackTitle(selectedTrack) : '—'}</strong>
                      {selectedTrack?.tagAr ? <span>{selectedTrack.tagAr}</span> : null}
                    </div>
                  </div>
                  <div className="admin-ticket-stats">
                    <div className="admin-ticket-stat">
                      <span>المدفوع</span>
                      <strong>
                        {selected.feeAmount != null
                          ? selected.feeCurrency === 'USD'
                            ? `${selected.feeAmount}$ USD`
                            : `${selected.feeAmount.toLocaleString('ar-EG')} جنيه`
                          : '—'}
                      </strong>
                    </div>
                    <div className="admin-ticket-stat">
                      <span>التاريخ</span>
                      <strong>
                        {selected.createdAt
                          ? new Date(selected.createdAt).toLocaleDateString('ar-EG')
                          : '—'}
                      </strong>
                    </div>
                  </div>
                </div>
              </section>

              <section className="admin-group-wrap">
                <h3>الهوية</h3>
                <dl className="admin-group">
                  <Field
                    label="الرقم القومي"
                    value={selected.nationalId}
                    ltr
                    copied={copiedKey === 'nationalId'}
                    onCopy={() => {
                      void navigator.clipboard.writeText(selected.nationalId).then(
                        () => {
                          setCopiedKey('nationalId');
                          window.setTimeout(() => {
                            setCopiedKey((current) => (current === 'nationalId' ? null : current));
                          }, 1600);
                        },
                        () => undefined
                      );
                    }}
                  />
                  <Field
                    label="البريد الإلكتروني"
                    value={selected.email}
                    ltr
                    href={selected.email ? `mailto:${selected.email}` : undefined}
                    copied={copiedKey === 'email'}
                    onCopy={() => {
                      void navigator.clipboard.writeText(selected.email).then(
                        () => {
                          setCopiedKey('email');
                          window.setTimeout(() => {
                            setCopiedKey((current) => (current === 'email' ? null : current));
                          }, 1600);
                        },
                        () => undefined
                      );
                    }}
                  />
                </dl>
              </section>

              <section className="admin-group-wrap">
                <h3>الكنيسة والخدمة</h3>
                <div className="admin-place">
                  <div className="admin-place-head">
                    <span className="admin-place-mark" aria-hidden>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v4" />
                        <path d="M10 4h4" />
                        <path d="M4 21V11l8-6 8 6v10" />
                        <path d="M9 21v-5h6v5" />
                      </svg>
                    </span>
                    <div className="admin-place-head-text">
                      <strong>{displayValue(selected.church)}</strong>
                      <span>{displayValue(selected.eparchy)}</span>
                    </div>
                  </div>
                  <div className="admin-place-rows">
                    <div className="admin-place-row">
                      <span className="admin-place-k">الخدمة الحالية</span>
                      <span className="admin-place-v">{displayValue(selected.currentService)}</span>
                    </div>
                    <div className="admin-place-row">
                      <span className="admin-place-k">أب الاعتراف</span>
                      <span className="admin-place-v">{displayValue(selected.confessionFather)}</span>
                    </div>
                    <div className="admin-place-row">
                      <span className="admin-place-k">كنيسة أب الاعتراف</span>
                      <span className="admin-place-v">{displayValue(selected.confessionFatherChurch)}</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="admin-group-wrap">
                <h3>التواصل</h3>
                <dl className="admin-group">
                  <Field
                    label="الموبايل"
                    value={selected.phoneNumber}
                    ltr
                  />
                  <Field
                    label="واتساب"
                    value={selected.whatsappNumber || selected.phoneNumber}
                    ltr
                    href={selectedWhatsAppHref || undefined}
                  />
                </dl>
              </section>

              <section className="admin-group-wrap">
                <h3>المستندات</h3>
                <div className="admin-docs">
                  <button type="button" className="admin-doc" onClick={() => {
                    if (sheetPortrait) setSelectedImageModal({ url: sheetPortrait, name: selected.fullName });
                    else void openStoredImage(selected, 'portrait');
                  }}>
                    <span className="admin-doc-preview">
                      {sheetPortrait ? <img src={sheetPortrait} alt="" /> : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      )}
                    </span>
                    الصورة الشخصية
                  </button>
                  <button
                    type="button"
                    className="admin-doc"
                    onClick={() => {
                      if (sheetReceipt) setSelectedImageModal({ url: sheetReceipt, name: selected.fullName });
                      else void openStoredImage(selected, 'receipt');
                    }}
                    disabled={screenshotLoadingId === `receipt:${selected.id}`}
                  >
                    <span className="admin-doc-preview">
                      {sheetReceipt ? <img src={sheetReceipt} alt="" /> : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <rect width="18" height="18" x="3" y="3" rx="2" />
                          <circle cx="9" cy="9" r="2" />
                          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                        </svg>
                      )}
                    </span>
                    {screenshotLoadingId === `receipt:${selected.id}` ? 'جاري التحميل...' : 'إيصال الدفع'}
                  </button>
                </div>
              </section>
            </div>

            <div className="admin-sheet-actions">
              {(selected.whatsappNumber || selected.phoneNumber) && (
                <a
                  className="admin-act-wa"
                  href={selectedWhatsAppHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  واتساب
                </a>
              )}
              <button
                type="button"
                className="admin-act-del"
                onClick={() => setConfirmDelete(selected.id)}
                aria-label="حذف"
                title="حذف"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </div>
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
