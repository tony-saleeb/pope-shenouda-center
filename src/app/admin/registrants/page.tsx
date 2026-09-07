'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth/context';
import type { RegistrantStatus } from '@/lib/types';
import { ImageLightboxModal } from '@/components/ui/ImageLightboxModal';
import { getWhatsAppTicketUrl } from '@/lib/services/whatsappService';
import { matchesAdminSearch, safeImageSrc } from '@/lib/validation';
import { formatTrackTitle, getTrack, trackRequiresAttendanceQr } from '@/lib/registrationTracks';
import { formatEgyptianPhone } from '@/lib/utils/formatters';
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

const STATUS_LABELS: Record<RegistrantStatus, { label: string; className: string }> = {
  pending_verification: { label: 'قيد التحقق', className: 'badge-pending' },
  auto_approved: { label: 'موافقة تلقائية', className: 'badge-approved' },
  manual_review: { label: 'تحتاج مراجعة', className: 'badge-review' },
  approved: { label: 'موافق عليه', className: 'badge-approved' },
  rejected: { label: 'مرفوض', className: 'badge-rejected' },
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'الكل' },
  { value: 'pending_verification', label: 'قيد التحقق' },
  { value: 'manual_review', label: 'تحتاج مراجعة' },
  { value: 'auto_approved', label: 'موافقة تلقائية' },
  { value: 'approved', label: 'موافق عليه' },
  { value: 'rejected', label: 'مرفوض' },
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
      <dd dir={ltr ? 'ltr' : undefined}>
        <span className="admin-field-value">
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
          <button type="button" className="admin-field-copy" onClick={onCopy}>
            {copied ? 'تم النسخ' : 'نسخ'}
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
      const token = await user.getIdToken(true);
      const response = await fetch('/api/admin/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ registrantId }),
      });

      if (response.ok) {
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
    return getWhatsAppTicketUrl(item.id, phone);
  };

  const openStoredImage = async (item: RegistrantItem, kind: 'receipt' | 'portrait') => {
    if (!user) return;
    setScreenshotLoadingId(`${kind}:${item.id}`);
    const failed =
      kind === 'portrait' ? 'تعذّر عرض الصورة الشخصية' : 'تعذّر عرض صورة الإيصال';
    try {
      const token = await user.getIdToken();
      const response = await fetch(
        kind === 'portrait' ? `/api/admin/portrait/${item.id}` : `/api/admin/receipt/${item.id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const payload = (await response.json()) as { url?: string };
      const src = payload.url ? safeImageSrc(payload.url) : null;
      if (!response.ok || !src) {
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
    ? (selected.status === 'approved' || selected.status === 'auto_approved') &&
      trackRequiresAttendanceQr(selected.track)
      ? getWhatsAppUrl(selected)
      : `https://wa.me/${formatEgyptianPhone(selected.whatsappNumber || selected.phoneNumber)}`
    : '';
  const selectedSubtitle = selected
    ? [selected.church, selected.currentService].filter((part) => part?.trim()).join(' · ')
    : '';

  useEffect(() => {
    setCopiedKey(null);
    if (!selectedId || !user) {
      setSheetPortrait(null);
      setSheetReceipt(null);
      return;
    }
    let cancelled = false;
    const currentUser = user;
    const id = selectedId;
    void (async () => {
      try {
        const token = await currentUser.getIdToken();
        const headers = { Authorization: `Bearer ${token}` };
        const [portraitRes, receiptRes] = await Promise.all([
          fetch(`/api/admin/portrait/${id}`, { headers }),
          fetch(`/api/admin/receipt/${id}`, { headers }),
        ]);
        const portraitPayload = (await portraitRes.json()) as { url?: string };
        const receiptPayload = (await receiptRes.json()) as { url?: string };
        if (cancelled) return;
        setSheetPortrait(portraitRes.ok ? safeImageSrc(portraitPayload.url) : null);
        setSheetReceipt(receiptRes.ok ? safeImageSrc(receiptPayload.url) : null);
      } catch {
        if (!cancelled) {
          setSheetPortrait(null);
          setSheetReceipt(null);
        }
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
      if (event.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [selected]);

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
        <div className="admin-sheet-backdrop" onClick={() => setSelectedId(null)}>
          <div
            className="admin-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="registrant-sheet-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="admin-sheet-handle" aria-hidden />
            <header className="admin-sheet-hero">
              <button type="button" className="admin-sheet-close" onClick={() => setSelectedId(null)} aria-label="إغلاق">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
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
              <h2 id="registrant-sheet-title" dir="auto">{selected.fullName}</h2>
              {selectedSubtitle ? <p className="admin-sheet-sub">{selectedSubtitle}</p> : null}
              <div className="admin-sheet-pills">
                <span className={`badge ${STATUS_LABELS[selected.status]?.className ?? 'badge-pending'}`}>
                  {STATUS_LABELS[selected.status]?.label ?? selected.status}
                </span>
                {getTrack(selected.track) && (
                  <span className="badge badge-review">{getTrack(selected.track)!.tagAr ?? getTrack(selected.track)!.titleAr}</span>
                )}
              </div>
              {(selected.whatsappNumber || selected.phoneNumber || selected.email) ? (
              <div className="admin-sheet-quick">
                {selected.whatsappNumber || selected.phoneNumber ? (
                  <a className="admin-quick is-wa" href={selectedWhatsAppHref} target="_blank" rel="noopener noreferrer">
                    <span className="admin-quick-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.47 14.38c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.48-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.05 1.02-1.05 2.5s1.07 2.9 1.22 3.1c.15.2 2.1 3.2 5.08 4.48.71.3 1.26.48 1.69.62.71.23 1.36.2 1.87.12.57-.08 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35z" />
                        <path d="M12.04 2C6.5 2 2.03 6.48 2.03 12.02c0 1.77.46 3.5 1.34 5.02L2 22l5.1-1.34A10 10 0 0 0 12.04 22C17.57 22 22 17.52 22 12.02 22 6.48 17.57 2 12.04 2zm0 18.15c-1.64 0-3.25-.44-4.65-1.28l-.33-.2-3.03.8.81-2.95-.22-.35A8.13 8.13 0 0 1 3.87 12C3.87 7.5 7.54 3.84 12.04 3.84S20.16 7.5 20.16 12c0 4.5-3.67 8.15-8.12 8.15z" />
                      </svg>
                    </span>
                    واتساب
                  </a>
                ) : null}
                {selected.email ? (
                  <a className="admin-quick is-mail" href={`mailto:${selected.email}`}>
                    <span className="admin-quick-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="20" height="16" x="2" y="4" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                      </svg>
                    </span>
                    بريد
                  </a>
                ) : null}
              </div>
              ) : null}
            </header>

            <div className="admin-sheet-body">
              <section className="admin-group-wrap">
                <h3>التسجيل</h3>
                <dl className="admin-group">
                  <Field label="النوع" value={getTrack(selected.track) ? formatTrackTitle(getTrack(selected.track)!) : ''} />
                  <Field
                    label="المدفوع"
                    value={
                      selected.feeAmount != null
                        ? selected.feeCurrency === 'USD'
                          ? `${selected.feeAmount}$ USD`
                          : `${selected.feeAmount.toLocaleString('ar-EG')} جنيه`
                        : ''
                    }
                  />
                  <Field
                    label="التاريخ"
                    value={
                      selected.createdAt
                        ? new Date(selected.createdAt).toLocaleDateString('ar-EG')
                        : ''
                    }
                  />
                </dl>
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
                <dl className="admin-group">
                  <Field label="الكنيسة" value={selected.church} />
                  <Field label="الإيبارشية" value={selected.eparchy} />
                  <Field label="الخدمة الحالية" value={selected.currentService} />
                  <Field label="أب الاعتراف" value={selected.confessionFather} />
                  <Field label="كنيسة أب الاعتراف" value={selected.confessionFatherChurch} />
                </dl>
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
