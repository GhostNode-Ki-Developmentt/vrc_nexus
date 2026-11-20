'use strict';
/*
 * Nexus-Konto (GhostNode, nexusacct.php): ein zentrales Konto an der VRChat-User-ID – ohne eigenes Passwort.
 *   Verbinden: Code holen → (mit Zustimmung) kurz in die eigene VRChat-Bio schreiben → GhostNode liest die Bio über
 *   sein Dienst-Konto → Geräte-Token → Bio wird wiederhergestellt.
 *   Altersfreigabe „Verified 18+“ prüft NUR der Server (VRChat ageVerificationStatus = 18+, sichtbar), alle 7 Tage neu.
 *   NSFW: standardmäßig aus, nur mit gültiger Freigabe einschaltbar, jederzeit ausschaltbar.
 * Online-Dienst = opt-in: ohne Verbinden passiert nichts.
 */
const { str, int, now, UserError, sleep } = require('./util');

const BASE = () => (process.env.NEXUS_ACCT_BASE || process.env.NEXUS_RELAY_BASE || 'https://privat.sylvanclub.eu').replace(/\/+$/, '');
const REFRESH = 3 * 3600 * 1000;

class Account {
    constructor(app, crypt) {
        this.app = app; this.crypt = crypt;
        this.error = ''; this.at = 0; this.busy = null;
    }
    // ---------- Speicher (Token verschlüsselt) ----------
    load() { try { return JSON.parse(this.crypt.decrypt(this.app.db.setting('nexus_acct', '')) || '{}') || {}; } catch (e) { return {}; } }
    store(o) { this.app.db.setSetting('nexus_acct', o && o.token ? this.crypt.encrypt(JSON.stringify(o)) : ''); }
    myId() { const a = this.app.vrc.account(); return a ? str(a.vrc_id).toLowerCase() : ''; }
    /** gespeichertes Konto – nur wenn es zum angemeldeten VRChat-Konto gehört */
    current() { const o = this.load(); return o.token && o.account && o.account.vrc_id === this.myId() ? o : null; }
    /** Freigabe-Stand (zwischengespeichert vom Server; läuft lokal mit age_until ab) */
    age() {
        const o = this.current(), a = o ? o.account : null;
        const verified = !!(a && a.verified18 && int(a.age_until) > now());
        return { connected: !!a, verified, nsfw_on: verified && !!a.nsfw_on, age_until: a ? int(a.age_until) : 0, age_status: a ? str(a.age_status) : '', name: a ? str(a.name) : '' };
    }

    async call(a, body, token) {
        let r;
        try { r = await fetch(BASE() + '/nexusacct.php?a=' + a, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign(token ? { token } : {}, body || {})), signal: AbortSignal.timeout(15000) }); }
        catch (e) { throw new UserError('GhostNode-Webseite nicht erreichbar.'); }
        const d = await r.json().catch(() => ({ error: 'Antwort kein JSON – liegt nexusacct.php auf der Webseite?' }));
        if (r.status === 401 && token) { this.store(null); this.notifyAccess(); }
        if (!r.ok || d.error) throw new UserError(str(d.error) || 'Fehler ' + r.status + '.');
        return d;
    }
    save(account) {
        const o = this.current();
        if (!o) return;
        o.account = account; o.at = Date.now();
        this.store(o);
        this.notifyAccess();
    }
    /** NSFW-Bereich neu bewerten (z. B. Freigabe entzogen → Spielzeuge stoppen) */
    notifyAccess() {
        const nsfw = this.app.nsfw;
        if (nsfw && !nsfw.access().unlocked) {
            if (this.app.toys && this.app.toys.stopAll) Promise.resolve().then(() => this.app.toys.stopAll()).catch(() => {});
        }
    }
    /** Stand vom Server holen (beim Start und alle 6 h) */
    async refresh(force) {
        const o = this.current();
        if (!o) return null;
        if (!force && Date.now() - this.at < REFRESH) return o.account;
        if (this.busy) return this.busy;
        this.busy = (async () => {
            const before = this.age().verified;
            try {
                let d = await this.call('me', {}, o.token);
                // Vorwarnung: weniger als 1 Tag gültig → jetzt schon neu prüfen lassen (statt am Ablauftag plötzlich gesperrt)
                if (d.account.verified18 && int(d.account.age_until) - now() < 86400) d = await this.call('recheck', {}, o.token).catch(() => d);
                this.save(d.account); this.devices = d.devices || this.devices || []; this.error = '';
                if (before && !d.account.verified18) this.warnLost(d.account);
            }
            catch (e) { this.error = e.message; }
            finally { this.at = Date.now(); this.busy = null; }
            const c = this.current(); return c ? c.account : null;
        })();
        return this.busy;
    }
    /** nur bei Problemen melden: Freigabe ist weg */
    warnLost(a) {
        const title = '🔞 „Verified 18+“ ist abgelaufen', body = 'VRChat zeigt keinen sichtbaren 18+-Status mehr (' + (str(a.age_status) || 'unbekannt') + '). NSFW ist gesperrt – Status in VRChat sichtbar machen und „18+ neu prüfen“.';
        this.lost = { at: Date.now(), title, body };
        const t = this.app.tools;
        if (t) { t.log.unshift({ ts: now(), title, body }); t.log = t.log.slice(0, 50); if (t.host && t.host.notify) t.host.notify(title, body, false); }
    }
    start() {
        this.refresh(true).catch(() => {});
        this.timer = setInterval(() => this.refresh().catch(() => {}), 15 * 60000);
        if (this.timer.unref) this.timer.unref();
    }
    stop() { clearInterval(this.timer); }

    // ---------- Verbinden per Bio-Code ----------
    async connect(auto, device) {
        const id = this.myId();
        if (!id) throw new UserError('Erst bei VRChat anmelden.');
        const c = await this.call('code', { vrc_id: id });
        if (!auto) { this.pending = { code: c.code, expires: c.expires }; return { code: c.code, expires: c.expires, msg: 'Code in deine VRChat-Bio schreiben, dann „Prüfen“.' }; }
        const t = this.app.tools;
        const me = await t.call('GET', '/users/' + encodeURIComponent(id));
        const old = str(me && me.bio);
        const bio = (old ? old.slice(0, 500 - c.code.length - 1) + ' ' : '') + c.code;
        await t.call('PUT', '/users/' + encodeURIComponent(id), {}, { bio });
        try {
            let last;
            for (let i = 0; i < 4; i++) {
                await sleep(i ? 3000 : 1500);
                try { return await this.finish(device); } catch (e) { last = e; if (!/Bio/.test(e.message)) throw e; }
            }
            throw last;
        } finally {
            try { await t.call('PUT', '/users/' + encodeURIComponent(id), {}, { bio: old }); } catch (e) { this.error = 'Bitte den Code „' + c.code + '“ selbst wieder aus der VRChat-Bio löschen.'; }
        }
    }
    async finish(device) {
        const id = this.myId();
        const d = await this.call('verify', { vrc_id: id, device: str(device) || (process.platform === 'win32' ? 'Windows-PC' : this.app.mobile ? 'Handy' : 'Gerät') });
        this.store({ token: d.token, account: d.account, at: Date.now() });
        this.pending = null; this.at = Date.now();
        this.notifyAccess();
        return { account: d.account, msg: '🪪 Nexus-Konto verbunden.' };
    }

    /** Ist die andere Person Verified 18+ mit NSFW an? (Server-Abfrage, 5 min zwischengespeichert) */
    async peer(uid) {
        uid = str(uid).toLowerCase();
        this.peers = this.peers || new Map();
        const c = this.peers.get(uid);
        if (c && Date.now() - c.at < 300000) return c.ok;
        const o = this.current();
        if (!o) throw new UserError('Erst das Nexus-Konto verbinden.');
        const d = await this.call('peer', { uid }, o.token);
        this.peers.set(uid, { ok: !!d.nsfw, at: Date.now() });
        return !!d.nsfw;
    }
    status() {
        const o = this.current();
        return { connected: !!o, account: o ? o.account : null, age: this.age(), devices: this.devices || [], error: this.error, pending: this.pending || null, lost: this.lost || null, server: BASE() };
    }
    async action(act, input) {
        const o = () => { const c = this.current(); if (!c) throw new UserError('Erst das Nexus-Konto verbinden.'); return c; };
        switch (act) {
            case 'acct_get': if (input.refresh === '1') await this.refresh(true); return this.status();
            case 'acct_connect': { const r = await this.connect(input.auto === '1', input.device); return Object.assign(this.status(), r); }
            case 'acct_verify': { const r = await this.finish(input.device); return Object.assign(this.status(), r); }
            case 'acct_nsfw': {
                const on = input.on === '1' || input.on === true;
                const d = await this.call('nsfw', { on }, o().token);
                this.save(d.account);
                return Object.assign(this.status(), { msg: on ? '🔞 NSFW eingeschaltet.' : 'NSFW ausgeschaltet.' });
            }
            case 'acct_recheck': { const d = await this.call('recheck', {}, o().token); this.save(d.account); return Object.assign(this.status(), { msg: d.account.verified18 ? '✔ Verified 18+' : '✖ Kein sichtbarer 18+-Status bei VRChat.' }); }
            case 'acct_logout': {
                const c = this.current();
                if (c) await this.call('logout', { device: str(input.device) }, c.token).catch(() => {});
                if (!input.device) { this.store(null); this.notifyAccess(); }
                return Object.assign(this.status(), { msg: input.device ? 'Gerät abgemeldet.' : 'Nexus-Konto auf diesem Gerät abgemeldet.' });
            }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { Account };
