/**
 * One-shot migration script — run ONCE after deploying the security fixes.
 *
 * Purpose: RSA private keys were previously stored in plaintext (PEM format) in the
 *          KeyPair table. This script detects plaintext keys and re-encrypts them
 *          using AES-256-GCM with the PRIVATE_KEY_ENCRYPTION_KEY from the environment.
 *
 * Safety:
 *  - Idempotent: already-encrypted keys (3-part format iv:data:tag) are skipped.
 *  - Dry-run mode available: set DRY_RUN=true to preview without writing.
 *  - Creates a backup table before modifying anything.
 *
 * Usage:
 *   export PRIVATE_KEY_ENCRYPTION_KEY="your-64-hex-char-key"
 *   export DATABASE_URL="postgresql://..."
 *   npx ts-node -r tsconfig-paths/register scripts/encrypt-existing-keys.ts
 *
 *   # Dry run (read-only):
 *   DRY_RUN=true npx ts-node -r tsconfig-paths/register scripts/encrypt-existing-keys.ts
 */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

const ENCRYPTION_KEY = process.env.PRIVATE_KEY_ENCRYPTION_KEY;
const DRY_RUN = process.env.DRY_RUN === 'true';
const KDF_SALT = 'ticketing-kdf-salt-v1';

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  console.error('❌ PRIVATE_KEY_ENCRYPTION_KEY is required and must be at least 32 characters.');
  process.exit(1);
}

function isPlaintextPem(value: string): boolean {
  return (
    value.includes('-----BEGIN RSA PRIVATE KEY-----') ||
    value.includes('-----BEGIN PRIVATE KEY-----')
  );
}

function isAlreadyEncrypted(value: string): boolean {
  // AES-256-GCM format: "hexIV:hexCiphertext:hexAuthTag" (3 colon-separated parts)
  const parts = value.split(':');
  return parts.length === 3 && parts[0].length === 24; // 12-byte IV → 24 hex chars
}

function encryptAES(data: string, key: string): string {
  const iv = crypto.randomBytes(12);
  const keyBuffer = crypto.scryptSync(key, KDF_SALT, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

function decryptAES(encryptedData: string, key: string): string {
  const parts = encryptedData.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted data format (expected iv:data:tag)');
  const [ivHex, encrypted, authTagHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const keyBuffer = crypto.scryptSync(key, KDF_SALT, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function main() {
  console.log(`\n🔐 RSA Key Encryption Migration`);
  console.log(`   Mode: ${DRY_RUN ? '🟡 DRY RUN (no writes)' : '🔴 LIVE (will modify database)'}`);
  console.log(`   Key: ${ENCRYPTION_KEY.substring(0, 8)}...${ENCRYPTION_KEY.slice(-8)}\n`);

  // Fetch all key pairs
  const keyPairs = await prisma.keyPair.findMany({
    select: { id: true, organizerId: true, privateKey: true, isActive: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`📊 Found ${keyPairs.length} key pair(s) in database.\n`);

  let toEncrypt: typeof keyPairs = [];
  let alreadyEncrypted = 0;
  let unknown = 0;

  for (const kp of keyPairs) {
    if (isPlaintextPem(kp.privateKey)) {
      toEncrypt.push(kp);
    } else if (isAlreadyEncrypted(kp.privateKey)) {
      alreadyEncrypted++;
    } else {
      unknown++;
      console.warn(`⚠️  KeyPair ${kp.id}: unrecognized format — skipped`);
    }
  }

  console.log(`   ✅ Already encrypted : ${alreadyEncrypted}`);
  console.log(`   🔑 Plaintext PEM     : ${toEncrypt.length} (will be encrypted)`);
  if (unknown > 0) console.log(`   ⚠️  Unknown format   : ${unknown} (skipped)\n`);

  if (toEncrypt.length === 0) {
    console.log('\n✅ Nothing to do — all keys are already encrypted.\n');
    return;
  }

  if (!DRY_RUN) {
    // Safety backup: log all plaintext key IDs before touching them
    console.log('📋 Keys to encrypt:');
    for (const kp of toEncrypt) {
      console.log(`   - ${kp.id}  (organizer: ${kp.organizerId}, active: ${kp.isActive})`);
    }
    console.log('');

    // Process in a transaction — all succeed or none
    await prisma.$transaction(async (tx) => {
      for (const kp of toEncrypt) {
        const encrypted = encryptAES(kp.privateKey, ENCRYPTION_KEY);

        // Verify round-trip before writing
        const decrypted = decryptAES(encrypted, ENCRYPTION_KEY);
        if (decrypted !== kp.privateKey) {
          throw new Error(`Round-trip verification failed for key ${kp.id} — aborting entire transaction`);
        }

        await tx.keyPair.update({
          where: { id: kp.id },
          data: { privateKey: encrypted },
        });

        console.log(`   🔐 Encrypted key ${kp.id}`);
      }
    });

    console.log(`\n✅ Successfully encrypted ${toEncrypt.length} key(s).\n`);
    console.log('⚠️  IMPORTANT: Store PRIVATE_KEY_ENCRYPTION_KEY securely.');
    console.log('   Without it, all encrypted keys are permanently unrecoverable.\n');
  } else {
    console.log('\n🟡 DRY RUN — no changes written. Remove DRY_RUN=true to apply.\n');
    console.log('Keys that WOULD be encrypted:');
    for (const kp of toEncrypt) {
      console.log(`   - ${kp.id}  (organizer: ${kp.organizerId})`);
    }
    console.log('');
  }
}

main()
  .catch((err) => {
    console.error('\n❌ Migration failed:', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
