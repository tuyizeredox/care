import { BadRequestException } from '@nestjs/common';
import { extname } from 'node:path';

/**
 * Upload allow-list. Both the extension AND the reported MIME type must match
 * the same entry, which stops `report.pdf.exe` and mislabelled payloads.
 */
export const ALLOWED_FILE_TYPES: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.ppt': ['application/vnd.ms-powerpoint'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  '.csv': ['text/csv', 'application/csv', 'text/plain'],
  '.txt': ['text/plain'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.gif': ['image/gif'],
  '.webp': ['image/webp'],
  '.zip': ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
};

export const ALLOWED_EXTENSIONS = Object.keys(ALLOWED_FILE_TYPES);

/** Magic-number prefixes for the formats where a signature check is meaningful. */
const FILE_SIGNATURES: Array<{ extensions: string[]; bytes: number[] }> = [
  { extensions: ['.pdf'], bytes: [0x25, 0x50, 0x44, 0x46] },
  { extensions: ['.jpg', '.jpeg'], bytes: [0xff, 0xd8, 0xff] },
  { extensions: ['.png'], bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { extensions: ['.gif'], bytes: [0x47, 0x49, 0x46, 0x38] },
  // OOXML files and .zip share the PK zip container signature.
  { extensions: ['.zip', '.docx', '.xlsx', '.pptx'], bytes: [0x50, 0x4b] },
];

const isPrintable = (character: string): boolean => {
  const code = character.charCodeAt(0);
  return code > 31 && code !== 127;
};

/** Strips path separators and control characters from a client-supplied name. */
export const sanitizeFileName = (name: string): string => {
  const cleaned = Array.from(name || '')
    .filter(isPrintable)
    .join('')
    .replace(/[\\/]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return cleaned || 'file';
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return value.toFixed(value >= 10 ? 0 : 1) + ' ' + units[unit];
};

export interface ValidatedUpload {
  fileName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Validates one uploaded file. Throws a user-facing BadRequestException whose
 * message is safe to render directly in the UI.
 */
export function validateUpload(
  file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  maxBytes: number,
): ValidatedUpload {
  if (!file || !file.buffer || file.size === 0) {
    throw new BadRequestException('The uploaded file is empty.');
  }
  if (file.size > maxBytes) {
    throw new BadRequestException(
      'This file is too large. The maximum upload size is ' + formatBytes(maxBytes) + '.',
    );
  }

  const fileName = sanitizeFileName(file.originalname);
  const extension = extname(fileName).toLowerCase();
  const allowedMimes = ALLOWED_FILE_TYPES[extension];

  if (!allowedMimes) {
    throw new BadRequestException(
      'Files of type "' +
        (extension || 'unknown') +
        '" are not allowed. Accepted formats: ' +
        ALLOWED_EXTENSIONS.join(', ') +
        '.',
    );
  }

  const mimeType = (file.mimetype || '').toLowerCase().split(';')[0].trim();
  if (!allowedMimes.includes(mimeType)) {
    throw new BadRequestException(
      'The file content does not match its "' + extension + '" extension.',
    );
  }

  const signature = FILE_SIGNATURES.find((entry) => entry.extensions.includes(extension));
  if (signature) {
    const header = file.buffer.subarray(0, signature.bytes.length);
    const matches = signature.bytes.every((byte, index) => header[index] === byte);
    if (!matches) {
      throw new BadRequestException(
        'This file appears to be corrupted or is not a real ' + extension + ' file.',
      );
    }
  }

  return { fileName, extension, mimeType, sizeBytes: file.size };
}
