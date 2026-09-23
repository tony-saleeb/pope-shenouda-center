/** Center square of a camera frame, capped so QR modules stay large enough to read. */
export function centerSquareCrop(
  videoWidth: number,
  videoHeight: number,
  maxSize = 720
): { sx: number; sy: number; side: number; out: number } | null {
  if (videoWidth < 2 || videoHeight < 2) return null;
  const side = Math.min(videoWidth, videoHeight);
  const out = Math.max(2, Math.min(side, maxSize));
  return {
    sx: (videoWidth - side) / 2,
    sy: (videoHeight - side) / 2,
    side,
    out,
  };
}
