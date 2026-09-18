export const EXPORT_QUEUE = 'ticket-export';

export const ExportJobType = {
  PDF_BULK: 'pdf-bulk',
  PDF_GROUPED: 'pdf-grouped',
  ZIP: 'zip',
} as const;

export type ExportJobType = (typeof ExportJobType)[keyof typeof ExportJobType];

export interface ExportJobData {
  eventId: string;
  userId: string;
  userRole: string;
  exportType: ExportJobType;
}

export interface ExportJobResult {
  downloadUrl: string;
  fileName: string;
  contentType: string;
  expiresAt: string;
}
