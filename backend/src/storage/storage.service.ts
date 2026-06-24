import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { Readable } from 'stream';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface UploadResult {
  key: string;
  url: string;
  bucket: string;
  size: number;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly region: string;

  private readonly uploadsDir: string;
  private readonly appBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('aws.region') || 'us-east-1';
    this.bucketName = this.configService.get<string>('aws.bucketName') || '';

    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: this.configService.get<string>('aws.accessKeyId') || '',
        secretAccessKey: this.configService.get<string>('aws.secretAccessKey') || '',
      },
    });

    this.uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    const port = this.configService.get<number>('port') || 3001;
    this.appBaseUrl = `http://localhost:${port}`;
  }

  private isS3Configured(): boolean {
    const key = this.configService.get<string>('aws.accessKeyId') ?? '';
    const secret = this.configService.get<string>('aws.secretAccessKey') ?? '';
    const bucket = this.bucketName;
    // Reject obviously placeholder values
    const isPlaceholder = (v: string) =>
      !v || v.startsWith('your-') || v === 'undefined' || v === 'null';
    return !isPlaceholder(key) && !isPlaceholder(secret) && !isPlaceholder(bucket);
  }

  private async saveToLocal(buffer: Buffer, fullKey: string, _contentType: string): Promise<UploadResult> {
    const filePath = path.join(this.uploadsDir, fullKey);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    const url = `${this.appBaseUrl}/uploads/${fullKey}`;
    this.logger.log(`Saved file locally: ${filePath}`);
    return { key: fullKey, url, bucket: 'local', size: buffer.length };
  }

  async uploadBuffer(
    buffer: Buffer,
    key: string,
    contentType: string,
    folder?: string,
  ): Promise<UploadResult> {
    const fullKey = folder ? `${folder}/${key}` : key;

    if (!this.isS3Configured()) {
      return this.saveToLocal(buffer, fullKey, contentType);
    }

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fullKey,
        Body: buffer,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      }),
    );

    const url = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${fullKey}`;

    this.logger.log(`Uploaded file to S3: ${fullKey}`);
    return {
      key: fullKey,
      url,
      bucket: this.bucketName,
      size: buffer.length,
    };
  }

  async uploadFile(
    filePath: string,
    key: string,
    contentType: string,
    folder?: string,
  ): Promise<UploadResult> {
    const fullKey = folder ? `${folder}/${key}` : key;
    const fileStream = createReadStream(filePath);

    // Get file size
    const { stat } = await import('fs/promises');
    const stats = await stat(filePath);

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fullKey,
        Body: fileStream,
        ContentType: contentType,
        ContentLength: stats.size,
        ServerSideEncryption: 'AES256',
      }),
    );

    const url = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${fullKey}`;

    this.logger.log(`Uploaded file to S3: ${fullKey}`);
    return {
      key: fullKey,
      url,
      bucket: this.bucketName,
      size: stats.size,
    };
  }

  async getSignedDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async getSignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async downloadToBuffer(key: string): Promise<Buffer> {
    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );

    const chunks: Uint8Array[] = [];
    const stream = response.Body as Readable;

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async delete(key: string): Promise<void> {
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );

    this.logger.log(`Deleted file from S3: ${key}`);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    const response = await this.s3Client.send(
      new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
      }),
    );

    return (response.Contents || []).map((item) => item.Key).filter(Boolean) as string[];
  }

  generateKey(originalName: string, folder?: string): string {
    const ext = path.extname(originalName);
    const uniqueName = `${uuidv4()}${ext}`;
    return folder ? `${folder}/${uniqueName}` : uniqueName;
  }

  async uploadTicketPDF(pdfBuffer: Buffer, ticketSerial: string): Promise<UploadResult> {
    const key = `tickets/${ticketSerial}.pdf`;
    return this.uploadBuffer(pdfBuffer, key, 'application/pdf');
  }

  async uploadEventBanner(imageBuffer: Buffer, eventId: string, ext: string = 'jpg'): Promise<UploadResult> {
    const key = `events/${eventId}/banner.${ext}`;
    return this.uploadBuffer(imageBuffer, key, `image/${ext}`);
  }

  async uploadTemplateLogo(logoBuffer: Buffer, templateId: string, ext: string = 'png'): Promise<UploadResult> {
    const key = `templates/${templateId}/logo.${ext}`;
    return this.uploadBuffer(logoBuffer, key, `image/${ext}`);
  }

  getPublicUrl(key: string): string {
    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
  }

  validateFileType(mimetype: string, allowedTypes: string[]): void {
    if (!allowedTypes.includes(mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`,
      );
    }
  }

  validateFileSize(size: number, maxSizeBytes: number): void {
    if (size > maxSizeBytes) {
      const maxMB = Math.round(maxSizeBytes / (1024 * 1024));
      throw new BadRequestException(`File size exceeds the maximum allowed size of ${maxMB}MB`);
    }
  }
}
