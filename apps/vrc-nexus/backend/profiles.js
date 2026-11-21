'use strict';
/*
 * 👥 Multiaccount (3.4): mehrere VRChat-Konten in VRC Nexus – jedes Konto hat eine EIGENE Datenbank
 * (Sitzung, Freunde, Verlauf, Favoriten, Notizen, Chat-Schlüssel, Nexus-Konto … sauber getrennt).
 *   profiles.json im Datenordner: { current, list: [{ id, file, name, image, vrc_id, seed? }] }
 *   Das erste Konto bleibt „main“ mit der bisherigen nexus.sqlite – an vorhandenen Daten ändert sich nichts.
 *   Umschalten = Profil merken und die App neu laden (PC: Neustart, Handy: Seite neu laden).
 *   Passwörter werden nie gespeichert – jedes Konto meldet sich einmal an, danach gilt seine (verschlüsselte) Sitzung.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { str, cut, UserError } = require('./util');

const MAX = 8;
const FILE = dir => path.join(dir, 'profiles.json');
const DEF = () => ({ current: 'main', list: [{ id: 'main', file: 'nexus.sqlite', name: '', image: '', vrc_id: '' }] });
/** Einstellungen, die ein neues Konto NICHT übernimmt (gehören zum jeweiligen Konto bzw. sind Schlüssel) */
const NO_SEED = /^(int\.api_token|int\.webhook|int\.rpc_client|adv\.api_base|adv\.user_agent|vr\.space_orig)$/;

function load(dir) {
    try {
        const j = JSON.parse(fs.readFileSync(FILE(dir), 'utf8'));
        if (j && Array.isArray(j.list) && j.list.length && j.list.every(p => p && /^[\w-]{1,20}$/.test(str(p.id)) && /^nexus(-[\w-]{1,20})?\.sqlite$/.test(str(p.file)))) {
            if (!j.list.some(p => p.id === j.current)) j.current = j.list[0].id;
            return j;
        }
    } catch (e) { /* noch keine Datei */ }
    return DEF();
}
function save(dir, j) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(FILE(dir), JSON.stringify(j, null, 1)); }
/** Datenbank-Datei des aktuellen Kontos (für main.js / boot.js beim Start) */
function currentFile(dir) {
    const j = load(dir), p = j.list.find(x => x.id === j.current) || j.list[0];
    return { id: p.id, file: path.join(dir, p.file) };
}
/** Neues Konto: Oberflächen-Einstellungen (Design, Sprache …) einmalig übernehmen */
function applySeed(dir, db) {
    const j = load(dir), p = j.list.find(x => x.id === j.current);
    if (!p || !p.seed) return false;
    if (!db.setting('app_settings', '')) db.setSetting('app_settings', JSON.stringify(p.seed));
    delete p.seed;
    save(dir, j);
    return true;
}

class Profiles {
    constructor(app) { this.app = app; }
    get dir() { return (this.app.tools && this.app.tools.userData) || ''; }
    get host() { return (this.app.tools && this.app.tools.host) || {}; }
    /** Name/Bild/ID des aktuellen Kontos auffrischen (aus der VRChat-Sitzung) */
    touch(j) {
        const acc = this.app.vrc && this.app.vrc.account();
        const p = j.list.find(x => x.id === j.current);
        if (!acc || !p) return false;
        const n = { name: cut(str(acc.display_name), 40), image: str(acc.avatar).slice(0, 500), vrc_id: str(acc.vrc_id) };
        if (n.name === p.name && n.image === p.image && n.vrc_id === p.vrc_id) return false;
        Object.assign(p, n);
        return true;
    }
    list() {
        if (!this.dir) throw new UserError('Kein Datenordner.');
        const j = load(this.dir);
        if (this.touch(j)) save(this.dir, j);
        return { current: j.current, max: MAX, items: j.list.map(p => ({ id: p.id, name: p.name, image: p.image, vrc_id: p.vrc_id, current: p.id === j.current })) };
    }
    restart(msg) {
        if (this.host.restart) { setTimeout(() => { try { this.host.restart(); } catch (e) { /* egal */ } }, 300); }
        return Object.assign(this.list(), { restart: true, msg });
    }
    add() {
        const j = load(this.dir);
        this.touch(j);
        if (j.list.length >= MAX) throw new UserError('Höchstens ' + MAX + ' Konten.');
        const id = 'p' + crypto.randomBytes(4).toString('hex');
        const seed = {};
        for (const [k, v] of Object.entries(this.app.settings.all())) if (!NO_SEED.test(k)) seed[k] = v;
        j.list.push({ id, file: 'nexus-' + id + '.sqlite', name: '', image: '', vrc_id: '', seed });
        j.current = id;
        save(this.dir, j);
        return this.restart('Neues Konto – VRC Nexus startet neu, dann bitte anmelden.');
    }
    switchTo(id) {
        const j = load(this.dir);
        this.touch(j);
        if (!j.list.some(p => p.id === str(id))) throw new UserError('Konto nicht gefunden.');
        if (j.current === str(id)) return Object.assign(this.list(), { msg: '' });
        j.current = str(id);
        save(this.dir, j);
        const p = j.list.find(x => x.id === j.current);
        return this.restart('Wechsle zu ' + (p.name || 'neuem Konto') + ' …');
    }
    remove(id) {
        const j = load(this.dir), p = j.list.find(x => x.id === str(id));
        if (!p) throw new UserError('Konto nicht gefunden.');
        if (p.id === j.current) throw new UserError('Das aktive Konto kann nicht entfernt werden – erst zu einem anderen wechseln.');
        if (p.id === 'main') throw new UserError('Das erste Konto bleibt erhalten (dort liegen deine bisherigen Daten).');
        for (const f of [p.file, p.file + '.tmp']) { try { fs.unlinkSync(path.join(this.dir, f)); } catch (e) { /* schon weg */ } }
        j.list = j.list.filter(x => x !== p);
        save(this.dir, j);
        return Object.assign(this.list(), { msg: 'Konto „' + (p.name || p.id) + '“ und seine Daten auf diesem Gerät entfernt.' });
    }
    async action(act, input) {
        switch (act) {
            case 'prof_list': return this.list();
            case 'prof_add': return this.add();
            case 'prof_switch': return this.switchTo(input.id);
            case 'prof_remove': return this.remove(input.id);
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

/** 3.4.1: Freischalt-Schlüssel gelten für alle Konten dieser App – einmal eintragen reicht (verschlüsselt gespeichert, geprüft wird je Konto) */
function sharedKeys(dir) { try { return (load(dir).keys || []).filter(k => typeof k === 'string').slice(0, 20); } catch (e) { return []; } }
function setSharedKey(dir, enc, remove) {
    if (!dir) return;
    const j = load(dir);
    j.keys = (j.keys || []).filter(k => k !== enc);
    if (!remove && enc) j.keys.unshift(enc);
    j.keys = j.keys.slice(0, 20);
    try { save(dir, j); } catch (e) { /* egal */ }
}

module.exports = { Profiles, load, save, currentFile, applySeed, sharedKeys, setSharedKey, MAX };
