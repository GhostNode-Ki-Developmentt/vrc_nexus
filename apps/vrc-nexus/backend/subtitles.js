'use strict';
/*
 * Untertitel & Übersetzer „VRChat → Text“:
 *  - Spielton (Windows-Ausgabe, Loopback) kommt in kurzen Stücken aus der Oberfläche,
 *  - whisper.cpp erkennt lokal Text + Sprache (automatisch je Satz oder fest eingestellt),
 *  - ist die Sprache nicht schon die Zielsprache, übersetzt die vorhandene Übersetzung (DeepL/Google) – nur Text, kein Ton,
 *  - die Zeilen landen in der App, im SteamVR-HUD und optional im Verlauf.
 * Eigene Sprache (Mikro → Chatbox) meldet sich hier ebenfalls, damit sie im HUD als eigene Untertitel erscheint.
 */
const { str, int, cut, UserError } = require('./util');

const FLAGS = { de: '🇩🇪', en: '🇬🇧', fr: '🇫🇷', es: '🇪🇸', ja: '🇯🇵', nl: '🇳🇱', pl: '🇵🇱', it: '🇮🇹', ru: '🇷🇺', tr: '🇹🇷', ko: '🇰🇷', zh: '🇨🇳', pt: '🇵🇹', uk: '🇺🇦', sv: '🇸🇪',
    da: '🇩🇰', no: '🇳🇴', fi: '🇫🇮', cs: '🇨🇿', hu: '🇭🇺', ro: '🇷🇴', el: '🇬🇷', id: '🇮🇩', ar: '🇸🇦', th: '🇹🇭', vi: '🇻🇳', hi: '🇮🇳', he: '🇮🇱', bg: '🇧🇬', sk: '🇸🇰', hr: '🇭🇷', lt: '🇱🇹', lv: '🇱🇻', et: '🇪🇪', sl: '🇸🇮' };
const DEF = { enabled: false, src: 'auto', target: '', model: 'base', min_prob: 50, show_orig: true, ignore: '', keep: 12, max_sec: 8, threshold: 1.5, translate: true, mine: true };

class Subtitles {
    constructor(app) { this.app = app; this.lines = []; this.busy = false; this.dropped = 0; this.seq = 0; }
    cfg() { try { return Object.assign({}, DEF, JSON.parse(this.app.db.setting('subs_cfg', '{}'))); } catch (e) { return Object.assign({}, DEF); } }
    saveCfg(c) {
        const cur = this.cfg(), L = require('./speech').LANGS, M = require('./speech').MODELS;
        const n = {
            enabled: c.enabled === undefined ? cur.enabled : c.enabled === true || c.enabled === '1' || c.enabled === 'true',
            src: L[c.src] ? c.src : cur.src,
            target: c.target === undefined ? cur.target : /^[A-Z]{2}(-[A-Z]{2,4})?$/.test(str(c.target)) || c.target === '' ? str(c.target) : cur.target,
            model: M[c.model] ? c.model : cur.model,
            min_prob: c.min_prob === undefined ? cur.min_prob : Math.max(0, Math.min(100, int(c.min_prob))),
            show_orig: c.show_orig === undefined ? cur.show_orig : c.show_orig === true || c.show_orig === '1' || c.show_orig === 'true',
            translate: c.translate === undefined ? cur.translate : c.translate === true || c.translate === '1' || c.translate === 'true',
            mine: c.mine === undefined ? cur.mine : c.mine === true || c.mine === '1' || c.mine === 'true',
            ignore: c.ignore === undefined ? cur.ignore : str(c.ignore).toLowerCase().split(/[\s,;]+/).filter(x => L[x] && x !== 'auto').join(','),
            keep: c.keep === undefined ? cur.keep : Math.max(3, Math.min(50, int(c.keep))),
            max_sec: c.max_sec === undefined ? cur.max_sec : Math.max(3, Math.min(20, int(c.max_sec))),
            threshold: c.threshold === undefined ? cur.threshold : Math.max(0.2, Math.min(20, Number(c.threshold) || cur.threshold)),
        };
        this.app.db.setSetting('subs_cfg', JSON.stringify(n));
        return n;
    }
    /** Zielsprache: eingestellt, sonst App-Sprache (Deutsch, wenn unbekannt) */
    target(c) {
        if (c.target) return c.target;
        const ui = str(this.app.settings.get('ui.lang'));
        return { en: 'EN-GB', fr: 'FR', ja: 'JA' }[ui] || 'DE';
    }
    push(line) {
        line = Object.assign({ id: ++this.seq, t: Date.now(), who: 'others', text: '', lang: '', prob: 1, tr: '', unsure: false }, line);
        line.flag = FLAGS[line.lang] || (line.lang ? line.lang.toUpperCase() : '🌐');
        this.lines.push(line);
        const keep = this.cfg().keep;
        if (this.lines.length > keep) this.lines.splice(0, this.lines.length - keep);
        return line;
    }
    recent(since) { return this.lines.filter(l => !since || l.id > since); }

    /** eigener Satz (Mikro) – kommt aus speech.js */
    mine(text, lang, prob, sent) {
        const c = this.cfg();
        if (!c.mine || !text) return null;
        return this.push({ who: 'me', text, lang, prob, tr: sent && sent !== text ? sent : '' });
    }

    /** ein Stück Spielton erkennen + übersetzen */
    async listen(wav) {
        const c = this.cfg();
        if (!c.enabled) throw new UserError('Der Übersetzer ist aus.');
        if (this.busy) { this.dropped++; return { skipped: true }; }   // noch beschäftigt → dieses Stück auslassen (sonst stauen sich Sätze)
        this.busy = true;
        try {
            const sp = this.app.speech;
            if (!sp) throw new UserError('Spracherkennung gibt es nur in der Windows-App.');
            const r = await sp.recognize(wav, { lang: c.src, model: c.model });
            const text = sp.clean(r.text);
            if (!text || text.length < 2) return { text: '' };
            const lang = r.lang || (c.src !== 'auto' ? c.src : '');
            const ignore = c.ignore ? c.ignore.split(',') : [];
            if (lang && ignore.includes(lang)) return { text, lang, ignored: true };
            const unsure = c.src === 'auto' && r.prob !== undefined && r.prob * 100 < c.min_prob;
            const tgt = this.target(c), tgtBase = tgt.slice(0, 2).toLowerCase();
            let tr = '';
            if (c.translate && lang !== tgtBase && !unsure && this.app.tr) {
                try { tr = str((await this.app.tr.translate(text, tgt)).text); } catch (e) { tr = ''; this.lastError = e.message; }
            }
            const line = this.push({ who: 'others', text: cut(text, 400), lang, prob: r.prob === undefined ? 1 : r.prob, tr: cut(tr, 400), unsure });
            return { line };
        } finally { this.busy = false; }
    }

    state(since) {
        const c = this.cfg();
        const sp = this.app.speech, st = sp ? sp.status() : null;
        return { cfg: c, target: this.target(c), lines: this.recent(int(since)), busy: this.busy, dropped: this.dropped, error: this.lastError || '', flags: FLAGS,
            langs: require('./speech').LANGS, models: require('./speech').MODELS, have: st ? st.have : {}, bin: st ? !!st.bin : false,
            targets: require('./translate').LANGS.map(l => [l[0], l[2]]), tr_ready: !!(this.app.tr && this.app.tr.keys && Object.values(this.app.tr.keys()).some(Boolean)) };
    }
    async action(act, input) {
        switch (act) {
            case 'subs_state': return this.state(input.since);
            case 'subs_cfg': return Object.assign(this.state(), { cfg: this.saveCfg(input), msg: 'Gespeichert.' });
            case 'subs_clear': this.lines = []; return this.state();
            case 'subs_listen': {
                const b64 = str(input.audio).replace(/^data:[^,]*,/, '');
                if (!b64) throw new UserError('Kein Ton.');
                return await this.listen(Buffer.from(b64, 'base64'));
            }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { Subtitles, FLAGS };
