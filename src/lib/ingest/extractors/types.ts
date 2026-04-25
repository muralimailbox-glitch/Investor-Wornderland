export type ExtractedSection = {
  source: string;
  section: string;
  version: string;
  text: string;
  metadata?: Record<string, unknown>;
};

export type Extractor = (filePath: string) => Promise<ExtractedSection[]>;

export function sectionFromFilename(file: string): string {
  const slash = file.replace(/\\/g, '/').split('/').pop() ?? file;
  const stem = slash.replace(/\.[^.]+$/, '');
  return stem
    .replace(/^OotaOS[_-]?/i, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export function basenameOf(file: string): string {
  return file.replace(/\\/g, '/').split('/').pop() ?? file;
}
