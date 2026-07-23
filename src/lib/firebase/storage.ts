import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  UploadTaskSnapshot,
} from 'firebase/storage';
import { storage } from './client';

export interface UploadProgress {
  progress: number; // 0–100
  bytesTransferred: number;
  totalBytes: number;
}

/**
 * Upload a payment screenshot directly to serverless API (/api/upload)
 * with client Storage fallback. Avoids CORS and client-side storage bucket hangs.
 */
export async function uploadPaymentScreenshot(
  file: File,
  registrantId: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<string> {
  onProgress?.({ progress: 15, bytesTransferred: 0, totalBytes: file.size });

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('registrantId', registrantId);

    onProgress?.({ progress: 45, bytesTransferred: Math.floor(file.size * 0.45), totalBytes: file.size });

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || 'Server upload failed');
    }

    onProgress?.({ progress: 100, bytesTransferred: file.size, totalBytes: file.size });

    const data = await response.json();
    return data.url;
  } catch (serverErr) {
    console.warn('Server API upload failed, attempting Firebase Client Storage fallback:', serverErr);

    // Fallback: direct client storage upload
    const storageRef = ref(storage, `screenshots/${registrantId}/${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: file.type,
    });

    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot: UploadTaskSnapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress?.({
            progress: Math.round(progress),
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
          });
        },
        (error) => {
          console.error('Client storage upload failed:', error);
          reject(error);
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(downloadURL);
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  }
}
