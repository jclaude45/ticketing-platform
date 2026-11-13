/**
 * Shrinks a photo in the browser before it is uploaded. A phone photo is 3-5 MB and
 * 24 MP: over a mobile connection the upload ran past the request timeout, and iOS
 * WebKit did not draw such a large image in the small avatar circle.
 * Returns the original file when it is already small or cannot be decoded.
 */
export async function shrinkImage(file: File, maxSide = 1024, quality = 0.85): Promise<Blob> {
  if (file.type === 'image/gif') return file; // would lose the animation
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    // Browsers apply the EXIF orientation when decoding, so the sizes are the upright ones
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size < 500 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#fff'; // transparent PNG areas would turn black in JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob ?? file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
