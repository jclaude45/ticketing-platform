/**
 * DEK Rotation Script — CRYPTO-003 / CRYPTO-004 remediation
 *
 * Re-encrypts every KeyPair.privateKey from v1 (static scrypt salt)
 * to v2 (per-record random salt) and optionally rotates the DEK itself.
 *
 * Usage:
 *   # Dry run — prints what would change without touching the DB:
 *   OLD_DEK=<current_key> NEW_DEK=<new_key> DRY_RUN=true \
 *     ts-node -r tsconfig-paths/register scripts/rotate-dek.ts
 *
 *   # Live migration:
 *   OLD_DEK=<current_key> NEW_DEK=<new_key> \
 *     ts-node -r tsconfig-paths/register scripts/rotate-dek.ts
 *
 * OLD_DEK = current value of PRIVATE_KEY_ENCRYPTION_KEY
 * NEW_DEK = new value (run: openssl rand -hex 32)
 * If OLD_DEK === NEW_DEK the script still upgrades v1 → v2 format without changing the DEK.
 */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();
const OLD_DEK = process.env.OLD_DEK;
const NEW_DEK = process.env.NEW_DEK;
const DRY_RUN = process.env.DRY_RUN === 'true';

if (!OLD_DEK || !NEW_DEK) {
  console.error('ERROR: OLD_DEK and NEW_DEK environment variables are required.');
  process.exit(1);
}

function decryptV1(stored: string, dek: string): string {
  const parts = stored.split(':');
  if (parts.length !== 3) throw new Error(`v1 format expects 3 parts, got ${parts.length}`);
  const [ivHex, ctHex, tagHex] = parts;
  const key = crypto.scryptSync(dek, 'ticketing-kdf-salt-v1', 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(ctHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

function decryptV2(stored: string, dek: string): string {
  const inner = stored.slice(3); // strip "v2:"
  const parts = inner.split(':');
  if (parts.length !== 4) throw new Error(`v2 format expects 4 parts, got ${parts.length}`);
  const [saltHex, ivHex, ctHex, tagHex] = parts;
  const key = crypto.scryptSync(dek, Buffer.from(saltHex, 'hex'), 32, { N: 16384, r: 8, p: 1 });
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(ctHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

function decrypt(stored: string, dek: string): string {
  if (stored.startsWith('v2:')) return decryptV2(stored, dek);
  return decryptV1(stored, dek);
}

function encryptV2(plaintext: string, dek: string): string {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(dek, salt, 32, { N: 16384, r: 8, p: 1 });
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${salt.toString('hex')}:${iv.toString('hex')}:${ct.toString('hex')}:${tag.toString('hex')}`;
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE MIGRATION'}`);
  console.log(`DEK rotation: ${OLD_DEK === NEW_DEK ? 'same key (format upgrade only)' : 'new DEK'}`);
  console.log('');

  const pairs = await prisma.keyPair.findMany({
    select: { id: true, privateKey: true, organizerId: true },
  });

  console.log(`Found ${pairs.length} KeyPair records.`);

  let migrated = 0;
  let alreadyV2 = 0;
  let errors = 0;

  for (const pair of pairs) {
    const isV2 = pair.privateKey.startsWith('v2:');
    const sameDek = OLD_DEK === NEW_DEK;

    if (isV2 && sameDek) {
      alreadyV2++;
      continue;
    }

    try {
      const plaintext = decrypt(pair.privateKey, OLD_DEK!);
      const newEncrypted = encryptV2(plaintext, NEW_DEK!);

      if (DRY_RUN) {
        console.log(`[DRY] Would migrate KeyPair ${pair.id} (organizer: ${pair.organizerId}) — format: ${isV2 ? 'v2→v2' : 'v1→v2'}`);
      } else {
        await prisma.keyPair.update({
          where: { id: pair.id },
          data: { privateKey: newEncrypted },
        });
        console.log(`Migrated KeyPair ${pair.id} (${isV2 ? 'v2→v2 with new DEK' : 'v1→v2'})`);
      }
      migrated++;
    } catch (err) {
      console.error(`ERROR on KeyPair ${pair.id}: ${err.message}`);
      errors++;
    }
  }

  console.log('');
  console.log('─── Summary ───────────────────────────────────────');
  console.log(`  Migrated : ${migrated}`);
  console.log(`  Already v2 (no change): ${alreadyV2}`);
  console.log(`  Errors   : ${errors}`);
  if (errors > 0) {
    console.error('Some records failed — do NOT update PRIVATE_KEY_ENCRYPTION_KEY yet.');
    process.exit(1);
  }
  if (!DRY_RUN) {
    console.log('');
    console.log('Migration complete. Update PRIVATE_KEY_ENCRYPTION_KEY in .env to NEW_DEK value.');
  }
}

main().finally(() => prisma.$disconnect());
