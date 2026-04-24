import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export type WatermarkOptions = {
  label: string;
  fontSize?: number;
  opacity?: number;
  angleDegrees?: number;
};

/**
 * Draws a diagonal watermark across every page of the PDF.
 * Returns the watermarked PDF bytes. Input is left unmodified.
 */
export async function watermarkPdf(
  input: Uint8Array | ArrayBuffer,
  opts: WatermarkOptions,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(input);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontSize = opts.fontSize ?? 48;
  const opacity = opts.opacity ?? 0.18;
  const angle = opts.angleDegrees ?? 45;

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(opts.label, fontSize);
    page.drawText(opts.label, {
      x: (width - textWidth) / 2,
      y: height / 2,
      size: fontSize,
      font,
      color: rgb(0.6, 0.6, 0.6),
      opacity,
      rotate: degrees(angle),
    });
  }
  return pdf.save();
}
