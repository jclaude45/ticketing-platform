import { randomInt } from 'crypto';

/** FlexPay refuses a reference longer than 25 characters ("Le paramètre reference ne peut pas dépasser 25 caractères") */
export const FLEXPAY_REFERENCE_MAX = 25;
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * A payment reference for FlexPay: the prefix, then random digits and capitals up to 25
 * characters. The reference also unlocks the order's tickets on the success page, so it must
 * not be guessable: "ZAYA-" leaves 20 random characters (about 103 bits).
 */
export function flexPayReference(prefix: string): string {
  let ref = prefix;
  while (ref.length < FLEXPAY_REFERENCE_MAX) ref += ALPHABET[randomInt(ALPHABET.length)];
  return ref;
}
