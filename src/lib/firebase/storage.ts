export interface UploadProgress {
  progress: number; // 0–100
  bytesTransferred: number;
  totalBytes: number;
}

/**
 * Compress image screenshot locally to max-width 800px JPEG (~50KB)
 * and return as a Base64 Data URL stored directly in Firestore.
 * Bypasses Firebase Storage completely — 100% FREE on Spark plan with zero setup.
 */
export async function uploadPaymentScreenshot(
  file: File,
  _registrantId: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<string> {
  onProgress?.({ progress: 20, bytesTransferred: 0, totalBytes: file.size });

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      onProgress?.({ progress: 60, bytesTransferred: Math.floor(file.size * 0.6), totalBytes: file.size });

      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            const rawBase64 = event.target?.result as string;
            onProgress?.({ progress: 100, bytesTransferred: file.size, totalBytes: file.size });
            resolve(rawBase64);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // Compress to JPEG at 0.7 quality (~40KB - 80KB)
          const base64DataUrl = canvas.toDataURL('image/jpeg', 0.7);

          onProgress?.({ progress: 100, bytesTransferred: file.size, totalBytes: file.size });
          resolve(base64DataUrl);
        } catch (err) {
          console.error('Image compression error, using raw base64:', err);
          const rawBase64 = event.target?.result as string;
          resolve(rawBase64);
        }
      };

      img.onerror = () => {
        reject(new Error('فشل معالجة صورة الإيصال'));
      };

      img.src = event.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('فشل قراءة ملف الصورة'));
    };

    reader.readAsDataURL(file);
  });
}
