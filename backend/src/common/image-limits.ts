/**
 * Largest picture decoded (width × height). A few MB of PNG can describe 16 000 × 16 000
 * pixels, about 1 GB once decoded; sharp's own limit (268 M pixels) lets that through.
 * 60 M still takes a 48-megapixel phone photo.
 */
export const MAX_IMAGE_PIXELS = 60_000_000;
