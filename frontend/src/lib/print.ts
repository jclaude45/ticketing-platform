/**
 * Opens the browser's native print dialog for a PDF blob.
 * Works with all printers the OS has registered (USB, network, PDF, etc.).
 *
 * Two rendering quirks to handle:
 * 1. The iframe must have real A4 dimensions — a 1×1px iframe defers PDF rendering.
 * 2. `onload` fires when the iframe document is parsed, NOT when the PDF viewer
 *    has finished rendering. A 500 ms delay avoids the "blank pages on first print"
 *    race condition.
 */
export function printPDFBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);

  const iframe = document.createElement('iframe');
  // Real A4 dimensions so the PDF renderer works at proper scale, but offscreen.
  iframe.style.cssText =
    'position:fixed;top:-10000px;left:-10000px;width:210mm;height:297mm;opacity:0;border:none;pointer-events:none;';
  iframe.src = url;

  document.body.appendChild(iframe);

  iframe.onload = () => {
    // Wait for the browser PDF viewer to finish rendering before opening the dialog.
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        // Fallback: open in a new tab so the user can print manually.
        window.open(url, '_blank');
      }
    }, 500);

    // Clean up after the print dialog is dismissed.
    setTimeout(() => {
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
      URL.revokeObjectURL(url);
    }, 60_000);
  };
}
