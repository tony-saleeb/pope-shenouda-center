export interface UploadProgress {
  progress: number; // 0–100
  bytesTransferred: number;
  totalBytes: number;
}

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_WIDTH = 800;
const JPEG_QUALITY = 0.7;

const RECEIPT_TOO_LARGE = 'حجم الصورة كبير جداً، الحد الأقصى ٥ ميجابايت';
const RECEIPT_FAILED = 'فشل معالجة صورة الإيصال، برجاء إرفاق صورة أخرى';
const RECEIPT_UNREADABLE = 'فشل قراءة ملف الصورة';
const RECEIPT_UNSUPPORTED = 'صيغة الصورة غير مدعومة، برجاء استخدام JPG أو PNG';

const ARABIC_MESSAGES = new Set([
  RECEIPT_TOO_LARGE,
  RECEIPT_FAILED,
  RECEIPT_UNREADABLE,
  RECEIPT_UNSUPPORTED,
]);

/**
 * Compress a payment receipt client-side to a max-width 800px JPEG.
 * The resulting Blob is posted to /api/register, which is the only writer allowed by
 * the Firestore rules.
 *
 * Rejects rather than falling back to the uncompressed original: an oversized or blank
 * receipt is stored verbatim and cannot be reviewed or OCR'd.
 */
export async function compressPaymentScreenshot(file: File): Promise<Blob> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error(RECEIPT_TOO_LARGE);
  }

  try {
    const dataUrl = await readAsDataUrl(file);
    const img = await loadImage(dataUrl);

    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;

    if (!width || !height) {
      throw new Error(RECEIPT_FAILED);
    }

    if (width > MAX_WIDTH) {
      height = Math.round((height * MAX_WIDTH) / width);
      width = MAX_WIDTH;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error(RECEIPT_FAILED);
    }

    ctx.drawImage(img, 0, 0, width, height);

    const blob = await canvasToBlob(canvas);
    if (blob.size < 1024) {
      throw new Error(RECEIPT_FAILED);
    }

    return blob;
  } catch (error) {
    // Every surfaced message must be Arabic, so unknown failures are remapped.
    if (error instanceof Error && ARABIC_MESSAGES.has(error.message)) {
      throw error;
    }
    console.error('Receipt compression failed:', error);
    throw new Error(RECEIPT_FAILED);
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error(RECEIPT_UNREADABLE));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error(RECEIPT_UNREADABLE));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(RECEIPT_UNSUPPORTED));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(RECEIPT_FAILED));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      JPEG_QUALITY
    );
  });
}
