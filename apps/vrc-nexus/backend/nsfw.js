'use strict';
/*
 * 🔞 NSFW-Bereich & Admin:
 *  - Besitzer: nur ein VRChat-Konto (im Code steht nur der SHA-256 der User-ID) bekommt Admin & Dashboard-Funktionen.
 *  - Freischalt-Schlüssel: der Besitzer erzeugt sie (Ed25519-unterschrieben), jeder Schlüssel gilt nur für EINE VRChat-User-ID.
 *    Andere Apps prüfen die Unterschrift mit dem öffentlichen Schlüssel des Besitzers (TRUSTED) – fälschen oder weitergeben geht nicht.
 *  - Werkzeuge: Panik-Knopf, Privat-Modus, SFW/NSFW-Avatarpaare, Grenzen-Karte, 18+-Instanz.
 * Inhalte (Bilder/Texte) bringt die App bewusst nicht mit – nur Werkzeuge.
 */
const crypto = require('crypto');
const { str, int, cut, arr, now, UserError } = require('./util');

/** SHA-256 der VRChat-User-ID des Besitzers (die ID selbst steht nicht im Code) */
const OWNER_HASH = '23e799d90cf62600203499e3f4d2712bb1a016e71dac64718b2c7d8267b2789e';
/** öffentliche Schlüssel (Ed25519, SPKI/DER base64), mit denen Freischalt-Schlüssel unterschrieben sein dürfen */
const TRUSTED = [
    'MCowBQYDK2VwAyEAg3Ejm0ec/StudDQryGwNGNr55UKQT3EQYvdPhL3dvo4=',   // Besitzer, erzeugt am 15.11.2026
];
const FEATURES = { nsfw: 'NSFW-Werkzeuge', toys: 'Spielzeug-Steuerung (Intiface)', remote: 'Handy-Fernbedienung', mod: 'Moderator' };
/** Rechte, die den NSFW-Bereich freischalten (Moderator allein schaltet NSFW NICHT frei) */
const NSFW_FEATURES = ['nsfw', 'toys', 'remote'];
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const hashId = id => crypto.createHash('sha256').update(str(id)).digest('hex');
const DEF = { safe_avatar: '', pairs: [], yes: '', maybe: '', no: '', panic_avatar: true, panic_chat: true, panic_private: true, panic_toys: true, group: '' };

class Nsfw {
    constructor(app, crypt) { this.app = app; this.crypt = crypt; this.private = false; this.trusted = TRUSTED.slice(); }
    acc() { return this.app.vrc.account(); }
    myId() { const a = this.acc(); return a ? str(a.vrc_id) : ''; }
    isOwner(id) { const u = id || this.myId(); return !!u && (process.env.NEXUS_OWNER_HASH || OWNER_HASH) === hashId(u); }
    cfg() { try { return Object.assign({}, DEF, JSON.parse(this.app.db.setting('nsfw_cfg', '{}'))); } catch (e) { return Object.assign({}, DEF); } }

    // ---------- Schlüssel des Besitzers ----------
    ownerKey() {
        try { const k = JSON.parse(this.crypt.decrypt(this.app.db.setting('nsfw_owner_key', '')) || 'null'); return k && k.priv ? k : null; } catch (e) { return null; }
    }
    makeOwnerKey() {
        if (!this.isOwner()) throw new UserError('Nur für den Besitzer.');
        if (this.ownerKey()) throw new UserError('Es gibt schon ein Schlüsselpaar.');
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
        const k = { pub: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), priv: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'), at: now() };
        this.app.db.setSetting('nsfw_owner_key', this.crypt.encrypt(JSON.stringify(k)));
        return k.pub;
    }
    keys() { const k = this.ownerKey(), l = this.trusted.slice(); if (k && this.isOwner() && !l.includes(k.pub)) l.push(k.pub); return l; }

    // ---------- Freischalt-Schlüssel ----------
    sign(payload) {
        const k = this.ownerKey();
        if (!k) throw new UserError('Erst ein Schlüsselpaar erzeugen.');
        const body = b64u(JSON.stringify(payload));
        const priv = crypto.createPrivateKey({ key: Buffer.from(k.priv, 'base64'), format: 'der', type: 'pkcs8' });
        return 'NXK1.' + body + '.' + b64u(crypto.sign(null, Buffer.from(body), priv));
    }
    /** Schlüssel prüfen → Inhalt oder Fehlertext */
    check(token, uid) {
        const m = /^NXK1\.([\w-]+)\.([\w-]+)$/.exec(str(token).trim());
        if (!m) return { error: 'Das ist kein VRC-Nexus-Freischalt-Schlüssel.' };
        let ok = false;
        for (const pub of this.keys()) {
            try { ok = crypto.verify(null, Buffer.from(m[1]), crypto.createPublicKey({ key: Buffer.from(pub, 'base64'), format: 'der', type: 'spki' }), unb64u(m[2])); } catch (e) { ok = false; }
            if (ok) break;
        }
        if (!ok) return { error: 'Unterschrift ungültig – der Schlüssel stammt nicht vom Besitzer (oder diese App-Version kennt seinen Schlüssel noch nicht).' };
        let p;
        try { p = JSON.parse(unb64u(m[1]).toString('utf8')); } catch (e) { return { error: 'Schlüssel beschädigt.' }; }
        if (!p.uid || p.uid !== uid) return { error: 'Dieser Schlüssel gehört zu einem anderen VRChat-Konto.' };
        if (p.exp && p.exp < now()) return { error: 'Der Schlüssel ist abgelaufen.' };
        if (this.revoked().includes(p.id)) return { error: 'Der Schlüssel wurde gesperrt.' };
        return { payload: p };
    }
    revoked() { try { return JSON.parse(this.app.db.setting('nsfw_revoked', '[]')) || []; } catch (e) { return []; } }
    myToken() { try { return this.crypt.decrypt(this.app.db.setting('nsfw_token', '')) || ''; } catch (e) { return ''; } }
    /** Was ist für das eingeloggte Konto freigeschaltet? */
    access() {
        const uid = this.myId();
        if (!uid) return { owner: false, unlocked: false, features: [], reason: 'Nicht bei VRChat angemeldet.' };
        if (this.isOwner(uid)) return { owner: true, unlocked: true, key: true, mod: true, features: Object.keys(FEATURES), exp: 0 };
        const t = this.myToken();
        if (!t) return { owner: false, unlocked: false, features: [], reason: '' };
        const r = this.check(t, uid);
        if (r.error) return { owner: false, unlocked: false, features: [], reason: r.error };
        const features = arr(r.payload.f).filter(f => FEATURES[f]);
        return { owner: false, unlocked: features.some(f => NSFW_FEATURES.includes(f)), key: true, mod: features.includes('mod'), features, exp: int(r.payload.exp), note: str(r.payload.n) };
    }
    /** Schlüssel für Online-Dienste (Warnliste): eigener Freischalt-Schlüssel – die Besitzerin unterschreibt sich einen kurzlebigen selbst */
    serviceToken() {
        const uid = this.myId();
        if (!uid) return '';
        if (this.isOwner(uid)) {
            const k = this.ownerKey();
            if (!k) return '';
            return this.sign({ v: 1, id: 'own' + crypto.randomBytes(4).toString('hex'), uid, f: ['mod'], iat: now(), exp: now() + 900 });
        }
        const t = this.myToken();
        return t && !this.check(t, uid).error ? t : '';
    }
    need(f) { const a = this.access(); if (!a.unlocked || (f && !a.features.includes(f))) throw new UserError('Nicht freigeschaltet.'); return a; }

    // ---------- Admin: Schlüssel erzeugen, Liste, sperren ----------
    issued() { try { return JSON.parse(this.app.db.setting('nsfw_issued', '[]')) || []; } catch (e) { return []; } }
    async issue(input) {
        if (!this.isOwner()) throw new UserError('Nur für den Besitzer.');
        const uid = str(input.uid).trim().replace(/^.*\/(usr_[0-9a-f-]{36}).*$/i, '$1');
        if (!/^usr_[0-9a-f-]{36}$/i.test(uid)) throw new UserError('Bitte eine VRChat-User-ID (usr_…) oder einen Profil-Link angeben.');
        let name = cut(str(input.name).trim(), 60);
        if (!name) { try { const u = await this.app.tools.call('GET', '/users/' + encodeURIComponent(uid)); name = str(u && u.displayName); } catch (e) { /* ohne Namen */ } }
        const days = int(input.days);
        const f = arr(String(input.features || 'nsfw,toys,remote').split(',')).map(x => x.trim()).filter(x => FEATURES[x]);
        const payload = { v: 1, id: crypto.randomBytes(6).toString('hex'), uid, f: f.length ? f : ['nsfw'], iat: now(), exp: days > 0 ? now() + days * 86400 : 0, n: cut(str(input.note), 80) };
        const token = this.sign(payload);
        const l = this.issued(); l.unshift({ id: payload.id, uid, name, f: payload.f, iat: payload.iat, exp: payload.exp, note: payload.n, revoked: false });
        this.app.db.setSetting('nsfw_issued', JSON.stringify(l.slice(0, 500)));
        return { token, entry: l[0], msg: 'Schlüssel für ' + (name || uid) + ' erzeugt.' };
    }
    revoke(id, on) {
        if (!this.isOwner()) throw new UserError('Nur für den Besitzer.');
        const l = this.issued(), e = l.find(x => x.id === str(id));
        if (!e) throw new UserError('Nicht gefunden.');
        e.revoked = on !== false;
        this.app.db.setSetting('nsfw_issued', JSON.stringify(l));
        const r = new Set(this.revoked()); if (e.revoked) r.add(e.id); else r.delete(e.id);
        this.app.db.setSetting('nsfw_revoked', JSON.stringify([...r]));
        return { items: l };
    }

    // ---------- Werkzeuge ----------
    saveCfg(c) {
        const cur = this.cfg(), av = v => (/^avtr_[0-9a-f-]{36}$/i.test(str(v).trim()) ? str(v).trim() : '');
        const n = Object.assign({}, cur);
        if (c.safe_avatar !== undefined) n.safe_avatar = av(c.safe_avatar);
        if (c.pairs !== undefined) { let p = c.pairs; if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { p = []; } } n.pairs = arr(p).map(x => ({ name: cut(str(x.name), 40), sfw: av(x.sfw), nsfw: av(x.nsfw) })).filter(x => x.sfw && x.nsfw).slice(0, 20); }
        for (const k of ['yes', 'maybe', 'no']) if (c[k] !== undefined) n[k] = cut(str(c[k]).replace(/\s+/g, ' ').trim(), 200);
        for (const k of ['panic_avatar', 'panic_chat', 'panic_private', 'panic_toys']) if (c[k] !== undefined) n[k] = c[k] === true || c[k] === '1' || c[k] === 'true';
        if (c.group !== undefined) n.group = /^grp_[0-9a-f-]{36}$/i.test(str(c.group).trim()) ? str(c.group).trim() : '';
        this.app.db.setSetting('nsfw_cfg', JSON.stringify(n));
        return n;
    }
    async selectAvatar(id) { await this.app.tools.call('PUT', '/avatars/' + encodeURIComponent(id) + '/select'); }
    /** Panik: sicherer Avatar, Chatbox aus, Privat-Modus, Spielzeug stopp */
    async panic() {
        const c = this.cfg(), done = [];
        if (c.panic_toys && this.app.toys) { await this.app.toys.stopAll().catch(() => {}); done.push('Spielzeug gestoppt'); }
        if (this.app.toyremote && this.app.toyremote.cfg().recv_on) { this.app.toyremote.panic(); done.push('Fernsteuerung aus'); }
        if (c.panic_private) { this.private = true; done.push('Privat-Modus an'); }
        if (c.panic_chat) {
            const g = this.app.game; g.suppressRotator = true;
            if (this.app.chatmods && this.app.chatmods.cfg().on) await this.app.chatmods.action('cm_save', { on: '0', quiet: '1' }).catch(() => {});
            await g.osc.chatbox('', false).catch(() => {}); done.push('Chatbox leer & aus');
        }
        if (c.panic_avatar && c.safe_avatar) { await this.selectAvatar(c.safe_avatar).catch(e => done.push('⚠ Avatar: ' + e.message)); done.push('sicherer Avatar'); }
        if (this.app.tools.rpc) this.app.tools.rpc.setActivity(null);
        return { ok: true, msg: '🚨 Panik: ' + done.join(' · '), private: this.private };
    }
    async toggleAvatar(i) {
        const c = this.cfg(), p = c.pairs[int(i)];
        if (!p) throw new UserError('Avatar-Paar nicht gefunden.');
        const acc = this.acc(), me = str(acc && acc.me && acc.me.currentAvatar);
        const cur = me === p.sfw || me === p.nsfw ? me : this.curAv || me;   // VRChat-Stand, sonst zuletzt selbst gewählt
        const to = cur === p.nsfw ? p.sfw : p.nsfw;
        await this.selectAvatar(to);
        this.curAv = to;
        if (acc && acc.me) acc.me.currentAvatar = to;
        return { ok: true, msg: (to === p.nsfw ? '🔞 ' : '🙂 ') + (p.name || 'Avatar') + ' – ' + (to === p.nsfw ? 'NSFW' : 'SFW'), nsfw: to === p.nsfw };
    }
    boundariesText() {
        const c = this.cfg();
        const t = [c.yes && '🟢 ' + c.yes, c.maybe && '🟡 ' + c.maybe, c.no && '🔴 ' + c.no].filter(Boolean).join('\n');
        if (!t) throw new UserError('Erst die Grenzen-Karte ausfüllen.');
        return Array.from(t).slice(0, 144).join('');
    }

    state() {
        const a = this.access(), c = this.cfg();
        const out = { access: a, private: this.private, features: FEATURES };
        if (!a.unlocked) return out;
        Object.assign(out, { cfg: c, current_avatar: str(this.acc() && this.acc().me && this.acc().me.currentAvatar), toys: this.app.toys ? this.app.toys.status() : null, tremote: this.app.toyremote ? this.app.toyremote.status() : null, remote: this.app.remote ? this.app.remote.status() : null });
        if (a.owner) { const k = this.ownerKey(); Object.assign(out, { owner_key: k ? k.pub : '', key_known: !!(k && TRUSTED.includes(k.pub)), issued: this.issued() }); }
        return out;
    }
    async action(act, input) {
        switch (act) {
            case 'nsfw_state': return this.state();
            case 'nsfw_unlock': {
                const uid = this.myId();
                if (!uid) throw new UserError('Erst bei VRChat anmelden.');
                const t = str(input.token).trim();
                if (!t) { this.app.db.setSetting('nsfw_token', ''); return Object.assign(this.state(), { msg: 'Schlüssel entfernt.' }); }
                const r = this.check(t, uid);
                if (r.error) throw new UserError(r.error);
                this.app.db.setSetting('nsfw_token', this.crypt.encrypt(t));
                return Object.assign(this.state(), { msg: '🔓 Freigeschaltet.' });
            }
        }
        // ab hier nur freigeschaltet
        if (act.startsWith('nsfw_admin_')) {
            if (!this.isOwner()) throw new UserError('Nur für den Besitzer.');
            switch (act) {
                case 'nsfw_admin_keypair': { const pub = this.makeOwnerKey(); return Object.assign(this.state(), { pub, msg: 'Schlüsselpaar erzeugt.' }); }
                case 'nsfw_admin_issue': return Object.assign(await this.issue(input), { items: this.issued() });
                case 'nsfw_admin_revoke': return this.revoke(input.id, input.on !== '0');
                case 'nsfw_admin_check': { const r = this.check(input.token, str(input.uid)); return r.error ? { ok: false, msg: r.error } : { ok: true, msg: '✔ gültig für ' + r.payload.uid, payload: r.payload }; }
            }
        }
        this.need('nsfw');
        switch (act) {
            case 'nsfw_cfg': return Object.assign(this.state(), { cfg: this.saveCfg(input), msg: 'Gespeichert.' });
            case 'nsfw_panic': return await this.panic();
            case 'nsfw_private': { this.private = input.on === undefined ? !this.private : input.on === '1' || input.on === true; if (this.private && this.app.tools.rpc) this.app.tools.rpc.setActivity(null); return { ok: true, private: this.private, msg: this.private ? '🕶 Privat-Modus an' : 'Privat-Modus aus' }; }
            case 'nsfw_avatar': return await this.toggleAvatar(input.i);
            case 'nsfw_chat': {
                const t = cut(str(input.text).replace(/\s+/g, ' ').trim(), 144);
                if (!t) throw new UserError('Kein Text.');
                if (this.private) throw new UserError('🕶 Privat-Modus ist an – Chatbox gesperrt.');
                await this.app.game.osc.chatbox(t, input.sound !== '0'); return { ok: true, msg: '💬 In die Chatbox geschickt.', text: t };
            }
            case 'nsfw_consent': { const t = '💬 Alles okay für dich? 🟢 weiter · 🟡 langsamer · 🔴 stopp'; await this.app.game.osc.chatbox(t, true); return { ok: true, msg: '🤝 Nachfrage geschickt.', text: t }; }
            case 'nsfw_boundaries': { const t = this.boundariesText(); await this.app.game.osc.chatbox(t, true); return { ok: true, msg: 'Grenzen-Karte in die Chatbox geschickt.', text: t }; }
            case 'nsfw_instance': {
                const st = this.app.game.state, world = str(input.world) || st.worldId;
                if (!/^wrld_/.test(world)) throw new UserError('Du bist in keiner Welt – Welt-ID angeben.');
                const c = this.cfg(), group = input.kind === 'group';
                if (group && !c.group) throw new UserError('Erst eine 18+-Gruppe (grp_…) eintragen.');
                return await this.app.post({ act: 'instance_create', world, type: group ? 'group' : 'invite', group: c.group, access: 'members', age_gate: group ? '1' : '', invite_me: '1', region: str(input.region || 'eu') }, {});
            }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { Nsfw, OWNER_HASH, TRUSTED, FEATURES, hashId };
