'use strict';
/* crypto-Ersatz: Zufall über WebCrypto, SHA-1 und SHA-256 in JavaScript (synchron, wie bei Node). */
function sha1(bytes) {
    const ml = bytes.length, words = [];
    const withPad = new Uint8Array(((ml + 9 + 63) >> 6) << 6);
    withPad.set(bytes); withPad[ml] = 0x80;
    const dv = new DataView(withPad.buffer);
    dv.setUint32(withPad.length - 4, ml * 8);
    let [a, b, c, d, e] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
    const w = new Uint32Array(80), rol = (x, n) => (x << n) | (x >>> (32 - n));
    for (let i = 0; i < withPad.length; i += 64) {
        for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
        for (let t = 16; t < 80; t++) w[t] = rol(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
        let [A, B, C, D, E] = [a, b, c, d, e];
        for (let t = 0; t < 80; t++) {
            const f = t < 20 ? (B & C) | (~B & D) : t < 40 ? B ^ C ^ D : t < 60 ? (B & C) | (B & D) | (C & D) : B ^ C ^ D;
            const k = t < 20 ? 0x5a827999 : t < 40 ? 0x6ed9eba1 : t < 60 ? 0x8f1bbcdc : 0xca62c1d6;
            const tmp = (rol(A, 5) + f + E + k + w[t]) >>> 0;
            E = D; D = C; C = rol(B, 30) >>> 0; B = A; A = tmp;
        }
        a = (a + A) >>> 0; b = (b + B) >>> 0; c = (c + C) >>> 0; d = (d + D) >>> 0; e = (e + E) >>> 0;
    }
    words.push(a, b, c, d, e);
    return Buffer.from(words.flatMap(x => [x >>> 24, (x >>> 16) & 255, (x >>> 8) & 255, x & 255]));
}
const K256 = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
function sha256(bytes) {
    const ml = bytes.length, p = new Uint8Array(((ml + 9 + 63) >> 6) << 6);
    p.set(bytes); p[ml] = 0x80;
    const dv = new DataView(p.buffer);
    dv.setUint32(p.length - 4, (ml * 8) >>> 0); dv.setUint32(p.length - 8, Math.floor(ml / 0x20000000));
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const w = new Uint32Array(64), ror = (x, n) => (x >>> n) | (x << (32 - n));
    for (let i = 0; i < p.length; i += 64) {
        for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
        for (let t = 16; t < 64; t++) {
            const s0 = ror(w[t - 15], 7) ^ ror(w[t - 15], 18) ^ (w[t - 15] >>> 3), s1 = ror(w[t - 2], 17) ^ ror(w[t - 2], 19) ^ (w[t - 2] >>> 10);
            w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, h] = H;
        for (let t = 0; t < 64; t++) {
            const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K256[t] + w[t]) >>> 0;
            const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
            h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    return Buffer.from(Array.from(H).flatMap(x => [x >>> 24, (x >>> 16) & 255, (x >>> 8) & 255, x & 255]));
}
const HASHES = { sha1, sha256 };
module.exports = {
    randomBytes(n) { const b = new Uint8Array(n); globalThis.crypto.getRandomValues(b); return Buffer.from(b); },
    createHash(alg) {
        const fn = HASHES[String(alg).toLowerCase()];
        if (!fn) throw new Error('Hash ' + alg + ' ist in der Handy-App nicht verfügbar.');
        const parts = [];
        const h = { update(x) { parts.push(typeof x === 'string' ? Buffer.from(x, 'utf8') : Buffer.from(x)); return h; }, digest(enc) { const out = fn(Buffer.concat(parts)); return enc ? out.toString(enc) : out; } };
        return h;
    },
    timingSafeEqual(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i]; return r === 0; },
};
