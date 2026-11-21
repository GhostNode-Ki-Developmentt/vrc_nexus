'use strict';
/*
 * Nexus-Privat-Chat (1:1) – Ende-zu-Ende-verschlüsselt (e2ee.js: X3DH + Double Ratchet), GhostNode ist nur Briefkasten (nexuschat.php).
 *   - Geräte-Schlüssel, Sitzungen und Nachrichtenverlauf liegen NUR auf diesem Gerät, verschlüsselt gespeichert.
 *   - Jede Nachricht geht an alle Geräte der Gegenseite und (zum Abgleich) an die eigenen anderen Geräte.
 *   - Sicherheitsnummer je Kontakt; ändern sich die Geräte-Schlüssel der Gegenseite, wird das deutlich angezeigt.
 *   - Chat ist freiwillig: erst beim ersten Öffnen wird ein Geräte-Schlüssel erzeugt und veröffentlicht.
 * Nur Windows-App (das Android-Krypto-Modul kann X25519/Ed25519/AES-GCM noch nicht).
 * 3.4: Reaktionen, Antworten, Bearbeiten/Löschen, Gelesen-Häkchen, 💓 Puls teilen, Bilder/GIFs (auf dem Gerät mit AES-256-GCM
 *   verschlüsselt, als Chiffretext auf der Webseite – Schlüssel nur in der E2E-Nachricht), Anheften, Merken, Geräte-Übersicht.
 *   Alles läuft als verschlüsselte Steuer-Nachricht über denselben Briefkasten – die Webseite sieht davon nichts.
 */
const crypto = require('crypto');
const E = require('./e2ee');
const { str, int, cut, now, UserError } = require('./util');

const BASE = () => (process.env.NEXUS_CHAT_BASE || process.env.NEXUS_ACCT_BASE || process.env.NEXUS_RELAY_BASE || 'https://privat.sylvanclub.eu').replace(/\/+$/, '');
const UID = /^(?:usr_[0-9a-f-]{36}|[0-9a-z]{10})$/;   // auch kurze IDs älterer Konten
const KEEP = 500;   // Nachrichten je Unterhaltung auf dem Gerät
const EMOJI = ['❤️', '😂', '👍', '😮', '😢', '🔥', '🦊', '🐾'];
const IMG_MAX = 4 * 1048576;   // Bilder bis 4 MB (verschlüsselt ≈ gleich groß, passt sicher durch PHP-Upload-Grenzen)
const MIME = b => b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b.slice(0, 3).toString() === 'GIF' ? 'image/gif'
    : b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : '';
const rid = () => crypto.randomBytes(8).toString('hex');

class Chat {
    constructor(app, crypt) { this.app = app; this.crypt = crypt; this.timer = null; this.error = ''; this.busy = null; this.unread = 0; this.imgs = new Map(); }
    // ---------- verschlüsselter Speicher ----------
    get(k, d) { try { const v = this.app.db.setting(k, ''); return v ? JSON.parse(this.crypt.decrypt(v)) : d; } catch (e) { return d; } }
    put(k, v) { this.app.db.setSetting(k, this.crypt.encrypt(JSON.stringify(v))); }
    me() { const o = this.app.account && this.app.account.current(); if (!o) throw new UserError('Für den Chat erst das Nexus-Konto verbinden (Einstellungen → Erweitert).'); return o; }
    key(k) { return k + ':' + this.me().account.vrc_id; }   // alles getrennt je Nexus-Konto
    async call(a, body) {
        const o = this.me();
        let r;
        try { r = await fetch(BASE() + '/nexuschat.php?a=' + a, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ token: o.token }, body || {})), signal: AbortSignal.timeout(20000) }); }
        catch (e) { throw new UserError('GhostNode-Webseite nicht erreichbar.'); }
        const d = await r.json().catch(() => ({ error: 'Antwort kein JSON – liegt nexuschat.php auf der Webseite?' }));
        if (!r.ok || d.error) throw new UserError(str(d.error) || 'Fehler ' + r.status + '.');
        return d;
    }

    // ---------- Gerät ----------
    async device() {
        let dev = this.get(this.key('chat_dev'), null);
        if (!dev) { dev = E.newDevice(50); this.put(this.key('chat_dev'), dev); }
        if (!dev.published || (dev.pendingOpks || []).length) {
            const d = await this.call('publish', E.bundle(dev));
            dev.id = d.device; dev.published = Date.now(); dev.pendingOpks = [];
            this.put(this.key('chat_dev'), dev);
        }
        if (Date.now() - (dev.spk.at || 0) > 7 * 86400000) { E.rotateSpk(dev); this.put(this.key('chat_dev'), dev); await this.call('publish', E.bundle(dev)); }
        return dev;
    }
    sessions() { return this.get(this.key('chat_sess'), {}); }
    convs() { return this.get(this.key('chat_msgs'), {}); }
    known() { return this.get(this.key('chat_known'), {}); }

    // ---------- Senden ----------
    async send(uid, text, extra) {
        uid = str(uid).toLowerCase();
        text = cut(str(text).replace(/\r/g, ''), 4000).trim();
        extra = extra || {};
        if (!text && !extra.img && !extra.hr) throw new UserError('Leere Nachricht.');
        const msg = Object.assign({ t: extra.hr ? 'hr' : 'msg', id: rid(), text, at: Date.now(), conv: uid }, extra.reply ? { reply: extra.reply } : {}, extra.img ? { img: extra.img } : {}, extra.hr ? { hr: extra.hr } : {});
        await this.sendPayload(uid, msg);
        this.apply(uid, msg, true);
        return msg;
    }
    /** Steuer-Nachricht (Reaktion, Bearbeiten, Löschen, Gelesen) – geht verschlüsselt an beide Seiten und wird hier sofort angewendet */
    async control(uid, p) {
        uid = str(uid).toLowerCase();
        const msg = Object.assign({ id: rid(), at: Date.now(), conv: uid }, p);
        await this.sendPayload(uid, msg);
        this.apply(uid, msg, true);
        return msg;
    }
    async sendPayload(uid, msg) {
        if (!UID.test(uid)) throw new UserError('Ungültige VRChat-User-ID.');
        const dev = await this.device(), mine = this.me().account.vrc_id;
        if (uid === mine) throw new UserError('An dich selbst geht nicht.');
        const sess = this.sessions();
        const out = [];
        for (const target of [uid, mine]) {
            const devs = (await this.call('devices', { uid: target })).devices.filter(d => d.device !== dev.id);
            if (target === uid) { if (!devs.length) throw new UserError('Diese Person hat den Chat noch nicht eingerichtet (muss Nexus-Community → Chat einmal öffnen).'); this.checkKeys(uid, devs); }
            const need = devs.filter(d => !sess[target + '|' + d.device]).map(d => d.device);
            if (need.length) {
                const b = await this.call('bundles', { uid: target, skip: devs.map(d => d.device).filter(x => !need.includes(x)) });
                for (const x of b.bundles) if (need.includes(x.device)) sess[target + '|' + x.device] = E.initiate(dev, x);
            }
            for (const d of devs) {
                const st = sess[target + '|' + d.device];
                if (!st) continue;
                const env = E.encrypt(st, JSON.stringify(Object.assign({}, msg, target === mine ? { sync: 1 } : {})));
                out.push({ to: target, dev: d.device, body: JSON.stringify(env) });
            }
        }
        this.put(this.key('chat_sess'), sess);
        if (out.length) await this.call('send', { device: dev.id, msgs: out });
        return msg;
    }
    /** eine (empfangene oder eigene) Nachricht auf den Verlauf anwenden */
    apply(conv, p, fromMe) {
        const c = this.convs(), l = c[conv] = c[conv] || [];
        const find = id => l.find(x => x.id === str(id));
        const at = Math.min(Date.now(), int(p.at) || Date.now());
        if (p.t === 'msg' || p.t === 'hr') {
            if (find(p.id)) return false;
            const m = { id: str(p.id), me: fromMe, text: cut(str(p.text), 4000), at };
            if (p.reply && typeof p.reply === 'object') m.reply = { id: str(p.reply.id), text: cut(str(p.reply.text), 140), me: !!p.reply.me };
            if (p.img && typeof p.img === 'object' && /^[0-9a-f]{32}$/.test(str(p.img.b))) m.img = { b: str(p.img.b), k: str(p.img.k), n: str(p.img.n), m: /^image\/(png|jpeg|gif|webp)$/.test(str(p.img.m)) ? str(p.img.m) : 'image/png', s: int(p.img.s) };
            if (p.t === 'hr') m.hr = Math.max(0, Math.min(300, int(p.hr)));
            l.push(m); l.sort((a, b) => a.at - b.at);
            if (l.length > KEEP) l.splice(0, l.length - KEEP);
        } else if (p.t === 'react') {
            const m = find(p.ref); if (!m || m.deleted || !EMOJI.includes(str(p.emoji))) return false;
            const who = fromMe ? 'me' : 'them', r = m.reacts = m.reacts || {}, list = r[p.emoji] = (r[p.emoji] || []).filter(x => x !== who);
            if (p.on !== false) list.push(who);
            if (!list.length) delete r[p.emoji];
        } else if (p.t === 'edit') {
            const m = find(p.ref); if (!m || m.me !== fromMe || m.deleted) return false;
            m.text = cut(str(p.text), 4000); m.edited = at;
        } else if (p.t === 'del') {
            const m = find(p.ref); if (!m || m.me !== fromMe) return false;
            Object.assign(m, { deleted: true, text: '', reacts: {} }); delete m.img; delete m.hr; delete m.reply;
        } else if (p.t === 'read') {
            if (fromMe) return false;   // eigene andere Geräte: nichts zu tun
            for (const m of l) if (m.me && m.at <= int(p.upto)) m.read = true;
        } else return false;
        this.put(this.key('chat_msgs'), c);
        return true;
    }
    /** Geräte-Schlüssel der Gegenseite merken – Änderung = Warnung (möglicher Mitleser) */
    checkKeys(uid, devs) {
        const k = this.known(), now_ = devs.map(d => d.ik_sig).sort();
        const was = k[uid];
        if (!was) k[uid] = { keys: now_, verified: false, changed: false };
        else if (JSON.stringify(was.keys) !== JSON.stringify(now_)) { const added = now_.some(x => !was.keys.includes(x)); k[uid] = { keys: now_, verified: added ? false : was.verified, changed: added || was.changed }; }
        this.put(this.key('chat_known'), k);
        return k[uid];
    }
    store(uid, m) {
        const c = this.convs();
        const l = c[uid] = c[uid] || [];
        if (l.some(x => x.id === m.id)) return;
        l.push(m); l.sort((a, b) => a.at - b.at);
        if (l.length > KEEP) l.splice(0, l.length - KEEP);
        this.put(this.key('chat_msgs'), c);
    }

    // ---------- Empfangen ----------
    async poll() {
        if (this.busy) return this.busy;
        this.busy = (async () => {
            const dev = await this.device(), mine = this.me().account.vrc_id;
            const d = await this.call('fetch', { device: dev.id });
            const sess = this.sessions(), ids = [];
            let got = 0, devChanged = false;
            for (const m of d.msgs) {
                ids.push(m.id);
                let env; try { env = JSON.parse(m.body); } catch (e) { continue; }
                const sk = m.from + '|' + m.from_dev;
                try {
                    let st = sess[sk];
                    // neue Sitzung, wenn die Gegenseite (neu) mit Pre-Key-Kopf beginnt
                    if (env.pre && (!st || st.preEk !== env.pre.ek)) {
                        if (env.pre.ik_sig && E.deviceId(env.pre.ik_sig) !== m.from_dev) throw new Error('Gerät passt nicht zum Schlüssel.');
                        const a = E.accept(dev, env.pre);
                        if (a.opk) { delete dev.opks[a.opk]; devChanged = true; }
                        st = a.st; st.preEk = env.pre.ek;
                    }
                    if (!st) throw new Error('Keine Sitzung.');
                    const r = E.decrypt(st, env);
                    sess[sk] = r.st;
                    const p = JSON.parse(r.text);
                    const conv = m.from === mine ? str(p.conv).toLowerCase() : m.from;   // Abgleich von eigenen Geräten
                    if (!UID.test(conv)) continue;
                    if (!p.at) p.at = m.at * 1000;
                    const added = this.apply(conv, p, m.from === mine);
                    if (added && m.from !== mine && (p.t === 'msg' || p.t === 'hr')) { got++; this.unreadMark(conv); }
                } catch (e) { this.store(m.from === mine ? 'system' : m.from, { id: 'err' + m.id, sys: true, text: '⚠ Nachricht konnte nicht entschlüsselt werden (' + e.message + ').', at: m.at * 1000 }); }
            }
            this.put(this.key('chat_sess'), sess);
            if (devChanged) this.put(this.key('chat_dev'), dev);
            if (ids.length) await this.call('ack', { device: dev.id, ids });
            if (d.opks < 15) { E.addOpks(dev, 40); this.put(this.key('chat_dev'), dev); await this.device(); }
            this.error = '';
            if (got && this.app.tools && this.app.tools.host && this.app.tools.host.notify && !this.focus) this.app.tools.host.notify('💬 Neue Nachricht', got + ' neue verschlüsselte Nachricht' + (got === 1 ? '' : 'en'), false);
            return got;
        })().catch(e => { this.error = e.message; throw e; }).finally(() => { this.busy = null; });
        return this.busy;
    }
    unreadMark(uid) { const u = this.get(this.key('chat_unread'), {}); u[uid] = (u[uid] || 0) + 1; this.put(this.key('chat_unread'), u); }
    start() {
        clearInterval(this.timer);
        this.timer = setInterval(() => { try { if (this.get(this.key('chat_dev'), null)) this.poll().catch(() => {}); } catch (e) { /* kein Konto */ } }, 20000);
        if (this.timer.unref) this.timer.unref();
    }
    stop() { clearInterval(this.timer); }

    list() {
        const c = this.convs(), u = this.get(this.key('chat_unread'), {}), k = this.known();
        const names = {};
        try { for (const f of this.app.vrc.friendList()) names[f.id] = f.name; } catch (e) { /* ohne Freunde */ }
        return Object.entries(c).filter(([id]) => UID.test(id)).map(([id, l]) => ({ uid: id, name: names[id] || '', last: l[l.length - 1], unread: u[id] || 0, changed: !!(k[id] && k[id].changed), verified: !!(k[id] && k[id].verified) }))
            .sort((a, b) => (b.last ? b.last.at : 0) - (a.last ? a.last.at : 0));
    }
    async open(uid) {
        uid = str(uid).toLowerCase();
        if (!UID.test(uid)) throw new UserError('Ungültige VRChat-User-ID.');
        const dev = await this.device();
        const u = this.get(this.key('chat_unread'), {}); delete u[uid]; this.put(this.key('chat_unread'), u);
        let safety = '', devices = [], info = null;
        try {
            const theirs = (await this.call('devices', { uid })).devices, mine = (await this.call('devices', { uid: this.me().account.vrc_id })).devices;
            devices = theirs.map(d => ({ device: d.device, created: d.created }));
            info = theirs.length ? this.checkKeys(uid, theirs) : null;
            if (theirs.length) safety = E.safetyNumber(mine.map(d => d.ik_sig).concat(mine.some(d => d.device === dev.id) ? [] : [dev.idSig.pub]), theirs.map(d => d.ik_sig));
        } catch (e) { this.error = e.message; }
        const k = this.known()[uid] || {};
        // Gelesen-Häkchen: einmal je neuem Stand, abschaltbar
        const msgs = this.convs()[uid] || [], last = msgs.filter(m => !m.me && !m.deleted).pop(), meta = this.meta(), cm = meta[uid] = meta[uid] || {};
        if (this.prefs().receipts && last && last.at > (cm.readSent || 0) && devices.length) {
            cm.readSent = last.at; this.put(this.key('chat_meta'), meta);
            await this.control(uid, { t: 'read', upto: last.at }).catch(() => {});
        }
        const favs = this.favs().filter(f => f.conv === uid).map(f => f.id);
        return { uid, messages: this.convs()[uid] || [], pins: cm.pins || [], favs, emoji: EMOJI, prefs: this.prefs(), safety, devices, ready: devices.length > 0, verified: !!k.verified, changed: !!k.changed, error: this.error };
    }
    meta() { return this.get(this.key('chat_meta'), {}); }
    favs() { return this.get(this.key('chat_favs'), []); }
    prefs() { return Object.assign({ receipts: true }, this.get(this.key('chat_prefs'), {})); }
    msgOf(uid, id) { const m = (this.convs()[str(uid).toLowerCase()] || []).find(x => x.id === str(id)); if (!m) throw new UserError('Nachricht nicht gefunden.'); return m; }
    /** Bild verschlüsseln und als Chiffretext hochladen – der Schlüssel geht nur in der E2E-Nachricht mit */
    async sendImage(uid, file, caption) {
        const buf = file && file.buffer ? Buffer.from(file.buffer) : null;
        if (!buf || !buf.length) throw new UserError('Kein Bild gewählt.');
        if (buf.length > IMG_MAX) throw new UserError('Bild zu groß (max. 4 MB).');
        const mime = MIME(buf);
        if (!mime) throw new UserError('Nur PNG, JPEG, GIF oder WebP.');
        const key = crypto.randomBytes(32), iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
        const ct = Buffer.concat([c.update(buf), c.final(), c.getAuthTag()]);
        const up = await this.call('blob_put', { data: ct.toString('base64'), allow: [str(uid).toLowerCase()] });
        return this.send(uid, caption, { img: { b: str(up.id), k: key.toString('base64'), n: iv.toString('base64'), m: mime, s: buf.length } });
    }
    /** Bild für die Oberfläche: nexus.php?chimg=<uid>:<msgid> – laden, entschlüsseln, kurz im Speicher halten */
    async image(ref) {
        const [uid, id] = str(ref).toLowerCase().split(':');
        const m = UID.test(uid || '') && /^[0-9a-f]{16}$/.test(id || '') ? (this.convs()[uid] || []).find(x => x.id === id) : null;
        if (!m || !m.img) return { status: 404, headers: {}, body: '' };
        let body = this.imgs.get(m.img.b);
        if (!body) {
            const o = this.me();
            let r;
            try { r = await fetch(BASE() + '/nexuschat.php?a=blob_get', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: o.token, id: m.img.b }), signal: AbortSignal.timeout(30000) }); }
            catch (e) { return { status: 502, headers: {}, body: '' }; }
            if (!r.ok || !/octet-stream/.test(r.headers.get('content-type') || '')) return { status: 404, headers: {}, body: '' };
            const ct = Buffer.from(await r.arrayBuffer());
            try {
                const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(m.img.k, 'base64'), Buffer.from(m.img.n, 'base64'));
                d.setAuthTag(ct.subarray(ct.length - 16));
                body = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
            } catch (e) { return { status: 422, headers: {}, body: '' }; }
            this.imgs.set(m.img.b, body);
            if (this.imgs.size > 40) this.imgs.delete(this.imgs.keys().next().value);
        }
        return { status: 200, headers: { 'Content-Type': m.img.m, 'Cache-Control': 'no-store' }, body };
    }
    async action(act, input, files) {
        switch (act) {
            case 'chat_list': { await this.device(); if (input.poll === '1') await this.poll().catch(() => {}); return { items: this.list(), error: this.error, device: (this.get(this.key('chat_dev'), null) || {}).id || '' }; }
            case 'chat_open': { this.focus = true; await this.poll().catch(() => {}); return await this.open(input.uid); }
            case 'chat_send': { const m = await this.send(input.uid, input.text); return Object.assign(await this.open(input.uid), { sent: m.id }); }
            case 'chat_verify': { const uid = str(input.uid).toLowerCase(); const k = this.known(); if (!k[uid]) throw new UserError('Noch keine Schlüssel bekannt.'); k[uid].verified = input.on !== '0'; k[uid].changed = false; this.put(this.key('chat_known'), k); return await this.open(uid); }
            case 'chat_blur': this.focus = false; return { ok: true };
            // ---- 3.4 ----
            case 'chat_react': { const m = this.msgOf(input.uid, input.ref), on = !((m.reacts || {})[input.emoji] || []).includes('me'); await this.control(input.uid, { t: 'react', ref: m.id, emoji: str(input.emoji), on }); return await this.open(input.uid); }
            case 'chat_edit': { const m = this.msgOf(input.uid, input.ref); if (!m.me || m.deleted) throw new UserError('Nur eigene Nachrichten.'); const t = cut(str(input.text).replace(/\r/g, ''), 4000).trim(); if (!t) throw new UserError('Leere Nachricht.'); await this.control(input.uid, { t: 'edit', ref: m.id, text: t }); return await this.open(input.uid); }
            case 'chat_delete': { const m = this.msgOf(input.uid, input.ref); if (!m.me) throw new UserError('Nur eigene Nachrichten.'); await this.control(input.uid, { t: 'del', ref: m.id }); return await this.open(input.uid); }
            case 'chat_reply': {   // Antworten: zitiert einen Ausschnitt der Nachricht
                const m = this.msgOf(input.uid, input.ref);
                const sent = await this.send(input.uid, input.text, { reply: { id: m.id, text: cut(m.deleted ? '' : (m.text || (m.img ? '🖼 Bild' : m.hr ? '💓 ' + m.hr + ' bpm' : '')), 140), me: !m.me } });
                return Object.assign(await this.open(input.uid), { sent: sent.id });
            }
            case 'chat_img': { const sent = await this.sendImage(input.uid, files && files.file, input.text); return Object.assign(await this.open(input.uid), { sent: sent.id }); }
            case 'chat_hr': {
                const h = this.app.heart && this.app.heart.status();
                if (!h || !h.active || !h.bpm) throw new UserError('Gerade kein Puls – Quelle unter Spiel & OSC → 💓 Puls einrichten.');
                await this.send(input.uid, '', { hr: h.bpm });
                return await this.open(input.uid);
            }
            case 'chat_pin': {
                const uid = str(input.uid).toLowerCase(), m = this.msgOf(uid, input.ref), meta = this.meta(), cm = meta[uid] = meta[uid] || {};
                const had = (cm.pins || []).includes(m.id);
                cm.pins = (cm.pins || []).filter(x => x !== m.id);
                if (!had) cm.pins.unshift(m.id);
                cm.pins = cm.pins.slice(0, 10);
                this.put(this.key('chat_meta'), meta);
                return await this.open(uid);
            }
            case 'chat_fav': { const uid = str(input.uid).toLowerCase(), m = this.msgOf(uid, input.ref); let f = this.favs(); const had = f.some(x => x.conv === uid && x.id === m.id); f = f.filter(x => !(x.conv === uid && x.id === m.id)); if (!had) f.unshift({ conv: uid, id: m.id, at: Date.now() }); this.put(this.key('chat_favs'), f.slice(0, 300)); return await this.open(uid); }
            case 'chat_favs': {
                const c = this.convs(), names = {};
                try { for (const f of this.app.vrc.friendList()) names[f.id] = f.name; } catch (e) { /* egal */ }
                return { items: this.favs().map(f => { const m = (c[f.conv] || []).find(x => x.id === f.id); return m ? { conv: f.conv, name: names[f.conv] || '', msg: m } : null; }).filter(Boolean) };
            }
            case 'chat_prefs': { const p = this.prefs(); if (input.receipts !== undefined) p.receipts = input.receipts === '1' || input.receipts === true; this.put(this.key('chat_prefs'), p); return { prefs: p, msg: 'Gespeichert.' }; }
            case 'chat_devices': {
                const dev = await this.device(), mine = (await this.call('devices', { uid: this.me().account.vrc_id })).devices;
                return { device: dev.id, items: mine.map(d => ({ device: d.device, created: int(d.created), last_seen: int(d.last_seen), current: d.device === dev.id })) };
            }
            case 'chat_device_remove': {
                const dev = await this.device();
                if (str(input.device) === dev.id) throw new UserError('Dieses Gerät kann sich nicht selbst entfernen.');
                await this.call('remove', { device: str(input.device) });
                return Object.assign(await this.action('chat_devices', {}), { msg: 'Gerät entfernt – es bekommt keine Nachrichten mehr.' });
            }
            case 'chat_clear': { const c = this.convs(); delete c[str(input.uid).toLowerCase()]; this.put(this.key('chat_msgs'), c); return { items: this.list() }; }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { Chat };
