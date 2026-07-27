'use client';

import { useState, useCallback } from 'react';
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { uploadPaymentScreenshot, UploadProgress } from '@/lib/firebase/storage';
import {
  isValidName,
  isValidEgyptianPhone,
  normalizePhone,
  VALIDATION_MESSAGES,
} from '@/lib/validation';
import { CHURCHES, WIZARD_STEPS } from '@/lib/types';
import type { RegistrationFormData } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import PaymentInstructionsModal from '@/components/PaymentInstructionsModal';

// ─── Step Indicator ─────────────────────────────────────────────────
function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="step-indicator" style={{ marginBottom: '2rem' }}>
      {WIZARD_STEPS.map((step, index) => (
        <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            className={`step-dot ${
              index === currentStep
                ? 'step-dot-active'
                : index < currentStep
                ? 'step-dot-completed'
                : 'step-dot-inactive'
            }`}
          >
            {index < currentStep ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <span>{(index + 1).toLocaleString('ar-EG')}</span>
            )}
          </div>
          {index < WIZARD_STEPS.length - 1 && (
            <div
              className={`step-connector ${index < currentStep ? 'step-connector-active' : ''}`}
            />
          )}
        </div>
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
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<RegistrationFormData>({
    fullName: '',
    church: '',
    customChurch: '',
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
      case 0: // Name
        if (!formData.fullName.trim()) {
          newErrors.fullName = VALIDATION_MESSAGES.nameRequired;
        } else if (!isValidName(formData.fullName)) {
          newErrors.fullName = VALIDATION_MESSAGES.nameTooShort;
        }
        break;
      case 1: // Church
        if (!formData.church.trim()) {
          newErrors.church = VALIDATION_MESSAGES.churchRequired;
        }
        break;
      case 2: // Phone
        if (!formData.phoneNumber) {
          newErrors.phoneNumber = VALIDATION_MESSAGES.phoneRequired;
        } else if (!isValidEgyptianPhone(formData.phoneNumber)) {
          newErrors.phoneNumber = VALIDATION_MESSAGES.phoneInvalid;
        }
        if (!formData.sameAsPhone) {
          if (!formData.whatsappNumber) {
            newErrors.whatsappNumber = VALIDATION_MESSAGES.whatsappRequired;
          } else if (!isValidEgyptianPhone(formData.whatsappNumber)) {
            newErrors.whatsappNumber = VALIDATION_MESSAGES.whatsappInvalid;
          }
        }
        break;
      case 3: // Payment
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

    // Step 2 is Phone Step — Check uniqueness in Firestore before proceeding to screenshot upload
    if (currentStep === 2) {
      setCheckingPhone(true);
      try {
        const phone = normalizePhone(formData.phoneNumber);
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
    const registrantId = uuidv4();
    const phone = normalizePhone(formData.phoneNumber);
    const whatsapp = formData.sameAsPhone
      ? phone
      : normalizePhone(formData.whatsappNumber);
    const churchName = formData.church.trim();

    try {
      // Step 1: Upload screenshot directly to Firebase Storage
      const screenshotUrl = await uploadPaymentScreenshot(
        formData.paymentScreenshot,
        registrantId,
        setUploadProgress
      );

      // Step 2: Transactional write — registrant + phoneIndex atomically
      await runTransaction(db, async (transaction) => {
        // Check if phone is already registered
        const phoneRef = doc(db, 'phoneIndex', phone);
        const phoneDoc = await transaction.get(phoneRef);

        if (phoneDoc.exists()) {
          throw new Error('DUPLICATE_PHONE');
        }

        // Create registrant document
        const registrantRef = doc(db, 'registrants', registrantId);
        transaction.set(registrantRef, {
          fullName: formData.fullName.trim(),
          phoneNumber: phone,
          whatsappNumber: whatsapp,
          church: churchName,
          paymentScreenshotUrl: screenshotUrl,
          status: 'pending_verification',
          ocrStatus: 'queued',
          ocrExtractedReference: null,
          ocrExtractedAmount: null,
          ocrExtractedSenderName: null,
          ocrConfidence: null,
          adminNotes: null,
          createdAt: serverTimestamp(),
          verifiedAt: null,
        });

        // Create phone index document (duplicate guard)
        transaction.set(phoneRef, {
          registrantId,
        });
      });

      // Success — redirect to status page
      router.push(`/status/${registrantId}`);
    } catch (error: unknown) {
      setIsSubmitting(false);
      setUploadProgress(null);

      if (error instanceof Error && error.message === 'DUPLICATE_PHONE') {
        setErrors({ phoneNumber: VALIDATION_MESSAGES.duplicatePhone });
        setCurrentStep(2); // Go back to phone step
      } else {
        setErrors({ submit: VALIDATION_MESSAGES.genericError });
      }
    }
  };

  // ─── Render Steps ────────────────────────────────────────────────
  const renderStep = () => {
    switch (currentStep) {
      case 0: // Name
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

      case 1: // Church
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

      case 2: // Phone
        return (
          <div className="fade-in">
            <label className="form-label" htmlFor="phoneNumber">رقم الموبايل</label>
            <input
              id="phoneNumber"
              type="tel"
              className={`form-input ${errors.phoneNumber ? 'form-input-error' : ''}`}
              placeholder="01XXXXXXXXX"
              value={formData.phoneNumber}
              onChange={(e) => {
                const val = e.target.value;
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
              style={{ textAlign: 'left' }}
              inputMode="tel"
              autoFocus
            />
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
                  className={`form-input ${errors.whatsappNumber ? 'form-input-error' : ''}`}
                  placeholder="01XXXXXXXXX"
                  value={formData.whatsappNumber}
                  onChange={(e) => updateField('whatsappNumber', e.target.value)}
                  dir="ltr"
                  style={{ textAlign: 'left' }}
                  inputMode="tel"
                />
                {errors.whatsappNumber && <p className="form-error">{errors.whatsappNumber}</p>}
              </div>
            )}
          </div>
        );

      case 3: // Payment Screenshot
        return (
          <div className="fade-in">
            <label className="form-label">صورة إيصال الدفع</label>
            <p style={{
              fontSize: '0.8125rem',
              color: 'rgba(255,255,255,0.45)',
              marginBottom: '1rem',
              lineHeight: 1.6,
            }}>
              التقط صورة لإيصال الدفع من تطبيق InstaPay أو اختر من المعرض
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
      case 0: return isValidName(formData.fullName);
      case 1:
        return formData.church.trim().length > 0;
      case 2:
        const phoneValid = isValidEgyptianPhone(formData.phoneNumber);
        if (!formData.sameAsPhone) {
          return phoneValid && isValidEgyptianPhone(formData.whatsappNumber);
        }
        return phoneValid;
      case 3: return formData.paymentScreenshot !== null;
      default: return false;
    }
  };

  return (
    <>
      <Header />
      <main className="page-enter" style={{ position: 'relative', zIndex: 1, minHeight: 'calc(100dvh - 7.5rem)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div className="container-mobile">
        {/* Step Indicator */}
        <StepIndicator currentStep={currentStep} />

        {/* Card */}
        <div className="glass-card" style={{ padding: '2rem 1.5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <button
              type="button"
              onClick={() => setShowInstructionsModal(true)}
              className="btn btn-ghost"
              style={{ fontSize: '0.8125rem', color: '#fbba33', padding: '0.4rem 0.8rem', background: 'rgba(242, 158, 19, 0.1)', border: '1px solid rgba(242, 158, 19, 0.25)', borderRadius: '0.625rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
              <span>تعليمات ورسوم الدفع (400 EGP / InstaPay)</span>
            </button>
          </div>

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
          <div style={{
            display: 'flex',
            gap: '0.75rem',
            marginTop: '2rem',
            flexDirection: currentStep > 0 ? 'row-reverse' : 'column',
          }}>
            {isLastStep ? (
              <button
                className="btn btn-accent btn-full"
                onClick={handleSubmit}
                disabled={!isStepValid() || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner" />
                    <span>جاري الإرسال...</span>
                  </>
                ) : (
                  <span>إرسال التسجيل</span>
                )}
              </button>
            ) : (
              <button
                className="btn btn-primary btn-full"
                onClick={goNext}
                disabled={!isStepValid() || checkingPhone}
              >
                {checkingPhone ? (
                  <>
                    <span className="spinner" />
                    <span>جاري التحقق من الرقم...</span>
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
                className="btn btn-ghost"
                onClick={goBack}
                disabled={isSubmitting}
                style={{ flex: '0 0 auto' }}
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

      <PaymentInstructionsModal
        isOpen={showInstructionsModal}
        onClose={() => setShowInstructionsModal(false)}
        onProceed={() => setShowInstructionsModal(false)}
      />
    </>
  );
}
