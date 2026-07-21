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
 * Upload a payment screenshot directly to Firebase Storage.
 * Returns the download URL on completion.
 *
 * @param file        The image file to upload
 * @param registrantId The registrant's document ID (used as path segment)
 * @param onProgress  Optional callback for upload progress updates
 */
export async function uploadPaymentScreenshot(
  file: File,
  registrantId: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<string> {
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
        console.error('Upload failed:', error);
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
