/* VRC Nexus – ⚠ Warnliste (Crasher / Ripper / Troller), gespeichert auf der GhostNode-Webseite.
 * Kennzeichen in Profil, Freunde-Leiste und Spielerliste · Melden im Profil · Übersicht (Sozial → Warnliste) · Verwaltung für Admins. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api, toast = (m, bad) => UI.toast(m, bad);
    const T = s => (window.t ? window.t(s) : s);
    const RED = '#ff5c5c';
    let badges = {}, reasons = { crasher: ['💥', 'Crasher'], ripper: ['🏴‍☠️', 'Ripper'], troll: ['🧌', 'Troll'], other: ['⚠', 'Sonstiges'] };
    let box = null, d = null, adm = null, admBox = null, timer = null;
    const R = k => reasons[k] || reasons.other;
    const when = ts => ts ? new Date(ts * 1000).toLocaleDateString(window.nxLoc ? nxLoc() : 'de-DE') : '–';
    const card = (t, html, cls) => '<div class="nc-card ' + (cls || '') + '"><h4>' + t + '</h4>' + html + '</div>';

    // ---------- Kennzeichen ----------
    function loadBadges() { return api('warn_badges').then(r => { const n = JSON.stringify(r.badges || {}); if (n !== JSON.stringify(badges)) { badges = r.badges || {}; if (window.NexusSide && window.NexusSide.render) try { window.NexusSide.render(); } catch (e) { /* noch nicht bereit */ } } }).catch(() => {}); }
    loadBadges(); setInterval(() => { if (!document.hidden) loadBadges(); }, 120000);
    const mark = id => { const b = badges[String(id || '').toLowerCase()]; return b ? ' <span class="wl-mark" title="' + esc(T('Warnliste') + ': ' + T(b.label) + ' (' + b.count + ')') + '">⚠</span>' : ''; };
    const pill = it => it && it.count ? '<span class="vx-pill wl-pill" style="--pc:' + RED + '" title="' + esc(T('Steht auf der gemeinsamen Warnliste')) + '">⚠ ' + esc(T(R(it.reason)[1])) + ' (' + it.count + ' ' + esc(T('Meldungen')) + ')</span>' : '';
    const reasonSel = cur => '<select name="reason">' + Object.entries(reasons).map(([k, v]) => '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + esc(v[0] + ' ' + T(v[1])) + '</option>').join('') + '</select>';

    // ---------- Profil-Fenster ----------
    function profile(el, u) {
        el.innerHTML = '<h4>⚠ ' + esc(T('Warnliste')) + '</h4><div class="vx-loading">…</div>';
        api('warn_get', { id: u.id, name: u.name }).then(r => {
            if (r.reasons) reasons = r.reasons;
            const it = r.item, mine = it && it.mine;
            if (!r.can) { el.innerHTML = '<h4>⚠ ' + esc(T('Warnliste')) + '</h4><p class="vx-small">' + esc(T('Melden und Abrufen der gemeinsamen Warnliste gibt es mit Freischalt-Schlüssel.')) + '</p>'; return; }
            el.innerHTML = '<h4>⚠ ' + esc(T('Warnliste')) + (it && it.count ? ' <small style="color:' + RED + '">' + it.count + ' ' + esc(T('Meldungen')) + '</small>' : '') + '</h4>'
                + '<details class="wl-form"' + (mine ? ' open' : '') + '><summary>' + esc(T(mine ? 'Meine Meldung bearbeiten' : 'Melden (Crasher, Ripper, Troll …)')) + '</summary>'
                + '<form class="nc-card wl-f">' + '<div class="nc-row"><span class="small">' + esc(T('Grund')) + '</span>' + reasonSel(mine ? mine.reason : 'crasher')
                + '<span class="small">' + esc(T('gilt')) + '</span><select name="days"><option value="30">30 ' + esc(T('Tage')) + '</option><option value="90">90 ' + esc(T('Tage')) + '</option><option value="182" selected>' + esc(T('6 Monate')) + '</option><option value="365">' + esc(T('1 Jahr')) + '</option></select></div>'
                + '<input type="text" name="note" maxlength="500" placeholder="' + esc(T('Kurz: was ist passiert?')) + '" value="' + esc(mine ? mine.note : '') + '">'
                + '<textarea name="evidence" rows="3" maxlength="1000" required placeholder="' + esc(T('Beweis (Pflicht): Screenshot-Pfad oder Spiel-Log-Zeile')) + '">' + esc(mine ? mine.evidence : '') + '</textarea>'
                + (r.evidence && r.evidence.length ? '<div class="small muted">' + esc(T('Aus deinem Spiel-Log übernehmen:')) + '</div><div class="wl-ev">' + r.evidence.map(l => '<button type="button" class="chip" data-ev="' + esc(l) + '">' + esc(l) + '</button>').join('') + '</div>' : '')
                + '<div class="nc-row"><button class="btn btn-sm btn-danger">⚠ ' + esc(T(mine ? 'Meldung speichern' : 'Melden')) + '</button>'
                + (mine ? '<button type="button" class="btn btn-sm" data-wl="withdraw">' + esc(T('Meldung zurückziehen')) + '</button>' : '')
                + '<a class="btn btn-sm" href="https://help.vrchat.com/hc/en-us/requests/new" target="_blank" rel="noopener noreferrer">↗ ' + esc(T('Bei VRChat melden')) + '</a>'
                + '<button type="button" class="btn btn-sm" data-wl="block">🚫 ' + esc(T('Blockieren')) + '</button></div>'
                + '<p class="vx-small">' + esc(T('Sichtbar für andere erst ab mehreren unabhängigen Meldungen. Bitte nur echte Vorfälle mit Beweis melden – Missbrauch führt zur Sperre des Schlüssels.')) + '</p></form></details>';
            const f = el.querySelector('form');
            el.querySelector('.wl-f').addEventListener('click', e => {
                const ev = e.target.closest('[data-ev]'); if (ev) { f.evidence.value = (f.evidence.value ? f.evidence.value + '\n' : '') + ev.dataset.ev; return; }
                const b = e.target.closest('[data-wl]'); if (!b) return;
                if (b.dataset.wl === 'block') { const x = document.querySelector('#userBody [data-mod="block"]'); if (x) x.click(); return; }
                if (b.dataset.wl === 'withdraw') api('warn_delete', { id: u.id }).then(x => { toast(x.msg); loadBadges(); profile(el, u); }).catch(x => toast(x.message, true));
            });
            f.addEventListener('submit', e => {
                e.preventDefault();
                api('warn_save', { id: u.id, name: u.name, reason: f.reason.value, days: f.days.value, note: f.note.value, evidence: f.evidence.value })
                    .then(x => { toast(x.msg); loadBadges(); profile(el, u); }).catch(x => toast(x.message, true));
            });
        }).catch(e => { el.innerHTML = '<h4>⚠ ' + esc(T('Warnliste')) + '</h4><p class="small bad">⚠ ' + esc(e.message) + '</p>'; });
    }

    // ---------- Übersicht (Sozial → Warnliste) ----------
    function render() {
        if (!box || !d) return;
        if (box.contains(document.activeElement) && document.activeElement.matches('input, textarea')) return;
        reasons = d.reasons || reasons;
        const row = e => '<tr data-user="' + esc(e.id) + '"><td><a href="#" data-user="' + esc(e.id) + '">' + esc(e.name || e.id) + '</a>' + (e.mine ? ' <small class="muted">(' + esc(T('auch von dir')) + ')</small>' : '') + '</td>'
            + '<td>' + Object.entries(e.reasons || {}).map(([k, n]) => esc(R(k)[0] + ' ' + T(R(k)[1])) + (n > 1 ? ' ×' + n : '')).join(', ') + '</td><td><b style="color:' + RED + '">' + e.count + '</b></td><td class="small">' + when(e.last) + '</td></tr>';
        box.innerHTML = '<div class="nc-grid">'
            + card('🛰 ' + esc(T('Status')), '<div class="vx-kpis sm"><div><b>' + d.items.length + '</b><span>' + esc(T('Gewarnte Personen')) + '</span></div><div><b>' + d.min + '</b><span>' + esc(T('Meldungen bis sichtbar')) + '</span></div><div><b>' + d.mine.length + '</b><span>' + esc(T('Meine Meldungen')) + '</span></div></div>'
                + (d.error ? '<p class="small bad">⚠ ' + esc(T(d.error)) + '</p>' : '<p class="small muted">' + esc(T('Gespeichert auf')) + ' ' + esc(d.server.replace(/^https?:\/\//, '')) + '</p>')
                + '<div class="nc-row"><button type="button" class="btn btn-sm" data-wl="reload">⟳ ' + esc(T('Aktualisieren')) + '</button></div>')
            + card('👥 ' + esc(T('Gerade in deiner Instanz')), d.present.length ? d.present.map(p => '<div class="nc-row"><span class="vx-pill" style="--pc:' + RED + '">⚠ ' + esc(T(R(p.reason)[1])) + '</span><a href="#" data-user="' + esc(p.id) + '">' + esc(p.name) + '</a></div>').join('') : '<p class="small muted">' + esc(T('Niemand von der Warnliste in deiner Instanz.')) + '</p>')
            + (d.me && d.me.listed ? card('📝 ' + esc(T('Einspruch')), '<p class="small">' + esc(T('Du stehst selbst auf der Warnliste. Wenn das ein Irrtum ist, kannst du Einspruch einlegen.')) + '</p>'
                + (d.me.appeal && d.me.appeal.status === 'open' ? '<p class="small">⏳ ' + esc(T('Dein Einspruch wird geprüft.')) + '</p>' : '<form class="wl-appeal"><textarea name="text" rows="3" maxlength="1000" required></textarea><div class="nc-row"><button class="btn btn-sm btn-gold">' + esc(T('Einspruch senden')) + '</button></div></form>')
                + (d.me.appeal && d.me.appeal.answer ? '<p class="small">' + esc(T('Antwort')) + ': ' + esc(d.me.appeal.answer) + '</p>' : '')) : '')
            + card('⚠ ' + esc(T('Gewarnte Personen')), d.items.length ? '<table class="nx-list"><thead><tr><th>' + esc(T('Name')) + '</th><th>' + esc(T('Grund')) + '</th><th>' + esc(T('Meldungen')) + '</th><th>' + esc(T('zuletzt')) + '</th></tr></thead><tbody>' + d.items.map(row).join('') + '</tbody></table>'
                : '<p class="small muted">' + esc(T(d.can ? 'Noch niemand mit genug Meldungen.' : 'Die Warnliste gibt es nur mit Freischalt-Schlüssel.')) + '</p>', 'ad-wide')
            + (d.mine.length ? card('🗂 ' + esc(T('Meine Meldungen')), '<table class="nx-list"><tbody>' + d.mine.map(m => '<tr><td><a href="#" data-user="' + esc(m.target) + '">' + esc(m.target_name || m.target) + '</a></td><td>' + esc(R(m.reason)[0] + ' ' + T(R(m.reason)[1])) + '</td><td class="small">' + esc(T('bis')) + ' ' + when(m.expires) + '</td><td><button type="button" class="btn btn-sm" data-wl="withdraw" data-id="' + esc(m.target) + '">' + esc(T('zurückziehen')) + '</button></td></tr>').join('') + '</tbody></table>', 'ad-wide') : '')
            + (d.admin ? '<div class="nc-card ad-wide"><h4>👑 ' + esc(T('Verwaltung (Admin)')) + '</h4><div id="wlAdmin"></div></div>' : '')
            + '</div>';
        if (d.admin) admin(box.querySelector('#wlAdmin'));
    }
    function load(refresh) { return api('warn_list', refresh ? { refresh: '1' } : {}).then(r => { d = r; loadBadges(); render(); }).catch(e => { if (box) box.innerHTML = '<div class="vx-error">⚠ ' + esc(e.message) + '</div>'; }); }
    function bindPage() {
        box.addEventListener('click', e => {
            const u = e.target.closest('a[data-user]'); if (u && box.contains(u) && !e.target.closest('#wlAdmin')) { e.preventDefault(); UI.openUser(u.dataset.user); return; }
            const b = e.target.closest('[data-wl]'); if (!b || e.target.closest('#wlAdmin')) return;
            if (b.dataset.wl === 'reload') return load(true);
            if (b.dataset.wl === 'withdraw') api('warn_delete', { id: b.dataset.id }).then(r => { toast(r.msg); d = r; render(); }).catch(x => toast(x.message, true));
        });
        box.addEventListener('submit', e => {
            if (!e.target.matches('.wl-appeal')) return;
            e.preventDefault();
            api('warn_appeal', { text: e.target.text.value }).then(r => { toast(r.msg); d = r; render(); }).catch(x => toast(x.message, true));
        });
    }

    // ---------- Verwaltung (Besitzerin & Moderatoren) ----------
    function admin(el) {
        if (!el) return;
        if (admBox !== el) { admBox = el; bindAdmin(el); }
        if (adm) renderAdmin(); else el.innerHTML = '<div class="vx-loading">…</div>';
        api('warn_admin_list').then(r => { adm = r; renderAdmin(); }).catch(e => { el.innerHTML = '<p class="small bad">⚠ ' + esc(e.message) + '</p>'; });
    }
    function renderAdmin() {
        const el = admBox; if (!el || !adm) return;
        if (el.contains(document.activeElement) && document.activeElement.matches('input, textarea')) return;
        const by = {};
        adm.reports.forEach(r => { (by[r.target] = by[r.target] || []).push(r); });
        const open = adm.appeals.filter(a => a.status === 'open');
        el.innerHTML = '<form class="nc-row wl-set"><span class="small">' + esc(T('Sichtbar ab')) + '</span><input type="number" name="min" min="1" max="10" value="' + adm.min + '" style="width:70px"><span class="small">' + esc(T('Meldungen')) + '</span>'
            + '<span class="small">' + esc(T('Gesperrte Schlüssel-IDs')) + '</span><input type="text" name="revoked" value="' + esc(adm.revoked.join(', ')) + '" style="flex:1"><button class="btn btn-sm btn-gold">' + esc(T('Speichern')) + '</button></form>'
            + '<p class="vx-small">' + esc(T('Moderatoren ernennt die Besitzerin im 👑 Admin-Bereich (Freischalt-Schlüssel mit „🛡 Moderator“).')) + '</p>'
            + (open.length ? '<h4>📝 ' + esc(T('Offene Einsprüche')) + ' (' + open.length + ')</h4>' + open.map(a => '<div class="wl-ap"><div class="nc-row"><a href="#" data-user="' + esc(a.target) + '"><code>' + esc(a.target) + '</code></a><small class="muted">' + when(a.created) + '</small></div><p class="small">' + esc(a.text) + '</p>'
                + '<form class="nc-row wl-apf" data-id="' + a.id + '"><input type="text" name="answer" placeholder="' + esc(T('Antwort (optional)')) + '" style="flex:1"><button type="button" class="btn btn-sm btn-gold" data-acc="1">✔ ' + esc(T('Annehmen')) + '</button><button type="button" class="btn btn-sm" data-acc="0">✖ ' + esc(T('Ablehnen')) + '</button></form></div>').join('') : '')
            + '<h4>⚠ ' + esc(T('Alle Meldungen')) + ' (' + adm.reports.length + ')</h4>'
            + (Object.keys(by).length ? Object.entries(by).map(([t, l]) => '<details class="wl-tg"><summary><b>' + esc(l[0].target_name || t) + '</b> <span class="vx-pill" style="--pc:' + (l.length >= adm.min ? RED : 'var(--border-color)') + '">' + l.length + (l.length >= adm.min ? ' · ' + esc(T('sichtbar')) : '') + '</span> <code class="small">' + esc(t) + '</code></summary>'
                + l.map(r => '<form class="nc-card wl-rep" data-id="' + r.id + '"><div class="small muted">#' + r.id + ' · ' + esc(T('von')) + ' ' + esc(r.reporter_name || r.reporter) + ' · ' + when(r.created) + ' · ' + esc(T('bis')) + ' ' + when(r.expires) + '</div>'
                    + '<div class="nc-row">' + reasonSel(r.reason) + '<input type="text" name="name" value="' + esc(r.target_name) + '" placeholder="' + esc(T('Anzeigename')) + '"><input type="text" name="note" value="' + esc(r.note) + '" placeholder="' + esc(T('Notiz')) + '"><span class="small">' + esc(T('neu gültig (Tage)')) + '</span><input type="number" name="days" min="0" max="365" value="0" style="width:70px"></div>'
                    + '<textarea name="evidence" rows="2">' + esc(r.evidence) + '</textarea><div class="nc-row"><button class="btn btn-sm btn-gold">' + esc(T('Speichern')) + '</button><button type="button" class="btn btn-sm btn-danger" data-wa="delete">🗑 ' + esc(T('Löschen')) + '</button></div></form>').join('')
                + '<div class="nc-row"><button type="button" class="btn btn-sm btn-danger" data-wa="clear" data-target="' + esc(t) + '">🗑 ' + esc(T('Alle Meldungen zu dieser Person löschen')) + '</button></div></details>').join('') : '<p class="small muted">' + esc(T('Noch keine Meldungen.')) + '</p>')
            + '<details><summary>📜 ' + esc(T('Protokoll')) + '</summary><pre class="ad-log">' + esc(adm.log.map(l => new Date(l.ts * 1000).toLocaleString(window.nxLoc ? nxLoc() : 'de-DE') + ' · ' + l.action + (l.target ? ' · ' + l.target : '') + ' · ' + l.actor + (l.detail ? ' · ' + l.detail : '')).join('\n') || '–') + '</pre></details>';
    }
    function bindAdmin(el) {
        const done = p => p.then(r => { if (r.msg) toast(r.msg); adm = null; loadBadges(); admin(el); }).catch(x => toast(x.message, true));
        el.addEventListener('click', e => {
            const u = e.target.closest('a[data-user]'); if (u) { e.preventDefault(); UI.openUser(u.dataset.user); return; }
            const acc = e.target.closest('[data-acc]');
            if (acc) { const f = acc.closest('form'); if (acc.dataset.acc === '1' && !confirm(T('Einspruch annehmen und ALLE Meldungen zu dieser Person löschen?'))) return; return done(api('warn_admin_appeal', { id: f.dataset.id, accept: acc.dataset.acc, answer: f.answer.value })); }
            const b = e.target.closest('[data-wa]'); if (!b) return;
            if (b.dataset.wa === 'delete' && confirm(T('Meldung löschen?'))) return done(api('warn_admin_delete', { id: b.closest('form').dataset.id }));
            if (b.dataset.wa === 'clear' && confirm(T('Alle Meldungen zu dieser Person löschen?'))) return done(api('warn_admin_clear', { target: b.dataset.target }));
        });
        el.addEventListener('submit', e => {
            e.preventDefault();
            const f = e.target;
            if (f.matches('.wl-set')) return done(api('warn_admin_settings', { min: f.min.value, revoked: f.revoked.value }));
            if (f.matches('.wl-rep')) return done(api('warn_admin_update', { id: f.dataset.id, reason: f.reason.value, name: f.name.value, note: f.note.value, evidence: f.evidence.value, days: f.days.value }));
        });
    }

    window.NexusWarn = {
        mark, pill, profile, admin,
        refresh: loadBadges,
        open() {
            const el = document.getElementById('warnBox');
            if (!el) return;
            if (box !== el) { box = el; bindPage(); }
            if (!d) box.innerHTML = '<div class="vx-loading">' + esc(T('Lade …')) + '</div>';
            load(false);
            clearInterval(timer);
            timer = setInterval(() => { if (!document.hidden && box.offsetParent) load(false); else if (!box.offsetParent) clearInterval(timer); }, 60000);
        },
    };
})();
