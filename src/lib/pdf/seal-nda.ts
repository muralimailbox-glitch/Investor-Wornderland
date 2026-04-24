import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export type NdaSealInput = {
  templatePdf?: Uint8Array | ArrayBuffer;
  signer: {
    name: string;
    title: string;
    firm: string;
    email: string;
  };
  signedAt: Date;
  signerIp: string;
  signerUserAgent: string;
  templateVersion: string;
  otpVerifiedAt: Date;
};

/**
 * Produces the final signed NDA PDF: the base template (or a generated
 * OotaOS mutual NDA if none supplied) followed by a signature audit page.
 */
export async function sealNda(input: NdaSealInput): Promise<Uint8Array> {
  const pdf = input.templatePdf
    ? await PDFDocument.load(input.templatePdf)
    : await defaultTemplate();

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const audit = pdf.addPage([612, 792]);
  audit.drawText('Signature Audit Trail', { x: 50, y: 740, size: 18, font: bold });
  audit.drawLine({
    start: { x: 50, y: 730 },
    end: { x: 560, y: 730 },
    thickness: 1,
    color: rgb(0.2, 0.2, 0.2),
  });

  const rows: Array<[string, string]> = [
    ['Signer name', input.signer.name],
    ['Signer title', input.signer.title],
    ['Signer firm', input.signer.firm],
    ['Signer email', input.signer.email],
    ['Signer IP', input.signerIp],
    ['User agent', truncate(input.signerUserAgent, 80)],
    ['OTP verified at', input.otpVerifiedAt.toISOString()],
    ['Signed at', input.signedAt.toISOString()],
    ['Template version', input.templateVersion],
  ];

  let y = 700;
  for (const [label, value] of rows) {
    audit.drawText(`${label}:`, { x: 50, y, size: 11, font: bold });
    audit.drawText(value, { x: 200, y, size: 11, font });
    y -= 22;
  }

  audit.drawText('This audit page is included in the sealed PDF at the moment of signing.', {
    x: 50,
    y: y - 24,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  return pdf.save();
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

async function defaultTemplate(): Promise<PDFDocument> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const page = pdf.addPage([612, 792]);
  page.drawText('OotaOS — Mutual Non-Disclosure Agreement', {
    x: 50,
    y: 740,
    size: 18,
    font: bold,
  });

  const body = [
    'This Mutual Non-Disclosure Agreement ("Agreement") is entered into',
    'between OotaOS and the investor identified in the audit page of this',
    'document. Both parties agree to keep confidential any proprietary',
    'information exchanged in connection with the OotaOS seed investment',
    'discussions, including pitch materials, technical architecture,',
    'customer references, and financial projections.',
    '',
    'The obligations set forth in this Agreement shall survive for three (3)',
    'years from the date of disclosure. This Agreement is governed by the',
    'laws of the jurisdiction identified in the accompanying deal record.',
  ];
  let y = 700;
  for (const line of body) {
    page.drawText(line, { x: 50, y, size: 11, font });
    y -= 18;
  }
  return pdf;
}
