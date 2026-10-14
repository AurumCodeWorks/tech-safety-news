const MAX_WIDTH = 1200;

/** Resizes an image to at most 1200px wide (2x of the 600px email) before upload. */
export async function prepareImage(file: File): Promise<{ blob: Blob; type: string; width: number; height: number }> {
  if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error('Use a PNG or JPEG image');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  if (scale === 1 && file.size <= 2 * 1024 * 1024) return { blob: file, type: file.type, width, height };
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  // PNG keeps transparency (screenshots, logos); photos become JPEG to stay small.
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t read that image'))), type, 0.85));
  return { blob, type, width, height };
}
