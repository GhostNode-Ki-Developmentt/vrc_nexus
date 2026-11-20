'use strict';
/*
 * Ende-zu-Ende-Verschlüsselung für den Nexus-Privat-Chat – eigene Umsetzung der veröffentlichten Signal-Spezifikationen
 * (Entscheidung der Besitzerin): X3DH für den Sitzungsaufbau, Double Ratchet für jede Nachricht.
 *   https://signal.org/docs/specifications/x3dh/   https://signal.org/docs/specifications/doubleratchet/
 * Bausteine nur aus Node-crypto: X25519 (DH), Ed25519 (Signaturen), HKDF-SHA256, HMAC-SHA256, AES-256-GCM.
 * Abweichung von Signal: getrennte Schlüssel für DH (X25519) und Signatur (Ed25519) statt XEdDSA; AEAD = AES-256-GCM.
 * Der Server sieht nur öffentliche Schlüssel und Chiffretexte.
 */
const crypto = require('crypto');

const INFO_X3DH = Buffer.from('NexusX3DH-v1');
const INFO_RK = Buffer.from('NexusRatchetRK-v1');
const INFO_MK = Buffer.from('NexusMessageKey-v1');
const MAX_SKIP = 1000;
const b64 = b => Buffer.from(b).toString('base64');
const unb64 = s => Buffer.from(String(s || ''), 'base64');

// ---------- Schlüssel ----------
const RAW_X = Buffer.from('302a300506032b656e032100', 'hex');   // SPKI-Präfix X25519
const RAW_E = Buffer.from('302a300506032b6570032100', 'hex');   // SPKI-Präfix Ed25519
function genX() { const k = crypto.generateKeyPairSync('x25519'); return { pub: k.publicKey.export({ type: 'spki', format: 'der' }).subarray(12), priv: k.privateKey.export({ type: 'pkcs8', format: 'der' }) }; }
function genE() { const k = crypto.generateKeyPairSync('ed25519'); return { pub: k.publicKey.export({ type: 'spki', format: 'der' }).subarray(12), priv: k.privateKey.export({ type: 'pkcs8', format: 'der' }) }; }
const xPub = raw => { const r = unb64(raw); if (r.length !== 32) throw new Error('Öffentlicher Schlüssel ungültig.'); return crypto.createPublicKey({ key: Buffer.concat([RAW_X, r]), format: 'der', type: 'spki' }); };
const ePub = raw => { const r = unb64(raw); if (r.length !== 32) throw new Error('Signaturschlüssel ungültig.'); return crypto.createPublicKey({ key: Buffer.concat([RAW_E, r]), format: 'der', type: 'spki' }); };
const xPriv = der => crypto.createPrivateKey({ key: unb64(der), format: 'der', type: 'pkcs8' });
function dh(privDer, pubRaw) {
    const out = crypto.diffieHellman({ privateKey: xPriv(privDer), publicKey: xPub(pubRaw) });
    if (out.every(x => x === 0)) throw new Error('Ungültiger DH-Wert.');   // Schutz gegen Null-Punkte
    return out;
}
const sign = (privDer, data) => crypto.sign(null, data, crypto.createPrivateKey({ key: unb64(privDer), format: 'der', type: 'pkcs8' }));
const verify = (pubRaw, data, sig) => { try { return crypto.verify(null, data, ePub(pubRaw), unb64(sig)); } catch (e) { return false; } };
const hkdf = (ikm, salt, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const ser = k => ({ pub: b64(k.pub), priv: b64(k.priv) });

/** Neues Gerät: Identität (DH + Signatur), signierter Pre-Key, Einmal-Pre-Keys */
function newDevice(opkCount = 50) {
    const idDh = ser(genX()), idSig = ser(genE());
    const dev = { v: 1, idDh, idSig, spk: null, opks: {}, nextOpk: 1, spkId: 0 };
    rotateSpk(dev);
    addOpks(dev, opkCount);
    return dev;
}
function rotateSpk(dev) {
    const k = ser(genX());
    dev.spkId = (dev.spkId || 0) + 1;
    const old = dev.spk;
    dev.spk = { id: dev.spkId, pub: k.pub, priv: k.priv, sig: b64(sign(dev.idSig.priv, Buffer.concat([Buffer.from('spk'), unb64(k.pub), unb64(dev.idDh.pub)]))), at: Date.now() };
    if (old) { dev.oldSpk = dev.oldSpk || {}; dev.oldSpk[old.id] = { priv: old.priv, at: Date.now() }; }   // alte noch kurz behalten (Nachrichten unterwegs)
    for (const [id, o] of Object.entries(dev.oldSpk || {})) if (Date.now() - o.at > 30 * 86400000) delete dev.oldSpk[id];
    return dev;
}
function addOpks(dev, n) {
    const out = [];
    for (let i = 0; i < n; i++) { const k = ser(genX()), id = dev.nextOpk++; dev.opks[id] = k.priv; out.push({ id, pub: k.pub }); }
    dev.pendingOpks = (dev.pendingOpks || []).concat(out);
    return out;
}
/** öffentliches Paket für den Server */
function bundle(dev) {
    return { ik_dh: dev.idDh.pub, ik_sig: dev.idSig.pub, spk: { id: dev.spk.id, pub: dev.spk.pub, sig: dev.spk.sig }, opks: dev.pendingOpks || [] };
}
const deviceId = idSigPub => crypto.createHash('sha256').update(unb64(idSigPub)).digest('hex').slice(0, 16);
/** Sicherheitsnummer (60 Ziffern) über beide Identitäten – unabhängig von der Reihenfolge */
function safetyNumber(myKeys, theirKeys) {
    const part = keys => { const h = crypto.createHash('sha256'); for (const k of keys.slice().sort()) h.update(unb64(k)); let d = h.digest(); for (let i = 0; i < 2000; i++) d = crypto.createHash('sha256').update(d).digest(); const e = crypto.createHash('sha256').update(Buffer.concat([d, Buffer.from([1])])).digest(); d = Buffer.concat([d, e]); let s = ''; for (let i = 0; i < 30; i += 5) s += String(d.readUIntBE(i, 5) % 100000).padStart(5, '0'); return s; };
    const a = part(myKeys), b = part(theirKeys);
    return (a < b ? a + b : b + a).match(/.{5}/g).join(' ');
}

// ---------- X3DH ----------
/** Absender: Sitzung mit einem Geräte-Paket des Empfängers aufbauen */
function initiate(dev, b) {
    const ok = verify(b.ik_sig, Buffer.concat([Buffer.from('spk'), unb64(b.spk.pub), unb64(b.ik_dh)]), b.spk.sig);
    if (!ok) throw new Error('Signatur des Pre-Keys ungültig – Sitzung abgebrochen.');
    const ek = ser(genX());
    const parts = [dh(dev.idDh.priv, b.spk.pub), dh(ek.priv, b.ik_dh), dh(ek.priv, b.spk.pub)];
    if (b.opk) parts.push(dh(ek.priv, b.opk.pub));
    const sk = hkdf(Buffer.concat([Buffer.alloc(32, 0xff)].concat(parts)), Buffer.alloc(32), INFO_X3DH, 32);
    const ad = Buffer.concat([unb64(dev.idDh.pub), unb64(dev.idSig.pub), unb64(b.ik_dh), unb64(b.ik_sig)]);
    const st = ratchetInitA(sk, b.spk.pub);
    st.ad = b64(ad);
    st.remote = { ik_dh: b.ik_dh, ik_sig: b.ik_sig };
    st.pre = { ik_dh: dev.idDh.pub, ik_sig: dev.idSig.pub, ek: ek.pub, spk: b.spk.id, opk: b.opk ? b.opk.id : 0 };   // bis zur ersten Antwort mitschicken
    return st;
}
/** Empfänger: erste Nachricht mit Pre-Key-Kopf → Sitzung */
function accept(dev, pre) {
    const spkPriv = pre.spk === dev.spk.id ? dev.spk.priv : dev.oldSpk && dev.oldSpk[pre.spk] && dev.oldSpk[pre.spk].priv;
    if (!spkPriv) throw new Error('Unbekannter signierter Pre-Key.');
    const parts = [dh(spkPriv, pre.ik_dh), dh(dev.idDh.priv, pre.ek), dh(spkPriv, pre.ek)];
    if (pre.opk) {
        const opk = dev.opks[pre.opk];
        if (!opk) throw new Error('Einmal-Pre-Key schon verbraucht (Wiederholung?).');
        parts.push(dh(opk, pre.ek));
    }
    const sk = hkdf(Buffer.concat([Buffer.alloc(32, 0xff)].concat(parts)), Buffer.alloc(32), INFO_X3DH, 32);
    const ad = Buffer.concat([unb64(pre.ik_dh), unb64(pre.ik_sig), unb64(dev.idDh.pub), unb64(dev.idSig.pub)]);
    const st = ratchetInitB(sk, dev.spk.id === pre.spk ? { pub: dev.spk.pub, priv: dev.spk.priv } : null, spkPriv);
    st.ad = b64(ad);
    st.remote = { ik_dh: pre.ik_dh, ik_sig: pre.ik_sig };
    return { st, opk: pre.opk || 0 };
}

// ---------- Double Ratchet ----------
function kdfRk(rk, dhOut) { const o = hkdf(dhOut, unb64(rk), INFO_RK, 64); return [b64(o.subarray(0, 32)), b64(o.subarray(32))]; }
function kdfCk(ck) { const k = unb64(ck); return [b64(hmac(k, Buffer.from([1]))), b64(hmac(k, Buffer.from([2])))]; }   // [Nachrichtenschlüssel, nächste Kette]
function ratchetInitA(sk, bobPub) {
    const dhs = ser(genX());
    const [rk, cks] = kdfRk(b64(sk), dh(dhs.priv, bobPub));
    return { v: 1, dhs, dhr: bobPub, rk, cks, ckr: null, ns: 0, nr: 0, pn: 0, skipped: {} };
}
function ratchetInitB(sk, spk, spkPriv) {
    const dhs = spk ? { pub: spk.pub, priv: spk.priv } : { pub: b64(crypto.createPublicKey(xPriv(spkPriv)).export({ type: 'spki', format: 'der' }).subarray(12)), priv: spkPriv };
    return { v: 1, dhs, dhr: null, rk: b64(sk), cks: null, ckr: null, ns: 0, nr: 0, pn: 0, skipped: {} };
}
const headerBytes = h => Buffer.from(JSON.stringify([h.dh, h.pn, h.n]));
function seal(mk, plain, ad) {
    const o = hkdf(unb64(mk), Buffer.alloc(32), INFO_MK, 44);
    const c = crypto.createCipheriv('aes-256-gcm', o.subarray(0, 32), o.subarray(32));
    c.setAAD(ad);
    const ct = Buffer.concat([c.update(plain), c.final()]);
    return b64(Buffer.concat([ct, c.getAuthTag()]));
}
function open(mk, ct64, ad) {
    const o = hkdf(unb64(mk), Buffer.alloc(32), INFO_MK, 44), ct = unb64(ct64);
    if (ct.length < 16) throw new Error('Nachricht beschädigt.');
    const d = crypto.createDecipheriv('aes-256-gcm', o.subarray(0, 32), o.subarray(32));
    d.setAAD(ad); d.setAuthTag(ct.subarray(ct.length - 16));
    return Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
}
/** verschlüsseln → { h, c, pre? } */
function encrypt(st, text) {
    const [mk, next] = kdfCk(st.cks);
    st.cks = next;
    const h = { dh: st.dhs.pub, pn: st.pn, n: st.ns };
    st.ns++;
    const env = { h, c: seal(mk, Buffer.from(String(text), 'utf8'), Buffer.concat([unb64(st.ad), headerBytes(h)])) };
    if (st.pre) env.pre = st.pre;
    return env;
}
function skip(st, until) {
    if (!st.ckr) return;
    if (until - st.nr > MAX_SKIP) throw new Error('Zu viele übersprungene Nachrichten.');
    while (st.nr < until) {
        const [mk, next] = kdfCk(st.ckr);
        st.ckr = next;
        st.skipped[st.dhr + ':' + st.nr] = mk;
        st.nr++;
    }
    const keys = Object.keys(st.skipped);
    if (keys.length > MAX_SKIP) for (const k of keys.slice(0, keys.length - MAX_SKIP)) delete st.skipped[k];
}
/** entschlüsseln (arbeitet auf einer Kopie – bei Fehler bleibt die Sitzung unverändert) */
function decrypt(st0, env) {
    const st = JSON.parse(JSON.stringify(st0));
    const h = env.h || {};
    if (typeof h.dh !== 'string' || !Number.isInteger(h.n) || !Number.isInteger(h.pn) || h.n < 0 || h.pn < 0) throw new Error('Kopf ungültig.');
    const ad = Buffer.concat([unb64(st.ad), headerBytes(h)]);
    const sk = st.skipped[h.dh + ':' + h.n];
    if (sk) { const p = open(sk, env.c, ad); delete st.skipped[h.dh + ':' + h.n]; return { st, text: p.toString('utf8') }; }
    if (h.dh !== st.dhr) {
        skip(st, h.pn);
        st.pn = st.ns; st.ns = 0; st.nr = 0; st.dhr = h.dh;
        [st.rk, st.ckr] = kdfRk(st.rk, dh(st.dhs.priv, st.dhr));
        st.dhs = ser(genX());
        [st.rk, st.cks] = kdfRk(st.rk, dh(st.dhs.priv, st.dhr));
    }
    skip(st, h.n);
    const [mk, next] = kdfCk(st.ckr);
    st.ckr = next; st.nr++;
    const p = open(mk, env.c, ad);
    delete st.pre;   // Gegenseite hat geantwortet → Pre-Key-Kopf nicht mehr nötig
    return { st, text: p.toString('utf8') };
}

module.exports = { newDevice, rotateSpk, addOpks, bundle, deviceId, safetyNumber, initiate, accept, encrypt, decrypt, MAX_SKIP };
