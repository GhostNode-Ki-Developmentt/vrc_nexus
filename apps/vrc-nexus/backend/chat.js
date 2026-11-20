'use strict';
/*
 * Nexus-Privat-Chat (1:1) – Ende-zu-Ende-verschlüsselt (e2ee.js: X3DH + Double Ratchet), GhostNode ist nur Briefkasten (nexuschat.php).
 *   - Geräte-Schlüssel, Sitzungen und Nachrichtenverlauf liegen NUR auf diesem Gerät, verschlüsselt gespeichert.
 *   - Jede Nachricht geht an alle Geräte der Gegenseite und (zum Abgleich) an die eigenen anderen Geräte.
 *   - Sicherheitsnummer je Kontakt; ändern sich die Geräte-Schlüssel der Gegenseite, wird das deutlich angezeigt.
 *   - Chat ist freiwillig: erst beim ersten Öffnen wird ein Geräte-Schlüssel erzeugt und veröffentlicht.
 * Nur Windows-App (das Android-Krypto-Modul kann X25519/Ed25519/AES-GCM noch nicht).
 */
const crypto = require('crypto');
const E = require('./e2ee');
const { str, int, cut, now, UserError } = require('./util');

const BASE = () => (process.env.NEXUS_CHAT_BASE || process.env.NEXUS_ACCT_BASE || process.env.NEXUS_RELAY_BASE || 'https://privat.sylvanclub.eu').replace(/\/+$/, '');
const UID = /^usr_[0-9a-f-]{36}$/;
const KEEP = 500;   // Nachrichten je Unterhaltung auf dem Gerät

class Chat {
    constructor(app, crypt) { this.app = app; this.crypt = crypt; this.timer = null; this.error = ''; this.busy = null; this.unread = 0; }
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
    async send(uid, text) {
        uid = str(uid).toLowerCase();
        if (!UID.test(uid)) throw new UserError('Ungültige VRChat-User-ID.');
        text = cut(str(text).replace(/\r/g, ''), 4000).trim();
        if (!text) throw new UserError('Leere Nachricht.');
        const dev = await this.device(), mine = this.me().account.vrc_id;
        if (uid === mine) throw new UserError('An dich selbst geht nicht.');
        const sess = this.sessions();
        const msg = { t: 'msg', id: crypto.randomBytes(8).toString('hex'), text, at: Date.now(), conv: uid };
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
        this.store(uid, { id: msg.id, me: true, text, at: msg.at });
        return msg;
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
                    if (p.t !== 'msg') continue;
                    const conv = m.from === mine ? str(p.conv) : m.from;   // Abgleich von eigenen Geräten
                    if (!UID.test(conv)) continue;
                    this.store(conv, { id: str(p.id), me: m.from === mine, text: cut(str(p.text), 4000), at: Math.min(Date.now(), int(p.at) || m.at * 1000) });
                    if (m.from !== mine) { got++; this.unreadMark(conv); }
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
        return { uid, messages: this.convs()[uid] || [], safety, devices, ready: devices.length > 0, verified: !!k.verified, changed: !!k.changed, error: this.error };
    }
    async action(act, input) {
        switch (act) {
            case 'chat_list': { await this.device(); if (input.poll === '1') await this.poll().catch(() => {}); return { items: this.list(), error: this.error, device: (this.get(this.key('chat_dev'), null) || {}).id || '' }; }
            case 'chat_open': { this.focus = true; await this.poll().catch(() => {}); return await this.open(input.uid); }
            case 'chat_send': { const m = await this.send(input.uid, input.text); return Object.assign(await this.open(input.uid), { sent: m.id }); }
            case 'chat_verify': { const uid = str(input.uid).toLowerCase(); const k = this.known(); if (!k[uid]) throw new UserError('Noch keine Schlüssel bekannt.'); k[uid].verified = input.on !== '0'; k[uid].changed = false; this.put(this.key('chat_known'), k); return await this.open(uid); }
            case 'chat_blur': this.focus = false; return { ok: true };
            case 'chat_clear': { const c = this.convs(); delete c[str(input.uid).toLowerCase()]; this.put(this.key('chat_msgs'), c); return { items: this.list() }; }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { Chat };
