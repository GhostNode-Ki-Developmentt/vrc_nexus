'use strict';
/*
 * Profil-Dekorationen (3.1): Rahmen ums Profilbild, Banner-Farbe/-Bild als Karten-Hintergrund, Namens- und Profil-Effekt.
 * Quelle sind die Felder, die VRChat an Benutzern mitliefert (iconFrame, nameplateEffect, profileEffect, bannerColor, bannerType, bannerUrl –
 * auch im „presence“-Teil). Was in den Feldern steht, ist nicht dokumentiert: eine Katalog-ID (invt_…), ein Name oder eine Bild-URL.
 * Darum wird jeder Wert über den öffentlichen Katalog GET /cosmetics/index/{Typ} aufgelöst (ID oder Name → Bild, Farbverlauf);
 * eine https-URL wird direkt genommen. Katalog wird 24 h zwischengespeichert.
 */
const { str, int, now, cut } = require('./util');

const UID = 1;
const TYPES = ['iconFrame', 'nameplateEffect', 'profileEffect', 'profileBackground'];
const CAT_TTL = 24 * 3600;
const color = c => { c = str(c).replace(/^#/, '').trim(); return /^[0-9a-f]{6}$/i.test(c) ? '#' + c.toLowerCase() : ''; };
const url = u => /^https:\/\/\S+$/i.test(str(u)) ? str(u) : '';

/** Dekoration aus einem VRChat-Benutzerobjekt (oder dessen presence) – null, wenn nichts gesetzt ist */
function extract(u) {
    if (!u || typeof u !== 'object') return null;
    const p = u.presence && typeof u.presence === 'object' ? u.presence : {};
    const pick = k => { const v = u[k] !== undefined && u[k] !== null && u[k] !== '' ? u[k] : p[k]; return cut(str(v === undefined || v === null ? '' : v).trim(), 300); };
    const d = { frame: pick('iconFrame'), nameplate: pick('nameplateEffect'), effect: pick('profileEffect'), banner_color: color(pick('bannerColor')), banner_type: pick('bannerType'), banner_url: url(pick('bannerUrl')) };
    for (const k of Object.keys(d)) if (['', 'none', 'null', 'default'].includes(d[k].toLowerCase())) d[k] = '';
    return Object.values(d).some(Boolean) ? d : null;
}

class Deco {
    constructor(app) {
        this.app = app;
        this.cat = null; this.catAt = 0; this.busy = null;
        app.db.exec('CREATE TABLE IF NOT EXISTS user_deco (user_id INTEGER NOT NULL, vrc_id TEXT NOT NULL, deco TEXT NOT NULL, updated INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, vrc_id))');
    }
    /** aus Freundesliste / Profil / Spielerliste merken (nur bei Änderung schreiben) */
    remember(id, u) {
        id = str(id);
        if (!id) return null;
        const d = extract(u);
        const json = d ? JSON.stringify(d) : '';
        const old = this.app.db.prepare('SELECT deco FROM user_deco WHERE user_id = ? AND vrc_id = ?').value(UID, id);
        if ((old || '') === json) return d;
        if (!d) this.app.db.prepare('DELETE FROM user_deco WHERE user_id = ? AND vrc_id = ?').run(UID, id);
        else this.app.db.prepare('INSERT OR REPLACE INTO user_deco (user_id, vrc_id, deco, updated) VALUES (?, ?, ?, ?)').run(UID, id, json, now());
        if (d) this.need = true;
        return d;
    }
    /** Katalog laden (öffentlich, mit eigener Sitzung) → Map ID/Name → Eintrag */
    async catalog(force) {
        if (this.cat && !force && now() - this.catAt < CAT_TTL) return this.cat;
        if (!this.cat) { try { const c = JSON.parse(this.app.db.setting('deco_catalog', '') || 'null'); if (c && c.at && c.items) { this.cat = c.items; this.catAt = c.at; if (!force && now() - c.at < CAT_TTL) return this.cat; } } catch (e) { /* neu laden */ } }
        if (this.busy) return this.busy;
        this.busy = (async () => {
            const items = {};
            for (const t of TYPES) {
                let list;
                try { list = await this.app.tools.call('GET', '/cosmetics/index/' + t); } catch (e) { continue; }
                for (const x of Array.isArray(list) ? list : (list && Array.isArray(list.data) ? list.data : [])) {
                    const m = x.metadata || {};
                    const e = { type: t, name: cut(str(x.name), 60), img: url(x.imageUrl) || url(m.imageUrl) || url(((m.assets || [])[0] || {}).url), g1: color(m.gradientStart), g2: color(m.gradientEnd), anim: !!m.animated };
                    if (str(x.id)) items[str(x.id)] = e;
                    if (e.name) items['n:' + t + ':' + e.name.toLowerCase()] = e;
                }
            }
            if (Object.keys(items).length) { this.cat = items; this.catAt = now(); this.app.db.setSetting('deco_catalog', JSON.stringify({ at: this.catAt, items })); }
            else if (!this.cat) { this.cat = {}; this.catAt = now() - CAT_TTL + 3600; }   // nicht erreichbar: in 1 h erneut
            return this.cat;
        })().finally(() => { this.busy = null; });
        return this.busy;
    }
    /** Wert (ID, Name oder URL) eines Typs auflösen */
    look(v, type) {
        if (!v) return null;
        if (url(v)) return { img: v, name: '', g1: '', g2: '' };
        const c = this.cat || {};
        return c[v] || c['n:' + type + ':' + v.toLowerCase()] || null;
    }
    /** fürs Zeichnen: Rahmen-Bild, Kartenfarbe/-bild, Namensverlauf */
    resolve(d) {
        if (!d) return null;
        const f = this.look(d.frame, 'iconFrame'), n = this.look(d.nameplate, 'nameplateEffect'), e = this.look(d.effect, 'profileEffect');
        const bg = d.banner_type && /background/i.test(d.banner_type) ? this.look(d.banner_type, 'profileBackground') : null;
        const r = {
            frame: f ? f.img : '', frame_name: f ? f.name : d.frame ? 'Rahmen' : '',
            ring: f && f.g1 ? [f.g1, f.g2 || f.g1] : null,
            name_grad: n && n.g1 ? [n.g1, n.g2 || n.g1] : null,
            effect: e ? e.img : '', effect_grad: e && e.g1 ? [e.g1, e.g2 || e.g1] : null,
            color: d.banner_color, banner: d.banner_url || (bg ? bg.img : ''),
        };
        // ohne Bild, aber mit Rahmen-Wert: Ring in der Banner-Farbe (damit „Rahmen gesetzt“ trotzdem sichtbar ist)
        if (!r.frame && !r.ring && d.frame && d.banner_color) r.ring = [d.banner_color, d.banner_color];
        return Object.values(r).some(v => v && (!Array.isArray(v) || v.length)) ? r : null;
    }
    /** alle bekannten Dekorationen (für die Oberfläche) */
    async map() {
        const rows = this.app.db.prepare('SELECT vrc_id, deco FROM user_deco WHERE user_id = ?').all(UID);
        if (rows.length) await this.catalog().catch(() => null);
        const out = {};
        for (const r of rows) { let d = null; try { d = JSON.parse(r.deco); } catch (e) { /* kaputt */ } const x = this.resolve(d); if (x) out[r.vrc_id] = x; }
        return out;
    }
    async action(act, input) {
        if (act === 'deco_map') return { deco: await this.map(), at: int(this.catAt) };
        if (act === 'deco_refresh') { await this.catalog(true); return { deco: await this.map(), msg: 'Dekorationen neu geladen.' }; }
        return null;
    }
}

module.exports = { Deco, extract };
