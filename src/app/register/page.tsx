'use client';

import { useState, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { compressPaymentScreenshot, UploadProgress } from '@/lib/firebase/storage';
import {
  isValidEgyptianPhone,
  isValidInternationalPhone,
  isValidName,
  normalizePhone,
  sanitizeNationalPhoneInput,
  sanitizePhoneInput,
  toPhoneIndexId,
  VALIDATION_MESSAGES,
} from '@/lib/validation';
import { DIAL_COUNTRIES } from '@/lib/countries';
import { getTrack, TRACK_LIST } from '@/lib/registrationTracks';
import { WIZARD_STEPS } from '@/lib/types';
import type { RegistrationFormData } from '@/lib/types';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import PaymentInstructionsPanel from '@/components/PaymentInstructionsModal';

const STEP_TRACK = 0;
const STEP_FEES = 1;
const STEP_NAME = 2;
const STEP_CHURCH = 3;
const STEP_PHONE = 4;
const STEP_PAYMENT = 5;

const NETWORK_ERROR_MESSAGE = 'تعذّر الاتصال بالخدمة، تأكد من الإنترنت وحاول مرة أخرى';

function storedPhone(form: RegistrationFormData, kind: 'phone' | 'whatsapp' = 'phone'): string {
  const national = kind === 'whatsapp' && !form.sameAsPhone ? form.whatsappNumber : form.phoneNumber;
  if (form.track === 'abroad') {
    return toPhoneIndexId(form.countryDial, national);
  }
  return normalizePhone(national);
}

function isPhoneValid(form: RegistrationFormData, kind: 'phone' | 'whatsapp' = 'phone'): boolean {
  const national = kind === 'whatsapp' && !form.sameAsPhone ? form.whatsappNumber : form.phoneNumber;
  if (form.track === 'abroad') {
    return isValidInternationalPhone(form.countryDial, national);
  }
  return isValidEgyptianPhone(national);
}

interface RegisterResponse {
  registrantId?: string;
  messageAr?: string;
}

/**
 * POST the registration to /api/register.
 * Uses XMLHttpRequest so the receipt upload can report real progress.
 * Never throws: transport failures come back as status 0.
 */
function postRegistration(
  body: FormData,
  onProgress: (progress: UploadProgress | null) => void
): Promise<{ status: number; payload: RegisterResponse | null }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/register');

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress({
        progress: Math.min(99, Math.round((event.loaded / event.total) * 100)),
        bytesTransferred: event.loaded,
        totalBytes: event.total,
      });
    };

    xhr.onload = () => {
      let payload: RegisterResponse | null = null;
      try {
        payload = JSON.parse(xhr.responseText) as RegisterResponse;
      } catch {
        payload = null;
      }
      resolve({ status: xhr.status, payload });
    };

    xhr.onerror = () => resolve({ status: 0, payload: null });
    xhr.ontimeout = () => resolve({ status: 0, payload: null });

    xhr.send(body);
  });
}

// ─── Step Indicator ─────────────────────────────────────────────────
function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div
      className="step-rail"
      role="progressbar"
      aria-valuenow={currentStep + 1}
      aria-valuemin={1}
      aria-valuemax={WIZARD_STEPS.length}
      style={{ gridTemplateColumns: `repeat(${WIZARD_STEPS.length}, minmax(0, 1fr))` }}
    >
      {WIZARD_STEPS.map((step, index) => (
        <span
          key={step.id}
          className={`step-rail-stop${index < currentStep ? ' is-done' : ''}${index === currentStep ? ' is-current' : ''}`}
          title={step.titleAr}
        />
      ))}
    </div>
  );
}

// ─── Step Title ─────────────────────────────────────────────────────
function StepTitle({ step, total }: { step: number; total: number }) {
  const stepInfo = WIZARD_STEPS[step];
  return (
    <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
      <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)', marginBottom: '0.25rem' }}>
        خطوة {(step + 1).toLocaleString('ar-EG')} من {total.toLocaleString('ar-EG')}
      </p>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{stepInfo.titleAr}</h2>
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<RegistrationFormData>({
    track: '',
    fullName: '',
    church: '',
    customChurch: '',
    countryDial: '',
    phoneNumber: '',
    whatsappNumber: '',
    sameAsPhone: true,
    paymentScreenshot: null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkingPhone, setCheckingPhone] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const selectedTrack = getTrack(formData.track);
  const isAbroad = formData.track === 'abroad';

  // ─── Field updates ───────────────────────────────────────────────
  const updateField = useCallback(
    <K extends keyof RegistrationFormData>(key: K, value: RegistrationFormData[K]) => {
      setFormData((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    []
  );

  // ─── Validation per step ─────────────────────────────────────────
  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    switch (step) {
      case STEP_TRACK:
        if (!formData.track) {
          newErrors.track = VALIDATION_MESSAGES.trackRequired;
        }
        break;
      case STEP_FEES:
        if (!formData.track) {
          newErrors.track = VALIDATION_MESSAGES.trackRequired;
        }
        break;
      case STEP_NAME:
        if (!formData.fullName.trim()) {
          newErrors.fullName = VALIDATION_MESSAGES.nameRequired;
        } else if (!isValidName(formData.fullName)) {
          newErrors.fullName = VALIDATION_MESSAGES.nameTooShort;
        }
        break;
      case STEP_CHURCH:
        if (!formData.church.trim()) {
          newErrors.church = VALIDATION_MESSAGES.churchRequired;
        }
        break;
      case STEP_PHONE:
        if (isAbroad && !formData.countryDial) {
          newErrors.countryDial = VALIDATION_MESSAGES.countryRequired;
        }
        if (!formData.phoneNumber) {
          newErrors.phoneNumber = VALIDATION_MESSAGES.phoneRequired;
        } else if (!isPhoneValid(formData, 'phone')) {
          newErrors.phoneNumber = isAbroad
            ? VALIDATION_MESSAGES.intlPhoneInvalid
            : VALIDATION_MESSAGES.phoneInvalid;
        }
        if (!formData.sameAsPhone) {
          if (!formData.whatsappNumber) {
            newErrors.whatsappNumber = VALIDATION_MESSAGES.whatsappRequired;
          } else if (!isPhoneValid(formData, 'whatsapp')) {
            newErrors.whatsappNumber = isAbroad
              ? VALIDATION_MESSAGES.intlPhoneInvalid
              : VALIDATION_MESSAGES.whatsappInvalid;
          }
        }
        break;
      case STEP_PAYMENT:
        if (!formData.paymentScreenshot) {
          newErrors.paymentScreenshot = VALIDATION_MESSAGES.screenshotRequired;
        }
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ─── Navigation ──────────────────────────────────────────────────
  const goNext = async () => {
    if (!validateStep(currentStep)) return;

    if (currentStep === STEP_PHONE) {
      setCheckingPhone(true);
      try {
        const phone = storedPhone(formData);
        const phoneRef = doc(db, 'phoneIndex', phone);
        const phoneDoc = await getDoc(phoneRef);

        if (phoneDoc.exists()) {
          setErrors((prev) => ({
            ...prev,
            phoneNumber: VALIDATION_MESSAGES.duplicatePhone,
          }));
          return;
        }
      } catch (err) {
        console.error('Error checking duplicate phone:', err);
      } finally {
        setCheckingPhone(false);
      }
    }

    setCurrentStep((prev) => Math.min(prev + 1, WIZARD_STEPS.length - 1));
  };

  const goBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  // ─── File selection ──────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      updateField('paymentScreenshot', file);
      const reader = new FileReader();
      reader.onload = (ev) => setPreviewUrl(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  // ─── Submit ──────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return;
    if (!formData.paymentScreenshot) return;

    setIsSubmitting(true);
    const phone = storedPhone(formData, 'phone');
    const whatsapp = storedPhone(formData, 'whatsapp');

    const abort = (field: 'submit' | 'phoneNumber' | 'paymentScreenshot', message: string) => {
      setIsSubmitting(false);
      setUploadProgress(null);
      setErrors({ [field]: message });
    };

    let compressed: Blob;
    try {
      compressed = await compressPaymentScreenshot(formData.paymentScreenshot);
    } catch (error: unknown) {
      abort(
        'paymentScreenshot',
        error instanceof Error && error.message ? error.message : VALIDATION_MESSAGES.uploadFailed
      );
      return;
    }

    const body = new FormData();
    body.append('fullName', formData.fullName.trim());
    body.append('church', formData.church.trim());
    body.append('track', formData.track);
    body.append('countryDial', formData.countryDial);
    body.append('phoneNumber', phone);
    body.append('whatsappNumber', whatsapp);
    body.append('screenshot', compressed, 'receipt.jpg');

    const { status, payload } = await postRegistration(body, setUploadProgress);

    if (status === 409) {
      abort('phoneNumber', payload?.messageAr ?? VALIDATION_MESSAGES.duplicatePhone);
      setCurrentStep(STEP_PHONE);
      return;
    }

    if (status === 0) {
      abort('submit', NETWORK_ERROR_MESSAGE);
      return;
    }

    if (status !== 200 || !payload?.registrantId) {
      abort('submit', payload?.messageAr ?? VALIDATION_MESSAGES.genericError);
      return;
    }

    // Success — redirect to status page
    router.push(`/status/${payload.registrantId}`);
  };

  // ─── Render Steps ────────────────────────────────────────────────
  const renderStep = () => {
    switch (currentStep) {
      case STEP_TRACK:
        return (
          <div className="fade-in">
            <div className="track-grid">
              {TRACK_LIST.map((track) => {
                const selected = formData.track === track.id;
                return (
                  <button
                    key={track.id}
                    type="button"
                    className={`track-card is-${track.tone}${selected ? ' is-selected' : ''}`}
                    onClick={() => {
                      setFormData((prev) => {
                        const switchingAbroad = (prev.track === 'abroad') !== (track.id === 'abroad');
                        return {
                          ...prev,
                          track: track.id,
                          ...(switchingAbroad
                            ? { phoneNumber: '', whatsappNumber: '', countryDial: '' }
                            : {}),
                        };
                      });
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.track;
                        return next;
                      });
                    }}
                  >
                    {track.tagAr && <span className={`track-tag is-${track.tone}`}>{track.tagAr}</span>}
                    <span className="track-card-title">{track.titleAr}</span>
                    <span className="track-card-detail">{track.detailAr}</span>
                  </button>
                );
              })}
            </div>
            {errors.track && <p className="form-error">{errors.track}</p>}
          </div>
        );

      case STEP_FEES:
        return selectedTrack ? (
          <div className="fade-in">
            <PaymentInstructionsPanel track={selectedTrack} />
          </div>
        ) : null;

      case STEP_NAME:
        return (
          <div className="fade-in">
            <label className="form-label" htmlFor="fullName">الاسم ثلاثي على الأقل</label>
            <input
              id="fullName"
              type="text"
              className={`form-input ${errors.fullName ? 'form-input-error' : ''}`}
              placeholder="مثال: مينا مجدي جرجس"
              value={formData.fullName}
              onChange={(e) => updateField('fullName', e.target.value)}
              autoFocus
              autoComplete="name"
            />
            {errors.fullName && <p className="form-error">{errors.fullName}</p>}
          </div>
        );

      case STEP_CHURCH:
        return (
          <div className="fade-in">
            <label className="form-label" htmlFor="church">الكنيسة</label>
            <input
              id="church"
              type="text"
              className={`form-input ${errors.church ? 'form-input-error' : ''}`}
              placeholder="أدخل اسم كنيستك"
              value={formData.church}
              onChange={(e) => updateField('church', e.target.value)}
              autoFocus
            />
            {errors.church && <p className="form-error">{errors.church}</p>}
          </div>
        );

      case STEP_PHONE:
        return (
          <div className="fade-in">
            <label className="form-label" htmlFor="phoneNumber">رقم الموبايل</label>
            <div className={isAbroad ? 'phone-intl' : undefined} style={{ position: 'relative' }}>
              {isAbroad && (
                <select
                  id="countryDial"
                  className={`form-input phone-dial${errors.countryDial ? ' form-input-error' : ''}`}
                  value={formData.countryDial}
                  onChange={(e) => updateField('countryDial', e.target.value)}
                >
                  <option value="">كود الدولة</option>
                  {DIAL_COUNTRIES.map((country) => (
                    <option key={`${country.iso}-${country.dial}`} value={country.dial}>
                      {country.nameAr} +{country.dial}
                    </option>
                  ))}
                </select>
              )}
              <div style={{ position: 'relative', flex: '1 1 auto', minWidth: 0 }}>
              <input
                id="phoneNumber"
                type="tel"
                className={`form-input form-input-phone ${errors.phoneNumber ? 'form-input-error' : ''}`}
                placeholder={isAbroad ? 'رقم الموبايل' : '01XXXXXXXXX'}
                value={formData.phoneNumber}
                onChange={(e) => {
                  const val = isAbroad
                    ? sanitizeNationalPhoneInput(e.target.value)
                    : sanitizePhoneInput(e.target.value);
                  setFormData((prev) => ({
                    ...prev,
                    phoneNumber: val,
                    ...(prev.sameAsPhone ? { whatsappNumber: val } : {}),
                  }));
                  setErrors((prev) => {
                    if (!prev.phoneNumber && (!prev.sameAsPhone || !prev.whatsappNumber)) return prev;
                    const next = { ...prev };
                    delete next.phoneNumber;
                    if (prev.sameAsPhone) delete next.whatsappNumber;
                    return next;
                  });
                }}
                dir="ltr"
                style={{ paddingLeft: formData.phoneNumber ? '2.5rem' : '1.25rem' }}
                inputMode="numeric"
                autoComplete="tel"
              />

              {formData.phoneNumber && (
                <button
                  type="button"
                  onClick={() => {
                    setFormData((prev) => ({
                      ...prev,
                      phoneNumber: '',
                      ...(prev.sameAsPhone ? { whatsappNumber: '' } : {}),
                    }));
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.phoneNumber;
                      if (prev.sameAsPhone) delete next.whatsappNumber;
                      return next;
                    });
                  }}
                  title="مسح الرقم"
                  style={{
                    position: 'absolute',
                    left: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(255, 255, 255, 0.2)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '1.5rem',
                    height: '1.5rem',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              )}
              </div>
            </div>
            {errors.countryDial && <p className="form-error">{errors.countryDial}</p>}
            {errors.phoneNumber && <p className="form-error">{errors.phoneNumber}</p>}

            {/* WhatsApp toggle */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              marginTop: '1.5rem',
              padding: '1rem',
              background: 'rgba(255,255,255,0.04)',
              borderRadius: '0.75rem',
            }}>
              <input
                type="checkbox"
                id="sameAsPhone"
                className="toggle-checkbox"
                checked={formData.sameAsPhone}
                onChange={(e) => {
                  updateField('sameAsPhone', e.target.checked);
                  if (e.target.checked) {
                    updateField('whatsappNumber', formData.phoneNumber);
                  }
                }}
              />
              <label htmlFor="sameAsPhone" style={{
                fontSize: '0.9375rem',
                color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
                flex: 1,
              }}>
                رقم الواتساب نفس رقم الموبايل
              </label>
            </div>

            {!formData.sameAsPhone && (
              <div style={{ marginTop: '1rem' }}>
                <label className="form-label" htmlFor="whatsappNumber">رقم الواتساب</label>
                <input
                  id="whatsappNumber"
                  type="tel"
                  className={`form-input form-input-phone ${errors.whatsappNumber ? 'form-input-error' : ''}`}
                  placeholder={isAbroad ? 'رقم الواتساب' : '01XXXXXXXXX'}
                  value={formData.whatsappNumber}
                  onChange={(e) =>
                    updateField(
                      'whatsappNumber',
                      isAbroad
                        ? sanitizeNationalPhoneInput(e.target.value)
                        : sanitizePhoneInput(e.target.value)
                    )
                  }
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="tel"
                />
                {errors.whatsappNumber && <p className="form-error">{errors.whatsappNumber}</p>}
              </div>
            )}
          </div>
        );

      case STEP_PAYMENT:
        return (
          <div className="fade-in">
            <label className="form-label">صورة إيصال الدفع</label>
            <p style={{
              fontSize: '0.8125rem',
              color: 'rgba(255,255,255,0.45)',
              marginBottom: '1rem',
              lineHeight: 1.6,
            }}>
              {selectedTrack?.usesInstapay === false
                ? 'التقط صورة لإيصال التحويل بالدولار أو اختر من المعرض'
                : 'التقط صورة لإيصال الدفع من تطبيق InstaPay أو اختر من المعرض'}
            </p>

            {!previewUrl ? (
              <div
                className="upload-zone"
                onClick={() => document.getElementById('fileInput')?.click()}
              >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 1rem' }}>
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                </svg>
                <p style={{ fontSize: '1.0625rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: '0.5rem' }}>
                  التقط صورة أو اختر من المعرض
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.3)' }}>
                  PNG, JPG حتى ٥ ميجابايت
                </p>
              </div>
            ) : (
              <div className="upload-zone upload-zone-preview" style={{ position: 'relative' }}>
                <img
                  src={previewUrl}
                  alt="معاينة الإيصال"
                  style={{
                    width: '100%',
                    maxHeight: '16rem',
                    objectFit: 'contain',
                    borderRadius: '0.5rem',
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setPreviewUrl(null);
                    updateField('paymentScreenshot', null);
                  }}
                  style={{
                    position: 'absolute',
                    top: '0.5rem',
                    left: '0.5rem',
                    width: '2rem',
                    height: '2rem',
                    borderRadius: '50%',
                    background: 'rgba(239, 68, 68, 0.9)',
                    border: 'none',
                    color: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.25rem',
                  }}
                >
                  ×
                </button>
              </div>
            )}

            <input
              id="fileInput"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/heic,image/webp"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            {errors.paymentScreenshot && <p className="form-error">{errors.paymentScreenshot}</p>}

            {/* Upload progress */}
            {uploadProgress && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '0.375rem',
                  fontSize: '0.8125rem',
                  color: 'rgba(255,255,255,0.5)',
                }}>
                  <span>جاري الرفع...</span>
                  <span>{uploadProgress.progress}%</span>
                </div>
                <div style={{
                  width: '100%',
                  height: '0.375rem',
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: '9999px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${uploadProgress.progress}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--color-primary-500), var(--color-accent-400))',
                    borderRadius: '9999px',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </div>
            )}
          </div>
        );
    }
  };

  const isLastStep = currentStep === WIZARD_STEPS.length - 1;

  // Check if current step is valid for enabling next button
  const isStepValid = (): boolean => {
    switch (currentStep) {
      case STEP_TRACK:
        return Boolean(formData.track);
      case STEP_FEES:
        return Boolean(formData.track);
      case STEP_NAME:
        return isValidName(formData.fullName);
      case STEP_CHURCH:
        return formData.church.trim().length > 0;
      case STEP_PHONE:
        if (!isPhoneValid(formData, 'phone')) return false;
        if (!formData.sameAsPhone && !isPhoneValid(formData, 'whatsapp')) return false;
        return true;
      case STEP_PAYMENT:
        return formData.paymentScreenshot !== null;
      default:
        return false;
    }
  };

  return (
    <>
      <Header />
      <main className="page-enter" style={{ position: 'relative', zIndex: 1, minHeight: 'calc(100dvh - 7.5rem)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '2rem 1rem' }}>
      <div className="container-mobile">
        {/* Step Indicator */}
        <StepIndicator currentStep={currentStep} />

        {/* Card */}
        <div className="glass-card" style={{ padding: '2rem 1.5rem' }}>
          {selectedTrack && currentStep !== STEP_TRACK && currentStep !== STEP_FEES && (
          <div className="pay-recall-wrap">
            <button
              type="button"
              onClick={() => setCurrentStep(STEP_FEES)}
              className="pay-recall"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
              <span>تعليمات الدفع</span>
            </button>
          </div>
          )}

          {/* Step Title */}
          <StepTitle step={currentStep} total={WIZARD_STEPS.length} />

          {/* Step Content */}
          {renderStep()}

          {/* Submit error */}
          {errors.submit && (
            <div style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '0.75rem',
              textAlign: 'center',
            }}>
              <p className="form-error" style={{ margin: 0 }}>{errors.submit}</p>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="wizard-nav">
            {isLastStep ? (
              <button
                className="btn btn-accent"
                onClick={handleSubmit}
                disabled={!isStepValid() || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner spinner-gold" />
                    <span>جاري الإرسال</span>
                  </>
                ) : (
                  <span>إرسال التسجيل</span>
                )}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={goNext}
                disabled={!isStepValid() || checkingPhone}
              >
                {checkingPhone ? (
                  <>
                    <span className="spinner spinner-gold" />
                    <span>جاري التحقق</span>
                  </>
                ) : (
                  <>
                    <span>التالي</span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'scaleX(-1)' }}>
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>
            )}

            {currentStep > 0 && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={goBack}
                disabled={isSubmitting}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
                <span>رجوع</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
    </>
  );
}
