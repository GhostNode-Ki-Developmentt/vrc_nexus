/* VRC Nexus – 🈯 Übersetzer „VRChat → Text“ (Spiel & OSC): Spielton mitlesen, Sprache automatisch erkennen, übersetzt als Untertitel.
 * Der Ton kommt über getDisplayMedia (Windows-Systemton/Loopback, das Bild wird sofort verworfen), wird in Sätze geschnitten (Pausen)
 * und als kurze WAV an die App geschickt – erkannt wird lokal mit whisper.cpp, übersetzt wird nur der Text. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api, toast = (m, bad) => UI.toast(m, bad);
    let box = null, st = null, lastId = 0, lines = [], cap = null, pollT = null, sending = 0;

    // ---------- Ton mitschneiden ----------
    function wav(chunks, rate) {
        const n = chunks.reduce((a, c) => a + c.length, 0);
        const b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
        const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
        w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
        v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
        let o = 44;
        for (const c of chunks) for (let i = 0; i < c.length; i++, o += 2) { const s = Math.max(-1, Math.min(1, c[i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
        return b;
    }
    function down(chunks, from) {
        const to = 16000;
        if (from === to) return chunks;
        const n = chunks.reduce((a, c) => a + c.length, 0), all = new Float32Array(n);
        let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
        const out = new Float32Array(Math.floor(n * to / from)), k = from / to;
        for (let i = 0; i < out.length; i++) { const x = i * k, j = Math.floor(x), f = x - j; out[i] = all[j] * (1 - f) + (all[Math.min(j + 1, n - 1)] || 0) * f; }
        return [out];
    }
    async function start() {
        if (cap) return;
        let stream;
        const srcId = (st && st.cfg && st.cfg.source) || 'system';
        if (srcId !== 'system') {
            try { stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: srcId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
            catch (e) { toast('⚠ Audioquelle „' + ((st.cfg.source_label) || srcId) + '“ nicht verfügbar (' + e.name + ') – wähle eine andere oder „Systemton“.', true); return; }
        } else {
            try { stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); }
            catch (e) { toast('⚠ Systemton nicht verfügbar: ' + e.message, true); return; }
            stream.getVideoTracks().forEach(t => t.stop());
            if (!stream.getAudioTracks().length) { toast('⚠ Kein Systemton – das geht nur in der Windows-App.', true); return; }
        }
        let ctx;
        try { ctx = new AudioContext({ sampleRate: 16000 }); } catch (e) { ctx = new AudioContext(); }
        const src = ctx.createMediaStreamSource(stream), proc = ctx.createScriptProcessor(4096, 1, 1), mute = ctx.createGain();
        mute.gain.value = 0;   // nicht noch einmal abspielen
        const rate = ctx.sampleRate;
        cap = { stream, ctx, proc, chunks: [], len: 0, quiet: 0, voiced: 0, level: 0 };
        proc.onaudioprocess = ev => {
            const d = ev.inputBuffer.getChannelData(0), secs = d.length / rate;
            let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i];
            const rms = Math.sqrt(s / d.length), c = (st && st.cfg) || {};
            cap.level = rms;
            const loud = rms > (Number(c.threshold) || 1.5) / 100;
            if (loud || cap.len) { cap.chunks.push(new Float32Array(d)); cap.len += secs; }
            if (loud) { cap.voiced += secs; cap.quiet = 0; } else if (cap.len) cap.quiet += secs;
            // Satzende: Pause nach Sprache, oder zu lang
            if (cap.len && (cap.quiet > 0.7 || cap.len >= (Number(c.max_sec) || 8))) {
                const chunks = cap.chunks, voiced = cap.voiced;
                cap.chunks = []; cap.len = 0; cap.quiet = 0; cap.voiced = 0;
                if (voiced >= 0.5) send(down(chunks, rate));
            }
            const m = document.getElementById('subMeter'); if (m) m.style.width = Math.min(100, Math.round(rms * 600)) + '%';
        };
        src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
        stream.getAudioTracks()[0].addEventListener('ended', stop);
        toast('🈯 Übersetzer hört mit');
        render();
    }
    function stop() {
        if (!cap) return;
        try { cap.proc.disconnect(); cap.stream.getTracks().forEach(t => t.stop()); cap.ctx.close(); } catch (e) { /* egal */ }
        cap = null;
        render();
    }
    function send(chunks) {
        if (sending > 1) return;   // Erkennung hinkt hinterher → Stück auslassen, damit Untertitel aktuell bleiben
        sending++;
        const b = new Blob([wav(chunks, 16000)], { type: 'audio/wav' });
        new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(b); })
            .then(b64 => api('subs_listen', { audio: b64 }))
            .then(r => { if (r.line) { add([r.line]); } })
            .catch(e => { if (st) st.error = e.message; renderLines(); })
            .finally(() => { sending--; });
    }

    // ---------- Anzeige ----------
    function add(list) {
        for (const l of list) if (l.id > lastId) { lines.push(l); lastId = l.id; }
        if (lines.length > 60) lines.splice(0, lines.length - 60);
        renderLines();
    }
    function lineHtml(l) {
        const c = (st && st.cfg) || {}, tgt = String((st && st.target) || 'DE').slice(0, 2);
        const lang = (l.lang || '?').toUpperCase();
        const head = '<span class="sb-flag" title="' + esc(lang) + (l.prob < 1 ? ' · ' + Math.round(l.prob * 100) + ' %' : '') + '">' + esc(l.flag || '🌐') + '</span> <small class="sb-lang">' + esc(lang) + (l.tr ? ' → ' + esc(tgt) : '') + (l.unsure ? ' ?' : '') + '</small>';
        const who = l.who === 'me' ? '<small class="sb-me">ich</small> ' : '';
        return '<div class="sb-line' + (l.who === 'me' ? ' me' : '') + (l.unsure ? ' unsure' : '') + '">' + head + ' ' + who
            + (l.tr ? '<b data-no-i18n>' + esc(l.tr) + '</b>' + (c.show_orig ? '<div class="sb-orig" data-no-i18n>' + esc(l.text) + '</div>' : '') : '<b data-no-i18n>' + esc(l.text) + '</b>') + '</div>';
    }
    function renderLines() {
        const el = document.getElementById('subLines');
        if (!el) return;
        const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
        el.innerHTML = lines.length ? lines.map(lineHtml).join('') : '<div class="muted small">Noch nichts erkannt. ' + (cap ? 'Sobald jemand spricht, erscheint es hier.' : 'Erst „Mitlesen starten“.') + '</div>';
        if (atEnd) el.scrollTop = el.scrollHeight;
        const e = document.getElementById('subErr'); if (e) e.textContent = st && st.error ? '⚠ ' + st.error : '';
    }
    let devs = null;
    /** Aufnahmegeräte (Namen gibt der Browser erst nach einer Mikro-Freigabe heraus) */
    async function loadDevs(ask) {
        try {
            if (ask) { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); }
            devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
        } catch (e) { devs = devs || []; if (ask) toast('⚠ Geräteliste: ' + e.message, true); }
        render();
    }
    function srcOptions(c) {
        const cur = c.source || 'system', list = devs || [];
        let h = '<option value="system"' + (cur === 'system' ? ' selected' : '') + '>🔊 Systemton – alles, was du hörst</option>';
        h += list.map((d, i) => '<option value="' + esc(d.deviceId) + '"' + (d.deviceId === cur ? ' selected' : '') + '>' + (/cable|voicemeeter|virtual|vb-audio/i.test(d.label) ? '🔀 ' : '🎤 ') + esc(d.label || 'Aufnahmegerät ' + (i + 1)) + '</option>').join('');
        if (cur !== 'system' && !list.some(d => d.deviceId === cur)) h += '<option value="' + esc(cur) + '" selected>🎤 ' + esc(c.source_label || 'gespeichertes Gerät') + '</option>';
        return h;
    }
    function render() {
        if (!box || !st) return;
        if (box.contains(document.activeElement) && document.activeElement.matches('input, select')) return renderLines();
        const c = st.cfg;
        const opt = (list, cur) => list.map(([k, v]) => '<option value="' + esc(k) + '"' + (k === cur ? ' selected' : '') + '>' + esc(v) + '</option>').join('');
        const langs = Object.entries(st.langs), models = Object.entries(st.models).map(([k, v]) => [k, v[0] + ' (' + v[1] + ' MB)' + (st.have[k] ? '' : ' – fehlt')]);
        box.innerHTML = '<div class="nc-grid">'
            + '<div class="nc-card sb-live"><h4>🈯 Live-Untertitel</h4>'
            + '<div class="nc-row"><button type="button" class="btn ' + (cap ? 'btn-gold' : '') + '" id="subGo"' + (c.enabled ? '' : ' disabled') + '>' + (cap ? '⏹ Mitlesen stoppen' : '▶ Mitlesen starten') + '</button>'
            + '<div class="sp-meter"><i id="subMeter"></i></div><button type="button" class="btn btn-sm" id="subClr">Leeren</button></div>'
            + (!c.enabled ? '<p class="small">⚠ Erst unten einschalten.</p>' : !st.bin ? '<p class="small">⚠ whisper.cpp fehlt – unter 🎙 Sprache „Programm laden“.</p>' : !st.have[c.model] ? '<p class="small">⚠ Modell „' + esc(c.model) + '“ fehlt – unter 🎙 Sprache herunterladen.</p>' : '')
            + (!st.tr_ready && c.translate ? '<p class="small">ℹ Für Übersetzungen einen DeepL- oder Google-Schlüssel unter Einstellungen → Übersetzen eintragen – erkannt wird trotzdem.</p>' : '')
            + '<div class="sb-lines" id="subLines"></div><p class="small bad" id="subErr"></p>'
            + '<p class="muted small">Erscheint auch im SteamVR-HUD (Einstellungen → VR). Der Ton bleibt auf deinem PC; zum Übersetzen geht nur der erkannte Text an DeepL/Google.</p></div>'
            + '<form class="sb-cfg" id="subCfg">'
            + '<div class="nc-card"><h4>🔊 Ton & Erkennung</h4>'
            + '<label class="check"><input type="checkbox" name="enabled"' + (c.enabled ? ' checked' : '') + '> <b>Übersetzer an</b></label>'
            + '<label class="sb-f"><span>Audioquelle</span><div class="nc-row"><select name="source" style="flex:1">' + srcOptions(c) + '</select><button type="button" class="btn btn-sm" id="subDevs" title="Geräte neu einlesen">🔄</button></div></label>'
            + '<p class="muted small">„Systemton“ hört alles mit, was aus deinen Lautsprechern/Kopfhörern kommt. Für nur VRChat: VRChat-Ausgabe auf ein virtuelles Kabel (z. B. VB-Cable) legen und hier das Kabel wählen.</p>'
            + '<label class="sb-f"><span>Gesprochene Sprache</span><select name="src">' + opt(langs, c.src) + '</select></label>'
            + '<p class="muted small">„automatisch“ erkennt die Sprache bei jedem Satz neu – auch wenn mehrere Leute verschiedene Sprachen sprechen.</p>'
            + '<label class="sb-f"><span>Whisper-Modell</span><select name="model">' + opt(models, c.model) + '</select></label>'
            + '<p class="muted small">Läuft dauerhaft neben VRChat & SteamVR – „Base“ oder „Small“ sind ein guter Kompromiss, größere Modelle brauchen deutlich mehr CPU/GPU.</p>'
            + '<div class="sb-2"><label class="sb-f"><span>Empfindlichkeit</span><input type="number" name="threshold" value="' + c.threshold + '" min="0.2" max="20" step="0.1"></label>'
            + '<label class="sb-f"><span>Satz höchstens (s)</span><input type="number" name="max_sec" value="' + c.max_sec + '" min="3" max="20"></label></div></div>'
            + '<div class="nc-card"><h4>🌍 Übersetzung & Anzeige</h4>'
            + '<label class="check"><input type="checkbox" name="translate"' + (c.translate ? ' checked' : '') + '> übersetzen</label>'
            + '<label class="sb-f"><span>Zielsprache</span><select name="target"><option value="">wie App-Sprache (' + esc(st.target) + ')</option>' + opt(st.targets, c.target) + '</select></label>'
            + '<label class="sb-f"><span>Mindest-Sicherheit (%)</span><input type="number" name="min_prob" value="' + c.min_prob + '" min="0" max="100"></label>'
            + '<p class="muted small">Darunter wird der Satz mit „?“ markiert und nicht übersetzt.</p>'
            + '<label class="sb-f"><span>Diese Sprachen ignorieren</span><input type="text" name="ignore" value="' + esc(c.ignore) + '" placeholder="z. B. ru, zh"></label>'
            + '<label class="check small"><input type="checkbox" name="show_orig"' + (c.show_orig ? ' checked' : '') + '> Originaltext klein darunter</label>'
            + '<label class="check small"><input type="checkbox" name="mine"' + (c.mine ? ' checked' : '') + '> eigene Sprache (Mikro) auch anzeigen</label></div>'
            + '<div class="sb-save"><button class="btn btn-gold">💾 Speichern</button></div></form></div>';
        renderLines();
    }
    function poll() {
        clearTimeout(pollT);
        const visible = box && box.offsetParent;
        api('subs_state', { since: lastId }).then(d => { const first = !st; st = d; add(d.lines); if (first) render(); })
            .catch(() => {}).finally(() => { pollT = setTimeout(poll, visible || cap ? 1500 : 10000); });
    }
    document.addEventListener('click', e => {
        if (!box || !box.contains(e.target)) return;
        if (e.target.closest('#subGo')) return cap ? stop() : start();
        if (e.target.closest('#subClr')) { lines = []; api('subs_clear').catch(() => {}); renderLines(); }
        if (e.target.closest('#subDevs')) return loadDevs(true);
    });
    document.addEventListener('submit', e => {
        if (e.target.id !== 'subCfg') return;
        e.preventDefault();
        const data = {};
        for (const el of e.target.elements) if (el.name) data[el.name] = el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value;
        const so = e.target.elements.source; if (so) data.source_label = (so.selectedOptions[0] ? so.selectedOptions[0].textContent : '').replace(/^\S+\s/, '');
        if (cap && st && data.source !== st.cfg.source) { stop(); setTimeout(start, 400); }   // Quelle gewechselt → neu starten
        api('subs_cfg', data).then(d => { st = d; toast(d.msg); document.activeElement.blur(); if (!d.cfg.enabled) stop(); render(); }).catch(x => toast('⚠ ' + x.message, true));
    });
    window.NexusSubs = { open(el) { box = el; api('subs_state', { since: 0 }).then(d => { st = d; lines = []; lastId = 0; add(d.lines); render(); poll(); if (!devs) loadDevs(false); }).catch(x => { el.innerHTML = '<div class="vx-error">⚠ ' + esc(x.message) + '</div>'; }); }, start, stop, get on() { return !!cap; } };
})();
