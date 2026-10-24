/**
 * Anti-robot proof for the forms that send an e-mail (sign-up, forgotten password, new
 * confirmation link). The server gives a signed challenge; the browser finds a nonce such that
 * SHA-256(salt + nonce) starts with `difficulty` zero bits. The search runs in a Web Worker and
 * starts as soon as the form opens (prepareProof), so it is usually done before the click.
 */
import { apiClient } from './api';

interface Challenge {
  salt: string;
  difficulty: number;
  expires: number;
  signature: string;
}

// Plain SHA-256 of one short ASCII message (salt + nonce < 56 bytes: a single block), returning
// the number of leading zero bits. Hand-written because crypto.subtle is asynchronous and
// about ten times slower for 100 000 tiny hashes.
const WORKER = `
const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const W = new Uint32Array(64);
const B = new Uint8Array(64);
function zeroBits(msg) {
  B.fill(0);
  for (let i = 0; i < msg.length; i++) B[i] = msg.charCodeAt(i);
  B[msg.length] = 0x80;
  const bits = msg.length * 8;
  B[62] = bits >>> 8; B[63] = bits & 255;
  for (let i = 0; i < 16; i++) W[i] = (B[i*4] << 24) | (B[i*4+1] << 16) | (B[i*4+2] << 8) | B[i*4+3];
  for (let i = 16; i < 64; i++) {
    const a = W[i-15], b = W[i-2];
    const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
    const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
    W[i] = (W[i-16] + s0 + W[i-7] + s1) | 0;
  }
  let a = 0x6a09e667, b = 0xbb67ae85, c = 0x3c6ef372, d = 0xa54ff53a, e = 0x510e527f, f = 0x9b05688c, g = 0x1f83d9ab, h = 0x5be0cd19;
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  const h0 = (0x6a09e667 + a) >>> 0, h1 = (0xbb67ae85 + b) >>> 0;
  return h0 ? Math.clz32(h0) : 32 + Math.clz32(h1);
}
onmessage = (ev) => {
  const { salt, difficulty } = ev.data;
  for (let n = 0; n < 1e12; n++) {
    if (zeroBits(salt + n) >= difficulty) { postMessage(n); return; }
  }
};
`;

function search(c: Challenge): Promise<number> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' })));
    } catch (err) {
      reject(err);
      return;
    }
    worker.onmessage = (ev) => { resolve(ev.data as number); worker.terminate(); };
    worker.onerror = (ev) => { reject(ev); worker.terminate(); };
    worker.postMessage({ salt: c.salt, difficulty: c.difficulty });
  });
}

async function solve(): Promise<{ proof: string; expires: number }> {
  const res = await apiClient.get('/auth/challenge');
  const c = ((res.data as any)?.data ?? res.data) as Challenge;
  const nonce = await search(c);
  return { proof: [c.salt, c.difficulty, c.expires, c.signature, nonce].join('.'), expires: c.expires };
}

let prepared: Promise<{ proof: string; expires: number }> | null = null;

/** Starts solving in the background (call it when a protected form opens) */
export function prepareProof() {
  if (!prepared) {
    prepared = solve();
    prepared.catch(() => { prepared = null; });
  }
}

/** A fresh proof for one request; each proof is accepted only once by the server */
export async function takeProof(): Promise<string> {
  prepareProof();
  let p = await prepared!;
  // Expired while the page stayed open: solve a new one (a minute of margin)
  if (p.expires - Date.now() < 60_000) {
    prepared = null;
    prepareProof();
    p = await prepared!;
  }
  prepared = null;
  prepareProof(); // ready for a second click (resend, mistake in the form)
  return p.proof;
}
