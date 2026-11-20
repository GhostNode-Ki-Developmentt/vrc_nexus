/* VRC Nexus – 💓 Puls (Spiel & OSC → Puls): eine Quelle für die ganze App – Pulsoid, HypeRate oder OSC/Smartwatch.
 * Auch die Kurve für die Startseite (NexusHeart.spark). */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = (a, d) => UI.api(a, d), toast = (m, bad) => UI.toast(m, bad);
    const SRC = [['off', '⏸ Aus'], ['pulsoid', '💗 Pulsoid'], ['hyperate', '💜 HypeRate'], ['osc', '⌚ OSC / Smartwatch']];
    let box = null, d = null, timer = null;

    /** kleine Kurve: hist = [[sekunden_vor_jetzt (≤0), bpm], …] */
    function spark(hist, w, h) {
        w = w || 260; h = h || 54;
        if (!hist || hist.length < 2) return '<div class="hr-spark empty muted small">' + esc(window.t ? t('Noch keine Kurve') : 'Noch keine Kurve') + '</div>';
        const span = Math.max(60, -hist[0][0]), vs = hist.map(x => x[1]), lo = Math.min(...vs) - 5, hi = Math.max(...vs) + 5;
        const pt = ([s, v]) => ((span + s) / span * w).toFixed(1) + ',' + (h - (v - lo) / (hi - lo) * h).toFixed(1);
        const line = hist.map(pt).join(' ');
        return '<svg class="hr-spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + line + '" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>';
    }

    function render() {
        const c = d.cfg, s = d.stats;
        box.innerHTML = '<div class="hr-head"><div class="hr-big' + (d.active ? ' on' : '') + '"><span class="hr-heart">💓</span><b>' + (d.active ? d.bpm : '–') + '</b><small>bpm</small></div>'
            + '<div class="hr-kpi">' + (s.max ? '<span>⬇ ' + s.min + '</span><span>⌀ ' + s.avg + '</span><span>⬆ ' + s.max + '</span>' : '') + '<span class="muted small">' + esc(t('letzte 10 Minuten')) + '</span></div>'
            + spark(d.hist) + '</div>'
            + (d.error && c.source !== 'off' ? '<div class="vx-error small">⚠ ' + esc(t(d.error)) + '</div>' : '')
            + '<div class="hr-src">' + SRC.map(([k, l]) => '<button type="button" class="chip' + (c.source === k ? ' on' : '') + '" data-src="' + k + '">' + esc(t(l)) + '</button>').join('') + '</div>'
            + (c.source === 'pulsoid' ? '<form class="cm-f" data-f="pulsoid"><label>' + esc(t('Pulsoid-Token')) + '</label><input name="token" type="password" autocomplete="off" placeholder="' + esc(t(d.has_pulsoid ? '•••••• gespeichert – neu eingeben zum Ändern' : 'Token von pulsoid.net → Integrationen')) + '"><button class="btn btn-sm">' + esc(t('Speichern')) + '</button></form>' : '')
            + (c.source === 'hyperate' ? '<form class="cm-f" data-f="hyperate"><label>' + esc(t('HypeRate-ID')) + '</label><input name="hyperate_id" value="' + esc(c.hyperate_id) + '" placeholder="' + esc(t('z. B. a1b2c3 (aus deinem Widget-Link)')) + '"><button class="btn btn-sm">' + esc(t('Speichern')) + '</button></form>'
                + '<form class="cm-f" data-f="hrkey"><label>' + esc(t('HypeRate-API-Schlüssel')) + '</label><input name="token" type="password" autocomplete="off" placeholder="' + esc(t(d.has_hyperate ? '•••••• gespeichert – neu eingeben zum Ändern' : 'Schlüssel von hyperate.io (Entwickler)')) + '"><button class="btn btn-sm">' + esc(t('Speichern')) + '</button></form>' : '')
            + (c.source === 'osc' ? '<form class="cm-f" data-f="oscin"><label>' + esc(t('Eingehende Parameter')) + '</label><input name="osc_in" value="' + esc(c.osc_in) + '"><button class="btn btn-sm">' + esc(t('Speichern')) + '</button></form>'
                + '<div class="muted small">' + esc(t('Für Smartwatch-Apps, die den Puls schon als Avatar-Parameter an VRChat schicken. Groß/Klein und Sonderzeichen sind egal; Float 0…1 wird als 0…255 gelesen.')) + '</div>' : '')
            + (c.source !== 'off' && c.source !== 'osc' ? '<h4 class="hr-h">' + esc(t('An den Avatar senden')) + '</h4><form class="cm-f" data-f="out">'
                + '<label class="cm-inl"><input type="checkbox" name="send_osc"' + (c.send_osc ? ' checked' : '') + '> ' + esc(t('Avatar-Parameter senden')) + '</label>'
                + '<label>' + esc(t('Eigener Name')) + '</label><input name="param" value="' + esc(c.param) + '" style="max-width:160px">'
                + '<label>' + esc(t('Bereich (bpm)')) + '</label><input name="min" type="number" min="20" max="150" value="' + c.min + '" style="width:70px"><input name="max" type="number" min="30" max="250" value="' + c.max + '" style="width:70px">'
                + '<button class="btn btn-sm">' + esc(t('Speichern')) + '</button></form>'
                + '<div class="muted small">' + esc(t('Gesendet werden HR, HRPercent, isHRActive, isHRConnected, onesHR, tensHR, hundredsHR und der eigene Name (Int + Float) – passt zu gängigen Puls-Anzeigen auf Avataren.')) + '</div>' : '')
            + '<div class="muted small hr-ph">' + esc(t('Platzhalter für Chatbox, Rotator, Makros und Stream Deck:')) + ' <code>{puls}</code> <code>{puls_min}</code> <code>{puls_max}</code> <code>{puls_schnitt}</code> · ' + esc(t('SteamVR-HUD: „puls“ unter Einstellungen → VR → Infos.')) + '</div>';
    }
    function load(refresh) { return api('hr_get', refresh ? { refresh: '1' } : {}).then(r => { d = r; if (box) render(); }).catch(e => { if (box) box.innerHTML = '<div class="vx-error">⚠ ' + esc(e.message) + '</div>'; }); }
    const save = data => api('hr_save', data).then(r => { d = r; render(); if (r.msg) toast(r.msg); }).catch(e => toast('⚠ ' + e.message, true));

    function bind() {
        box.addEventListener('click', e => { const b = e.target.closest('[data-src]'); if (b) save({ source: b.dataset.src }); });
        box.addEventListener('submit', e => {
            e.preventDefault();
            const f = e.target, k = f.dataset.f;
            if (k === 'pulsoid' || k === 'hrkey') return api(k === 'pulsoid' ? 'hr_pulsoid_key' : 'hr_hyperate_key', { token: f.token.value }).then(r => { toast(r.msg); d = r; render(); }).catch(er => toast('⚠ ' + er.message, true));
            if (k === 'hyperate') return save({ hyperate_id: f.hyperate_id.value });
            if (k === 'oscin') return save({ osc_in: f.osc_in.value });
            if (k === 'out') return save({ send_osc: f.send_osc.checked ? '1' : '0', param: f.param.value, min: f.min.value, max: f.max.value });
        });
    }
    window.NexusHeart = {
        spark,
        open(el) {
            if (box !== el) { box = el; bind(); }
            if (!d) box.innerHTML = '<div class="muted">' + esc(t('Lade …')) + '</div>';
            load(true);
            clearInterval(timer);
            timer = setInterval(() => { if (!document.hidden && box.offsetParent && !box.contains(document.activeElement)) load(); else if (!box.offsetParent) clearInterval(timer); }, 2000);
        },
    };
})();
