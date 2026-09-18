import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { StorageService } from '../storage/storage.service';
import { TicketExportService } from './ticket-export.service';
import { SubscriptionService } from '../subscription/subscription.service';
import {
  EXPORT_QUEUE,
  ExportJobData,
  ExportJobResult,
  ExportJobType,
} from './export-queue.constants';
import { Role } from '@prisma/client';

@Injectable()
@Processor(EXPORT_QUEUE, { concurrency: 2 })
export class ExportProcessor extends WorkerHost {
  private readonly logger = new Logger(ExportProcessor.name);

  constructor(
    private readonly exportService: TicketExportService,
    private readonly storageService: StorageService,
    private readonly subscriptionService: SubscriptionService,
  ) {
    super();
  }

  async process(job: Job<ExportJobData>): Promise<ExportJobResult> {
    const { eventId, userId, exportType } = job.data;
    this.logger.log(`Processing export job ${job.id}: type=${exportType} event=${eventId}`);

    await this.subscriptionService.checkBulkExport(userId);

    let buffer: Buffer;
    let fileName: string;
    let contentType: string;

    switch (exportType) {
      case ExportJobType.PDF_BULK: {
        buffer = await this.exportService.generateBulkEventTicketsPDF(eventId);
        fileName = `billets-${eventId}.pdf`;
        contentType = 'application/pdf';
        break;
      }

      case ExportJobType.PDF_GROUPED: {
        // Background job: no HTTP timeout risk → always generate the full PDF (no 200-ticket cap)
        buffer = await this.exportService.generateGroupedEventTicketsPDF(eventId);
        fileName = `billets-${eventId}.pdf`;
        contentType = 'application/pdf';
        break;
      }

      case ExportJobType.ZIP:
      default: {
        const zipResult = await this.exportService.generateBatchedExportZip(eventId);
        buffer = zipResult.buffer;
        fileName = `tickets-${eventId}.zip`;
        contentType = 'application/zip';
        break;
      }
    }

    // Upload to S3 with 2-hour expiry
    const s3Key = `exports/${eventId}/${job.id}-${fileName}`;
    await this.storageService.uploadBuffer(buffer, s3Key, contentType);
    const downloadUrl = await this.storageService.getSignedDownloadUrl(s3Key, 7200);

    const expiresAt = new Date(Date.now() + 7200 * 1000).toISOString();
    this.logger.log(`Export job ${job.id} complete — ${buffer.length} bytes, url expires at ${expiresAt}`);

    return { downloadUrl, fileName, contentType, expiresAt };
  }
}
