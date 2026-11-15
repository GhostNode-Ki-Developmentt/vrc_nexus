/* VRC Nexus – ❤️ NSFW / ERP (erscheint erst mit gültigem Freischalt-Schlüssel bzw. für den Besitzer):
 * Panik-Knopf, Privat-Modus, SFW/NSFW-Avatarpaare, Grenzen-Karte, 18+-Instanz, Spielzeug (Intiface/Buttplug + OGB),
 * Handy-Fernbedienung, und für den Besitzer: Admin mit Schlüssel-Generator. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api, toast = (m, bad) => UI.toast(m, bad);
    let st = null, box = null, lastToken = '', tPoll = null;
    const btn = () => document.querySelector('#tabs [data-tab="nsfw"]');

    /** Menüpunkt zeigen/verstecken – beim Start und nach dem Freischalten */
    function refreshAccess() {
        return api('nsfw_state').then(d => {
            st = d;
            const b = btn();
            if (b) b.hidden = !d.access.unlocked;
            const ad = document.querySelector('#tabs [data-tab="admin"]'); if (ad) ad.hidden = !d.access.owner;
            if (!d.access.owner) { document.querySelectorAll('#tabs [data-tab="admin"], [data-pane="admin"], [data-tab-go="admin"]').forEach(x => x.remove()); delete window.NexusAdmin; }
            document.body.classList.toggle('is-owner', !!d.access.owner);
            if (box && !box.closest('[hidden]')) render();
            return d;
        }).catch(() => {});
    }
    const sec = (t, html, cls) => '<div class="nc-card ' + (cls || '') + '"><h4>' + t + '</h4>' + html + '</div>';
    const chk = (k, on, label) => '<label class="check small"><input type="checkbox" data-nk="' + k + '"' + (on ? ' checked' : '') + '> ' + label + '</label>';

    function render() {
        if (!box || !st) return;
        if (box.contains(document.activeElement) && document.activeElement.matches('input[type=text], textarea, input[type=number], select')) return;
        const a = st.access;
        if (!a.unlocked) { box.innerHTML = '<div class="vx-empty">🔒 Nicht freigeschaltet. Den Freischalt-Schlüssel unter Einstellungen → Erweitert eintragen.</div>'; return; }
        const c = st.cfg || {}, t = st.toys, r = st.remote, has = f => a.features.includes(f);
        let h = '<div class="ns-top"><button type="button" class="btn ns-panic" data-ns="panic">🚨 PANIK</button>'
            + '<button type="button" class="btn ' + (st.private ? 'btn-gold' : '') + '" data-ns="private">🕶 Privat-Modus ' + (st.private ? 'AN' : 'aus') + '</button>'
            + '<span class="muted small">' + (a.owner ? '👑 Besitzer' : '🔓 freigeschaltet' + (a.exp ? ' bis ' + esc(new Date(a.exp * 1000).toLocaleDateString(window.nxLoc ? nxLoc() : 'de-DE')) : '')) + '</span></div>';
        h += '<div class="nc-grid">';
        // Avatar-Paare
        h += sec('🎭 SFW ↔ NSFW-Avatar', '<div class="ns-pairs">' + (c.pairs || []).map((p, i) => '<button type="button" class="btn ' + (st.current_avatar === p.nsfw ? 'btn-gold' : '') + '" data-ns="avatar" data-i="' + i + '">'
            + (st.current_avatar === p.nsfw ? '🔞 ' : '🙂 ') + esc(p.name || 'Avatar ' + (i + 1)) + '</button>').join('') + '</div>'
            + '<details class="ns-edit"><summary class="small">Paare bearbeiten</summary><textarea id="nsPairs" rows="4" placeholder="Name | avtr_… (SFW) | avtr_… (NSFW)  – eine Zeile pro Paar">' + esc((c.pairs || []).map(p => p.name + ' | ' + p.sfw + ' | ' + p.nsfw).join('\n')) + '</textarea>'
            + '<div class="nc-row"><span class="small">Sicherer Avatar (Panik)</span><input type="text" id="nsSafe" value="' + esc(c.safe_avatar) + '" placeholder="avtr_…" style="flex:1"></div><button type="button" class="btn btn-sm btn-gold" data-ns="save_av">💾 Speichern</button></details>');
        // Panik-Optionen
        h += sec('🚨 Panik-Knopf', '<p class="muted small">Auch auf dem Handy und als Stream-Deck-Befehl. Was passiert:</p>' + chk('panic_avatar', c.panic_avatar, 'sicheren Avatar anziehen') + chk('panic_chat', c.panic_chat, 'Chatbox leeren & Module aus')
            + chk('panic_private', c.panic_private, 'Privat-Modus an (kein Discord-Status, keine Chatbox)') + chk('panic_toys', c.panic_toys, 'Spielzeug sofort stoppen'));
        // Grenzen-Karte
        h += sec('🟢🟡🔴 Grenzen-Karte', '<div class="ns-bnd"><label><span class="small">🟢 Ja</span><input type="text" id="nsYes" value="' + esc(c.yes) + '" maxlength="200"></label><label><span class="small">🟡 Vielleicht</span><input type="text" id="nsMaybe" value="' + esc(c.maybe) + '" maxlength="200"></label>'
            + '<label><span class="small">🔴 Nein</span><input type="text" id="nsNo" value="' + esc(c.no) + '" maxlength="200"></label></div><div class="nc-row"><button type="button" class="btn btn-sm" data-ns="save_bnd">💾 Speichern</button><button type="button" class="btn btn-sm btn-gold" data-ns="boundaries">📨 In die Chatbox</button></div>');
        // 18+-Instanz
        h += sec('🔞 18+-Instanz', '<p class="muted small">Neue Instanz in deiner aktuellen Welt + Einladung an dich.</p><div class="nc-row"><button type="button" class="btn btn-sm btn-gold" data-ns="inst_invite">🔒 Invite-Instanz</button><button type="button" class="btn btn-sm" data-ns="inst_group"' + (c.group ? '' : ' disabled') + '>🛡 18+-Gruppen-Instanz</button></div>'
            + '<div class="nc-row"><span class="small">18+-Gruppe</span><input type="text" id="nsGroup" value="' + esc(c.group) + '" placeholder="grp_… (mit Altersschranke)" style="flex:1"><button type="button" class="btn btn-sm" data-ns="save_group">💾</button></div>');
        // Spielzeug
        if (has('toys') && t) {
            const tc = t.cfg;
            h += sec('🎮 Spielzeug (Intiface / Buttplug.io)', '<p class="small">' + (t.connected ? '✔ ' + esc(t.state) : '⚪ ' + esc(t.state)) + (t.error ? ' <span class="bad">' + esc(t.error) + '</span>' : '') + '</p>'
                + '<div class="nc-row"><input type="text" id="nsUrl" value="' + esc(tc.url) + '" style="flex:1"><button type="button" class="btn btn-sm ' + (t.connected ? '' : 'btn-gold') + '" data-ns="' + (t.connected ? 'tdisc' : 'tconn') + '">' + (t.connected ? 'Trennen' : '🔌 Verbinden') + '</button><button type="button" class="btn btn-sm" data-ns="tscan"' + (t.connected ? '' : ' disabled') + '>🔎 Geräte suchen</button></div>'
                + (t.devices.length ? '<div class="ns-devs"><div class="ns-dev"><b>Alle</b><input type="range" min="0" max="100" value="0" data-dev="all"></div>' + t.devices.map(d => '<div class="ns-dev"><b>' + esc(d.name) + '</b><input type="range" min="0" max="100" value="' + d.level + '" data-dev="' + d.index + '"><span class="small">' + d.level + ' %</span></div>').join('') + '</div>' : t.connected ? '<p class="muted small">Keine Geräte – „Geräte suchen“ und das Spielzeug einschalten.</p>' : '<p class="muted small">Intiface Central starten und dort „Start Server“ drücken. Läuft Intiface auf dem <b>Handy</b>: dort Settings → Server → „Listen on all network interfaces“ an, Server neu starten, dann oben <code>ws://&lt;Handy-IP&gt;:12345</code> eintragen.</p>')
                + '<button type="button" class="btn ns-stop" data-ns="tstop">⏹ Alles stoppen</button>'
                + '<div class="nc-row"><span class="small">Höchststärke</span><input type="range" min="5" max="100" value="' + tc.max + '" data-nk="max"><span class="small">' + tc.max + ' %</span><span class="small">Aus nach</span><input type="number" min="0" max="60" value="' + tc.idle_stop + '" data-nk="idle_stop" style="width:60px"><span class="small">s ohne Signal</span></div>'
                + '<h4 style="margin-top:12px">🔗 Geräte verknüpfen</h4>' + chk('links_on', tc.links_on, '<b>Verknüpfungen aktiv</b> (Not-Aus und Panik schalten das wieder aus)')
                + '<p class="muted small">Pro Gerät eine oder mehrere Quellen: SPS-Plugs, SPS-Sockets, SPS-Touch-Zonen (OSC-Parameter im OGB-/VRCFury-Format), Konstant oder ein beliebiger Avatar-Parameter. Die stärkste Quelle zählt. OSC in VRChat muss an sein.</p>'
                + '<p class="small"><button type="button" class="btn btn-sm" data-od="1">🐞 Avatar-Debugger öffnen</button> – zeigt, ob SPS-Werte ankommen und wie die Zonen heißen.</p>'
                + '<div class="tl-box">' + (window.NexusToyLinks ? window.NexusToyLinks.html(t) : '') + '</div>'
                + '<details class="ns-edit"><summary class="small">Einfacher OGB-Modus (alle Geräte gleich)</summary>' + chk('ogb', tc.ogb, 'OGB-/SPS-Parameter steuern alle Geräte (Nähe = Stärke)') + chk('ogb_self', tc.ogb_self, 'auch eigene Berührungen (Self)')
                + (t.ogb_params && t.ogb_params.length ? '<p class="muted small">Gefunden: ' + t.ogb_params.map(p => '<code>' + esc(p) + '</code>').join(' ') + '</p>' : '') + '</details>'
                + '<details class="ns-edit"><summary class="small">Eigene Regeln (beliebiger Parameter → Stärke)</summary>' + chk('auto', tc.auto, 'Regeln aktiv')
                + '<textarea id="nsRules" rows="3" placeholder="Parameter | Gerät (all oder Nummer) | min | max   – z. B. Tail_Wag | all | 0.1 | 0.8">' + esc((tc.rules || []).map(r => r.param + ' | ' + r.device + ' | ' + r.min + ' | ' + r.max).join('\n')) + '</textarea><button type="button" class="btn btn-sm" data-ns="save_rules">💾 Speichern</button></details>', 'ns-toys');
        }
        // Handy
        if (has('remote') && r) {
            h += sec('📱 Handy-Fernbedienung', chk('remote_on', r.on, 'an (im Heimnetz über die IP dieses PCs)')
                + (r.on ? (r.running ? '<p class="small">Am Handy öffnen (gleiches WLAN):</p>' + r.urls.map(u => '<div class="nc-row"><code class="ns-url">' + esc(u) + '</code><button type="button" class="vx-copy" data-copy="' + esc(u) + '">⧉</button></div>').join('') : '<p class="small bad">⚠ ' + esc(r.error || 'startet …') + '</p>') : '')
                + '<div class="nc-row"><span class="small">Port</span><input type="number" id="nsPort" value="' + r.port + '" min="1024" max="65535" style="width:90px"><button type="button" class="btn btn-sm" data-ns="save_port">💾</button><button type="button" class="btn btn-sm" data-ns="new_token">♻ Neuer Schlüssel</button></div>'
                + '<p class="muted small">Panik, Privat-Modus, Avatar-Paare, Grenzen-Karte und Spielzeug-Regler. Nur mit dem Schlüssel im Link erreichbar – Link nicht teilen. Windows fragt beim ersten Start evtl. nach der Firewall (privates Netz erlauben).</p>');
        }
        if (a.owner) h += '<div class="nc-card"><h4>👑 Admin</h4><p class="small">Schlüssel-Generator & Besitzer-Werkzeuge haben jetzt einen eigenen Menüpunkt.</p><button type="button" class="btn btn-sm" data-tab-go="admin">👑 Zum Admin</button></div>';
        box.innerHTML = h + '</div>';
    }
    const save = data => api('nsfw_cfg', data).then(d => { st = Object.assign(st, d); toast(d.msg); render(); }).catch(x => toast(x.message, true));
    const toysDo = (act, data) => api(act, data).then(d => { if (st) st.toys = d; if (d.msg) toast(d.msg); render(); }).catch(x => toast(x.message, true));
    function onClick(e) {
        if (window.NexusToyLinks && window.NexusToyLinks.onClick(e, render)) return;
        const g = e.target.closest('[data-tab-go]'); if (g) return UI.tab(g.dataset.tabGo);
        if (e.target.closest('[data-od]')) { UI.tab('client'); setTimeout(() => { const c = document.querySelector('#ncSub [data-sub="debug"]'); if (c) c.click(); }, 400); return; }
        const b = e.target.closest('[data-ns]');
        if (!b) return;
        const a = b.dataset.ns;
        if (b.dataset.tabGo) return UI.tab(b.dataset.tabGo);
        const simple = { panic: 'nsfw_panic', private: 'nsfw_private', boundaries: 'nsfw_boundaries' };
        if (simple[a]) return api(simple[a]).then(d => { toast(d.msg); refreshAccess(); }).catch(x => toast(x.message, true));
        if (a === 'avatar') return api('nsfw_avatar', { i: b.dataset.i }).then(d => { toast(d.msg); refreshAccess(); }).catch(x => toast(x.message, true));
        if (a === 'save_av') {
            const pairs = $v('#nsPairs').split('\n').map(l => l.split('|').map(x => x.trim())).filter(p => p.length >= 3).map(p => ({ name: p[0], sfw: p[1], nsfw: p[2] }));
            return save({ pairs: JSON.stringify(pairs), safe_avatar: $v('#nsSafe') });
        }
        if (a === 'save_bnd') return save({ yes: $v('#nsYes'), maybe: $v('#nsMaybe'), no: $v('#nsNo') });
        if (a === 'save_group') return save({ group: $v('#nsGroup') });
        if (a === 'inst_invite' || a === 'inst_group') return api('nsfw_instance', { kind: a === 'inst_group' ? 'group' : 'invite' }).then(d => toast(d.msg)).catch(x => toast(x.message, true));
        if (a === 'tconn') return api('toys_cfg', { url: $v('#nsUrl') }).then(() => toysDo('toys_connect')).catch(x => toast(x.message, true));
        if (a === 'tdisc') return toysDo('toys_disconnect');
        if (a === 'tscan') { toysDo('toys_scan'); setTimeout(refreshAccess, 4000); setTimeout(refreshAccess, 11000); return; }
        if (a === 'tstop') return toysDo('toys_stop');
        if (a === 'save_rules') {
            const rules = $v('#nsRules').split('\n').map(l => l.split('|').map(x => x.trim())).filter(p => p[0]).map(p => ({ param: p[0], device: p[1] || 'all', min: p[2] || 0, max: p[3] || 1 }));
            return toysDo('toys_cfg', { rules: JSON.stringify(rules) });
        }
        if (a === 'save_port') return api('remote_cfg', { port: $v('#nsPort') }).then(d => { st.remote = d; toast(d.msg); render(); }).catch(x => toast(x.message, true));
        if (a === 'new_token') { if (!confirm('Neuen Schlüssel erzeugen? Alte Handy-Links gehen dann nicht mehr.')) return; return api('remote_cfg', { new_token: '1' }).then(d => { st.remote = d; render(); }); }
        if (a === 'keypair') { if (!confirm('Schlüsselpaar erzeugen? Den öffentlichen Schlüssel danach an Claude geben, damit er in die App eingebaut wird.')) return; return api('nsfw_admin_keypair').then(d => { st = d; toast(d.msg); render(); }).catch(x => toast(x.message, true)); }
        if (a === 'revoke') return api('nsfw_admin_revoke', { id: b.dataset.id, on: b.dataset.on }).then(d => { st.issued = d.items; render(); }).catch(x => toast(x.message, true));
    }
    const $v = s => { const el = box.querySelector(s); return el ? el.value : ''; };
    function onChange(e) {
        if (window.NexusToyLinks && window.NexusToyLinks.onChange(e, render)) return;
        const el = e.target.closest('[data-nk]');
        if (!el) return;
        const k = el.dataset.nk, v = el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value;
        if (/^panic_/.test(k)) return save({ [k]: v });
        if (k === 'remote_on') return api('remote_cfg', { on: v }).then(d => { st.remote = d; toast(d.msg); setTimeout(() => refreshAccess(), 600); render(); }).catch(x => toast(x.message, true));
        return toysDo('toys_cfg', { [k]: v });
    }
    let slideT = null;
    function onInput(e) {
        if (window.NexusToyLinks && window.NexusToyLinks.onInput(e)) return;
        const r = e.target.closest('input[type=range][data-dev]');
        if (!r) return;
        const s = r.parentNode.querySelector('span'); if (s) s.textContent = r.value + ' %';
        clearTimeout(slideT);
        slideT = setTimeout(() => api('toys_set', { device: r.dataset.dev, level: r.value / 100 }).catch(x => toast(x.message, true)), 60);
    }
    function open() {
        box = document.getElementById('nsfwBox');
        if (!box) return;
        if (!box.dataset.bound) { box.dataset.bound = '1'; box.addEventListener('click', onClick); box.addEventListener('change', onChange); box.addEventListener('input', onInput); box.addEventListener('submit', onSubmit); }
        refreshAccess().then(render);
        clearInterval(tPoll); tPoll = setInterval(() => { if (box && !box.closest('[hidden]') && !document.hidden) refreshAccess(); }, 3000);
    }
    function onSubmit(e) {
        if (e.target.id !== 'nsIssue') return;
        e.preventDefault();
        const f = e.target, feats = ['nsfw'].concat(f.f_toys.checked ? ['toys'] : [], f.f_remote.checked ? ['remote'] : []);
        api('nsfw_admin_issue', { uid: f.uid.value, name: f.name.value, days: f.days.value, note: f.note.value, features: feats.join(',') })
            .then(d => { lastToken = d.token; st.issued = d.items; toast(d.msg); f.reset(); render(); UI.copy(d.token); }).catch(x => toast(x.message, true));
    }
    if (window.NexusToyLinks) window.NexusToyLinks.bind(d => { if (st) st.toys = d; });
    window.NexusNsfw = { open, refresh: refreshAccess };
    setTimeout(refreshAccess, 1500);
})();
