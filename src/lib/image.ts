/**
 * 업로드 전 리사이즈. 긴 변 1600px, JPEG q0.8.
 * 수식과 첨자가 살아있는 최소 크기다 — 더 줄이면 지수가 뭉개진다.
 */
const MAX_EDGE = 1600;
const QUALITY = 0.8;

export interface PreparedImage {
  /** API 로 보낼 data URL */
  dataUrl: string;
  /** IndexedDB 에 보관할 원본(리사이즈된) blob */
  blob: Blob;
  width: number;
  height: number;
}

export async function prepareImage(file: File | Blob): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지를 처리할 수 없습니다');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('이미지 변환에 실패했습니다'))),
      'image/jpeg',
      QUALITY
    );
  });

  const dataUrl = await blobToDataUrl(blob);
  return { dataUrl, blob, width, height };
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다'));
    reader.readAsDataURL(blob);
  });
}
