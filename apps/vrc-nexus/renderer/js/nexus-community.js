/* VRC Nexus – 🫂 Community (GhostNode): Feed (SFW), 🔞 NSFW-Feed (nur Verified 18+ mit NSFW an), Profil, Moderation.
 * Alle Rechte prüft der Server; die Oberfläche blendet nur aus, was ohnehin abgelehnt würde. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api, toast = (m, bad) => UI.toast(m, bad);
    const T = s => (window.t ? window.t(s) : s);
    const when = ts => UI.ago ? UI.ago(ts) : new Date(ts * 1000).toLocaleString();
    let box = null, sub = (window.NexusUI.store && window.NexusUI.store.get('cmtSub', 'feed')) || 'feed', me = null, items = [], openThread = {}, attach = [], modData = null, prof = null, profEdit = false, busy = false, acct = null, p18Edit = false;
    const card = (t, html, cls) => '<div class="nc-card ' + (cls || '') + '">' + (t ? '<h4>' + t + '</h4>' : '') + html + '</div>';
    const MOBILE = document.body.classList.contains('mobile');
    let chat = { list: null, uid: '', open: null, timer: null };
    const subs = () => [['feed', '🫂 ' + T('Feed')], ...(me && me.nsfw ? [['nsfw', '🔞 ' + T('NSFW-Feed')]] : []), ...(MOBILE ? [] : [['chat', '💬 ' + T('Chat') + (chat.list && chat.list.some(c => c.unread) ? ' •' : '')]]), ['profile', '👤 ' + T('Mein Profil')], ...(me && me.mod ? [['mod', '🛡 ' + T('Moderation')]] : [])];

    function nav() {
        const n = document.getElementById('cmtSub');
        if (n) n.innerHTML = subs().map(([k, l]) => '<button type="button" class="chip' + (sub === k ? ' on' : '') + '" data-csub="' + k + '">' + esc(l) + '</button>').join('')
            // 3.1.1: NSFW direkt hier ein-/ausschalten (nur mit Verified 18+)
            + (acct && acct.age && acct.age.verified ? '<label class="cm-nsfwsw" title="' + esc(T('NSFW-Inhalte und -Werkzeuge anzeigen (freiwillig, jederzeit abschaltbar)')) + '"><input type="checkbox" data-cnsfw="1"' + (acct.age.nsfw_on ? ' checked' : '') + '><span></span>🔞 NSFW</label>' : '');
    }
    const imgs = media => (media || []).length ? '<div class="cm-imgs">' + media.map(id => '<img loading="lazy" src="nexus.php?cimg=' + esc(id) + '" alt="" data-cimg="' + esc(id) + '">').join('') + '</div>' : '';
    function post(p, reply) {
        const reacts = (me ? me.reactions : []).map(e => { const n = (p.reactions || {})[e] || 0, on = (p.mine || []).includes(e); return n || !reply ? '<button type="button" class="cm-re' + (on ? ' on' : '') + '" data-cre="' + esc(e) + '" data-id="' + p.id + '">' + e + (n ? ' <b>' + n + '</b>' : '') + '</button>' : ''; }).join('');
        return '<article class="cm-post' + (reply ? ' reply' : '') + (p.status !== 'visible' ? ' st-' + esc(p.status) : '') + '" data-pid="' + p.id + '">'
            + '<header><a href="#" data-cprof="' + esc(p.author) + '"><b>' + esc(p.name || p.author) + '</b></a> <span class="muted small">' + esc(when(p.created)) + (p.edited ? ' · ' + esc(T('bearbeitet')) : '') + '</span>'
            + (p.rating === 'nsfw' ? ' <span class="vx-pill" style="--pc:#ff5c8a">🔞</span>' : '') + (p.status === 'pending' ? ' <span class="vx-pill rep">⏳ ' + esc(T('wartet auf Freigabe')) + '</span>' : p.status === 'hidden' ? ' <span class="vx-pill">' + esc(T('ausgeblendet')) + '</span>' : '') + '</header>'
            + (p.text ? '<div class="cm-text">' + esc(p.text).replace(/\n/g, '<br>') + '</div>' : '') + imgs(p.media)
            + '<footer><span class="cm-reacts">' + reacts + '</span>'
            + (!reply ? '<button type="button" class="nc-link" data-cthread="' + p.id + '">💬 ' + (p.replies || 0) + '</button>' : '')
            + (p.own ? '<button type="button" class="nc-link" data-cedit="' + p.id + '">✎</button><button type="button" class="nc-link" data-cdel="' + p.id + '">🗑</button>' : '<button type="button" class="nc-link" data-crep="' + p.id + '" title="' + esc(T('Melden')) + '">⚑</button>')
            + (me && me.mod && !p.own ? '<button type="button" class="nc-link" data-cmod="hide" data-id="' + p.id + '" title="' + esc(T('Ausblenden')) + '">🛡</button>' : '') + '</footer>'
            + (!reply && openThread[p.id] ? '<div class="cm-thread">' + (openThread[p.id].replies || []).map(r => post(r, true)).join('') + composer(p.id) + '</div>' : '')
            + '</article>';
    }
    function composer(parent) {
        const nsfw = sub === 'nsfw';
        return '<form class="cm-comp' + (parent ? ' small' : '') + '" data-parent="' + (parent || 0) + '"><textarea name="text" rows="' + (parent ? 2 : 3) + '" maxlength="2000" placeholder="' + esc(T(parent ? 'Antworten …' : nsfw ? 'Etwas für den NSFW-Feed …' : 'Was gibt’s Neues?')) + '"></textarea>'
            + (!parent ? '<div class="cm-att">' + attach.map(a => '<span class="vx-pill">🖼 ' + esc(a.name) + (a.status === 'pending' ? ' ⏳' : '') + '</span>').join('') + '</div>' : '')
            + '<div class="nc-row">' + (!parent ? '<label class="btn btn-sm">🖼 ' + esc(T('Bild')) + '<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-cup="1" hidden></label>' : '')
            + (nsfw && !parent ? '<span class="small muted">' + esc(T('NSFW-Bilder erscheinen nach Prüfung durch einen Moderator.')) + '</span>' : '')
            + '<button class="btn btn-sm btn-gold" style="margin-left:auto">' + esc(T(parent ? 'Antworten' : 'Posten')) + '</button></div></form>';
    }
    function render() {
        if (!box) return;
        if (busy || (box.contains(document.activeElement) && document.activeElement.matches('textarea, input[type=text]'))) return;
        nav();
        if (!me) { box.innerHTML = '<div class="vx-loading">' + esc(T('Lade …')) + '</div>'; return; }
        if (me.error) { box.innerHTML = card('🫂 Community', '<p class="small">' + esc(T(me.error)) + '</p><div id="cmtAcct"></div>'); if (window.NexusAccount) window.NexusAccount.render(box.querySelector('#cmtAcct')); return; }
        if (sub === 'feed' || sub === 'nsfw') {
            box.innerHTML = '<div class="cm-feed">' + (sub === 'nsfw' ? '<div class="tts-help">🔞 ' + esc(T('Getrennter NSFW-Feed – nur für Verified 18+ mit eingeschaltetem NSFW. Nichts davon erscheint in der normalen Timeline.')) + '</div>' : '')
                + (me.sanction && (me.sanction.banned || me.sanction.mute_until > Date.now() / 1000) ? '<p class="small bad">⚠ ' + esc(T(me.sanction.banned ? 'Du bist in der Community gesperrt.' : 'Du bist gerade stummgeschaltet.')) + '</p>' : card('', composer(0)))
                + (items.length ? items.map(p => post(p)).join('') : '<p class="vx-empty">' + esc(T('Noch keine Beiträge.')) + '</p>')
                + (items.length >= 30 ? '<button type="button" class="btn btn-sm" data-cmore="1">' + esc(T('Ältere laden')) + '</button>' : '') + '</div>';
            return;
        }
        if (sub === 'profile') { box.innerHTML = profileHtml(); return; }
        if (sub === 'mod') { box.innerHTML = modHtml(); return; }
        if (sub === 'chat') { box.innerHTML = chatHtml(); const l = box.querySelector('.ch-msgs'); if (l) l.scrollTop = l.scrollHeight; return; }
    }
    // ---------- 💬 Privat-Chat (Ende-zu-Ende-verschlüsselt) ----------
    function chatHtml() {
        const names = {};
        ((UI.state && UI.state() && UI.state().friends) || []).forEach(f => { names[f.id] = f.name; });
        const list = chat.list || [];
        const o = chat.open;
        const left = '<div class="nc-card ch-list"><h4>💬 ' + esc(T('Unterhaltungen')) + '</h4>'
            + '<form class="nc-row ch-new"><input type="text" name="uid" placeholder="' + esc(T('VRChat-User-ID oder Profil-Link')) + '" list="chFriends" style="flex:1"><button class="btn btn-sm btn-gold">＋</button></form>'
            + '<datalist id="chFriends">' + Object.entries(names).map(([id, n]) => '<option value="' + esc(id) + '">' + esc(n) + '</option>').join('') + '</datalist>'
            + (list.length ? list.map(c => '<button type="button" class="ch-item' + (c.uid === chat.uid ? ' on' : '') + '" data-chopen="' + esc(c.uid) + '"><b>' + esc(c.name || names[c.uid] || c.uid.slice(0, 13) + '…') + '</b>'
                + (c.changed ? ' <span title="' + esc(T('Schlüssel geändert')) + '">⚠</span>' : c.verified ? ' <span title="' + esc(T('verifiziert')) + '">✔</span>' : '') + (c.unread ? ' <span class="vx-badge sm">' + c.unread + '</span>' : '')
                + '<small>' + esc(c.last ? (c.last.me ? T('Du') + ': ' : '') + String(c.last.text).slice(0, 60) : '') + '</small></button>').join('') : '<p class="small muted">' + esc(T('Noch keine Unterhaltungen.')) + '</p>')
            + '<p class="small muted">🔒 ' + esc(T('Ende-zu-Ende-verschlüsselt: Nur du und dein Gegenüber können die Nachrichten lesen – auch die GhostNode-Webseite nicht.')) + '</p></div>';
        if (!o) return '<div class="ch-wrap">' + left + '<div class="nc-card ch-conv"><p class="vx-empty">' + esc(T('Unterhaltung wählen oder neu starten.')) + '</p></div></div>';
        const nm = names[o.uid] || (list.find(c => c.uid === o.uid) || {}).name || o.uid;
        return '<div class="ch-wrap">' + left + '<div class="nc-card ch-conv"><div class="nc-row"><h4 style="margin:0">' + esc(nm) + '</h4>'
            + (o.verified ? '<span class="vx-pill" style="--pc:#51e57e">✔ ' + esc(T('verifiziert')) + '</span>' : '') + '<button type="button" class="nc-link" data-chsafety="1" style="margin-left:auto">🔐 ' + esc(T('Sicherheitsnummer')) + '</button></div>'
            + (o.changed ? '<div class="tts-help">⚠ ' + esc(T('Die Schlüssel dieser Person haben sich geändert (neues Gerät oder neu eingerichtet). Vergleiche die Sicherheitsnummer, bevor du Vertrauliches schreibst.')) + '</div>' : '')
            + (chat.showSafety ? '<div class="tts-help"><b>' + esc(T('Sicherheitsnummer')) + '</b><br><code class="ch-sn">' + esc(o.safety || '–') + '</code><br><span class="small">' + esc(T('Vergleicht die Nummer persönlich (z. B. in VRChat). Stimmt sie überein, liest niemand mit.')) + '</span><div class="nc-row"><button type="button" class="btn btn-sm btn-gold" data-chverify="1">✔ ' + esc(T('Stimmt überein')) + '</button></div></div>' : '')
            + (!o.ready ? '<p class="small bad">' + esc(T('Diese Person hat den Chat noch nicht eingerichtet (muss Community → Chat einmal öffnen).')) + '</p>' : '')
            + '<div class="ch-msgs">' + (o.messages || []).map(m => '<div class="ch-msg' + (m.me ? ' me' : '') + (m.sys ? ' sys' : '') + '"><div>' + esc(m.text).replace(/\n/g, '<br>') + '</div><small>' + esc(new Date(m.at).toLocaleString(window.nxLoc ? nxLoc() : 'de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) + '</small></div>').join('') + '</div>'
            + '<form class="ch-comp nc-row"><textarea name="text" rows="2" maxlength="4000" placeholder="' + esc(T('Verschlüsselte Nachricht …')) + '" style="flex:1"' + (o.ready ? '' : ' disabled') + '></textarea><button class="btn btn-sm btn-gold"' + (o.ready ? '' : ' disabled') + '>' + esc(T('Senden')) + '</button></form></div></div>';
    }
    function chatLoad(poll) { return api('chat_list', poll ? { poll: '1' } : {}).then(d => { chat.list = d.items; nav(); if (sub === 'chat') render(); }).catch(e => { toast('⚠ ' + e.message, true); }); }
    function chatOpen(uid) { chat.uid = uid; chat.showSafety = false; return api('chat_open', { uid }).then(d => { chat.open = d; render(); chatLoad(); }).catch(e => toast('⚠ ' + e.message, true)); }
    function chatTimer() {
        clearInterval(chat.timer);
        chat.timer = setInterval(() => {
            if (!box || !box.offsetParent || sub !== 'chat') { clearInterval(chat.timer); api('chat_blur').catch(() => {}); return; }
            if (document.hidden) return;
            if (chat.uid) api('chat_open', { uid: chat.uid }).then(d => { const n = (chat.open && chat.open.messages || []).length; chat.open = d; if (d.messages.length !== n) render(); }).catch(() => {});
            else chatLoad(true);
        }, 4000);
    }
    function profileHtml() {
        if (!prof) return '<div class="vx-loading">…</div>';
        const p = prof;
        if (profEdit && p.own) return '<form class="nc-card cm-pform"><h4>✎ ' + esc(T('Profil bearbeiten')) + '</h4>'
            + '<textarea name="bio" rows="4" maxlength="1000" placeholder="' + esc(T('Über mich')) + '">' + esc(p.bio) + '</textarea>'
            + '<div class="nc-row"><input type="text" name="pronouns" maxlength="40" placeholder="' + esc(T('Pronomen')) + '" value="' + esc(p.pronouns) + '"><input type="text" name="languages" maxlength="100" placeholder="' + esc(T('Sprachen')) + '" value="' + esc(p.languages) + '"></div>'
            + '<input type="text" name="interests" maxlength="300" placeholder="' + esc(T('Interessen (mit Komma)')) + '" value="' + esc(p.interests) + '">'
            + '<input type="text" name="links" maxlength="800" placeholder="' + esc(T('Links (https://…, mit Komma)')) + '" value="' + esc((p.links || []).join(', ')) + '">'
            + (window.NexusProfile18 ? window.NexusProfile18.factsForm(p.facts) : '')
            + '<div class="nc-row"><label class="btn btn-sm">🖼 ' + esc(T('Profilbild')) + '<input type="file" accept="image/*" data-cav="avatar" hidden></label><label class="btn btn-sm">🖼 ' + esc(T('Banner')) + '<input type="file" accept="image/*" data-cav="banner" hidden></label>'
            + '<button class="btn btn-sm btn-gold" style="margin-left:auto">' + esc(T('Speichern')) + '</button><button type="button" class="btn btn-sm" data-cpedit="0">' + esc(T('Abbrechen')) + '</button></div></form>';
        return '<div class="cm-pgrid' + (p.nsfw_facts !== undefined || (p.own && acct && acct.age && acct.age.verified) ? ' two' : '') + '"><div class="cm-prof">' + (p.banner ? '<div class="cm-banner" style="background-image:url(nexus.php?cimg=' + esc(p.banner) + ')"></div>' : '')
            + card('', '<div class="cm-phead">' + (p.avatar ? '<img class="cm-pav" src="nexus.php?cimg=' + esc(p.avatar) + '" alt="">' : '<span class="cm-pav">👤</span>') + '<div><h3>' + esc(p.name) + '</h3>'
                + '<div class="small muted">' + [p.pronouns, p.languages].filter(Boolean).map(esc).join(' · ') + '</div>'
                + (window.NexusProfile18 ? window.NexusProfile18.factsView(p.facts) : '')
                + '<div>' + (p.verified18 ? '<span class="vx-pill" style="--pc:#51e57e">✔ Verified 18+</span>' : '') + '<span class="vx-pill">' + p.posts + ' ' + esc(T('Beiträge')) + '</span></div></div>'
                + (p.own ? '<button type="button" class="btn btn-sm" data-cpedit="1" style="margin-left:auto">✎ ' + esc(T('Bearbeiten')) + '</button>' : '<button type="button" class="btn btn-sm" data-user="' + esc(p.vrc_id) + '" style="margin-left:auto">VRChat-' + esc(T('Profil')) + '</button>') + '</div>'
                + (p.bio ? '<p>' + esc(p.bio).replace(/\n/g, '<br>') + '</p>' : '') + (p.interests ? '<p class="small">✨ ' + esc(p.interests) + '</p>' : '')
                + ((p.links || []).length ? '<p class="small">' + p.links.map(l => '<a href="' + esc(l) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(l.replace(/^https:\/\//, '')) + '</a>').join(' · ') + '</p>' : '')
)
            + (p.feed && p.feed.length ? p.feed.map(x => post(x)).join('') : '') + '</div>' + p18Html(p) + '</div>';
    }
    /** 3.1.1: 🔞 18+-Profil rechts neben dem Profil */
    function p18Html(p) {
        const P = window.NexusProfile18;
        if (!P) return '';
        if (p.nsfw_facts === undefined) return p.own && acct && acct.age && acct.age.verified ? card('🔞 ' + esc(T('18+-Profil')), '<p class="small">' + esc(T('Schalte oben rechts NSFW ein, um dein 18+-Profil zu bearbeiten.')) + '</p>', 'cm-p18') : '';
        const canEdit = p.own && me && me.nsfw;   // ohne eingeschaltetes NSFW speichert der Server den 18+-Teil nicht
        if (canEdit && p18Edit) return card('🔞 ' + esc(T('18+-Profil bearbeiten')), P.nsfwEditor(p.nsfw_facts, p.nsfw_bio), 'cm-p18');
        if (p.own && !canEdit) return card('🔞 ' + esc(T('18+-Profil')), '<p class="small">' + esc(T('Schalte oben rechts NSFW ein, um dein 18+-Profil zu bearbeiten.')) + '</p>' + P.nsfwView(p.nsfw_facts, p.nsfw_bio), 'cm-p18');
        return card('🔞 ' + esc(T('18+-Profil')) + (canEdit ? '<button type="button" class="btn btn-sm" data-p18e="1" style="margin-left:auto">✎ ' + esc(T('Bearbeiten')) + '</button>' : ''), P.nsfwView(p.nsfw_facts, p.nsfw_bio), 'cm-p18');
    }
    const profBody = p => ({ bio: p.bio, pronouns: p.pronouns, languages: p.languages, interests: p.interests, links: p.links || [], nsfw_bio: p.nsfw_bio || '', avatar: p.avatar || '', banner: p.banner || '' });
    function modHtml() {
        if (!modData) return '<div class="vx-loading">…</div>';
        const d = modData;
        const btn = (k, l, extra, cls) => '<button type="button" class="btn btn-sm ' + (cls || '') + '" data-cmod="' + k + '"' + extra + '>' + l + '</button>';
        return '<div class="nc-grid">'
            + card('⚑ ' + esc(T('Meldungen')) + ' (' + d.reports.length + ')', d.reports.length ? d.reports.map(r => '<div class="cm-q"><div class="small muted">#' + r.post_id + ' · ' + esc(when(r.created)) + ' · ' + esc(T('Grund')) + ': ' + esc(r.reason) + (r.rating === 'nsfw' ? ' · 🔞' : '') + '</div>'
                + '<div class="cm-text">' + esc(String(r.text || '').slice(0, 300)) + '</div><div class="nc-row">'
                + btn('hide', '🙈 ' + esc(T('Ausblenden')), ' data-id="' + r.post_id + '"') + (r.rating !== 'nsfw' ? btn('nsfw', '🔞 ' + esc(T('Als NSFW umstufen')), ' data-id="' + r.post_id + '"') : '')
                + btn('delete', '🗑 ' + esc(T('Löschen')), ' data-id="' + r.post_id + '"', 'btn-danger') + btn('mute', '🔇 24 h', ' data-vrc="' + esc(r.author) + '"') + btn('ban', '⛔ ' + esc(T('Sperren')), ' data-vrc="' + esc(r.author) + '"', 'btn-danger')
                + btn('resolve', '✔ ' + esc(T('Erledigt')), ' data-report="' + r.id + '"') + '</div></div>').join('') : '<p class="small muted">' + esc(T('Keine offenen Meldungen.')) + '</p>', 'ad-wide')
            + card('🖼 ' + esc(T('NSFW-Bilder zur Freigabe')) + ' (' + d.media.length + ')', d.media.length ? '<div class="cm-mq">' + d.media.map(m => '<figure><img loading="lazy" src="nexus.php?cimg=' + esc(m.id) + '" alt=""><figcaption class="nc-row">'
                + btn('media_ok', '✔', ' data-media="' + esc(m.id) + '"', 'btn-gold') + btn('media_reject', '✖', ' data-media="' + esc(m.id) + '"', 'btn-danger') + '</figcaption></figure>').join('') + '</div>' : '<p class="small muted">' + esc(T('Nichts zu prüfen.')) + '</p>', 'ad-wide')
            + card('⏳ ' + esc(T('Wartende Beiträge')) + ' (' + d.pending.length + ')', d.pending.length ? d.pending.map(p => post(p) + '<div class="nc-row">' + btn('approve', '✔ ' + esc(T('Freigeben')), ' data-id="' + p.id + '"', 'btn-gold') + btn('delete', '🗑', ' data-id="' + p.id + '"', 'btn-danger') + '</div>').join('') : '<p class="small muted">–</p>')
            + card('🔇 ' + esc(T('Sanktionen')), (d.sanctions.length ? d.sanctions.map(s => '<div class="nc-row"><code class="small">' + esc(s.vrc_id) + '</code><span class="small">' + (s.banned ? '⛔ ' + esc(T('gesperrt')) : '🔇 ' + esc(T('bis')) + ' ' + esc(new Date(s.mute_until * 1000).toLocaleString())) + (s.note ? ' · ' + esc(s.note) : '') + '</span>' + btn('unban', esc(T('Aufheben')), ' data-vrc="' + esc(s.vrc_id) + '"') + '</div>').join('') : '<p class="small muted">–</p>')
                + '<form class="nc-row cm-sform"><input type="text" name="vrc" placeholder="usr_…" style="flex:1"><input type="number" name="hours" min="1" max="2160" value="24" style="width:80px"><button class="btn btn-sm">🔇</button></form>')
            + card('📜 ' + esc(T('Protokoll')), '<pre class="ad-log">' + esc(d.log.map(l => new Date(l.ts * 1000).toLocaleString() + ' · ' + l.action + (l.target ? ' · ' + l.target : '') + (l.detail ? ' · ' + l.detail : '')).join('\n') || '–') + '</pre>', 'ad-wide')
            + '</div>';
    }

    // ---------- Daten ----------
    function loadMe() { return Promise.all([api('comm_me').then(d => { me = d; }).catch(e => { me = { error: e.message }; }), api('acct_get').then(d => { acct = d; }).catch(() => {})]); }
    function loadFeed(more) {
        const before = more && items.length ? items[items.length - 1].id : 0;
        return api('comm_feed', { rating: sub === 'nsfw' ? 'nsfw' : 'sfw', before }).then(d => { items = more ? items.concat(d.items) : d.items; render(); }).catch(e => toast('⚠ ' + e.message, true));
    }
    function loadProfile(id) { prof = null; render(); return api('comm_profile', id ? { id } : {}).then(d => { prof = d.profile; return api('comm_feed', { rating: 'sfw', author: prof.vrc_id }); }).then(d => { prof.feed = d.items; render(); }).catch(e => toast('⚠ ' + e.message, true)); }
    function loadMod() { return api('comm_mod_queue').then(d => { modData = d; render(); }).catch(e => toast('⚠ ' + e.message, true)); }
    function go(s, arg) {
        sub = s; openThread = {};
        if (s === 'nsfw' && !(me && me.nsfw)) sub = 'feed';
        if (window.NexusUI.store) window.NexusUI.store.set('cmtSub', sub);   // 3.1: letzte Unterseite merken
        if (sub === 'feed' || sub === 'nsfw') { items = []; render(); loadFeed(); }
        else if (sub === 'profile') { profEdit = false; p18Edit = false; loadProfile(arg); }
        else if (sub === 'mod') { modData = null; render(); loadMod(); }
        else if (sub === 'chat') { render(); chatLoad(true).then(() => { if (arg) chatOpen(arg); }); chatTimer(); }
        else render();
    }
    const replace = p => { items = items.map(x => x.id === p.id ? Object.assign(x, p) : x); Object.values(openThread).forEach(t => { t.replies = (t.replies || []).map(x => x.id === p.id ? p : x); }); };
    function upload(file, rating) {
        const body = new FormData(); body.append('act', 'comm_upload'); body.append('rating', rating); body.append('file', file);
        return fetch('nexus.php', { method: 'POST', credentials: 'same-origin', body }).then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); return d; });
    }

    function bind() {
        const top = document.getElementById('cmtSub');
        if (top) top.addEventListener('click', e => { const b = e.target.closest('[data-csub]'); if (b) go(b.dataset.csub); });
        if (top) top.addEventListener('change', e => {
            const c = e.target.closest('[data-cnsfw]');
            if (!c) return;
            if (c.checked && !confirm(T('NSFW einschalten? Damit bestätigst du, volljährig zu sein. Inhalte bleiben getrennt und lassen sich jederzeit wieder ausschalten.'))) { c.checked = false; return; }
            c.disabled = true;
            api('acct_nsfw', { on: c.checked ? '1' : '0' }).then(d => { acct = d; if (d.msg) toast(d.msg); if (window.NexusNsfw) window.NexusNsfw.refresh(); return loadMe(); })
                .then(() => { if (sub === 'nsfw' && !(me && me.nsfw)) sub = 'feed'; go(sub); }).catch(x => { toast('⚠ ' + x.message, true); c.checked = !c.checked; c.disabled = false; });
        });
        box.addEventListener('click', e => {
            const t = e.target;
            const pf = t.closest('[data-cprof]'); if (pf) { e.preventDefault(); return go('profile', pf.dataset.cprof); }
            const u = t.closest('[data-user]'); if (u) { e.preventDefault(); return UI.openUser(u.dataset.user); }
            const re = t.closest('[data-cre]'); if (re) return api('comm_react', { id: re.dataset.id, emoji: re.dataset.cre }).then(d => { replace(d.post); if (prof && prof.feed) prof.feed = prof.feed.map(x => x.id === d.post.id ? d.post : x); render(); }).catch(x => toast(x.message, true));
            const th = t.closest('[data-cthread]'); if (th) { const id = +th.dataset.cthread; if (openThread[id]) { delete openThread[id]; return render(); } return api('comm_thread', { id }).then(d => { openThread[id] = d; replace(d.post); render(); }).catch(x => toast(x.message, true)); }
            const ed = t.closest('[data-cedit]'); if (ed) { const p = items.find(x => x.id === +ed.dataset.cedit) || Object.values(openThread).flatMap(x => x.replies).find(x => x.id === +ed.dataset.cedit); const v = prompt(T('Beitrag bearbeiten'), p ? p.text : ''); if (v === null) return; return api('comm_edit', { id: ed.dataset.cedit, text: v }).then(d => { replace(d.post); render(); }).catch(x => toast(x.message, true)); }
            const del = t.closest('[data-cdel]'); if (del) { if (!confirm(T('Beitrag löschen?'))) return; return api('comm_delete', { id: del.dataset.cdel }).then(() => { items = items.filter(x => x.id !== +del.dataset.cdel); Object.values(openThread).forEach(x => { x.replies = x.replies.filter(r => r.id !== +del.dataset.cdel); }); render(); }).catch(x => toast(x.message, true)); }
            const rp = t.closest('[data-crep]'); if (rp) { const r = prompt(T('Warum meldest du diesen Beitrag?')); if (!r) return; return api('comm_report', { id: rp.dataset.crep, reason: r }).then(d => toast(d.msg)).catch(x => toast(x.message, true)); }
            const more = t.closest('[data-cmore]'); if (more) return loadFeed(true);
            const co = t.closest('[data-chopen]'); if (co) return chatOpen(co.dataset.chopen);
            if (t.closest('[data-chsafety]')) { chat.showSafety = !chat.showSafety; return render(); }
            if (t.closest('[data-chverify]')) return api('chat_verify', { uid: chat.uid }).then(d => { chat.open = d; chat.showSafety = false; render(); chatLoad(); toast(T('Als verifiziert markiert.')); }).catch(x => toast(x.message, true));
            const pe = t.closest('[data-cpedit]'); if (pe) { profEdit = pe.dataset.cpedit === '1'; return render(); }
            if (t.closest('[data-p18e]')) { p18Edit = true; return render(); }
            if (t.closest('[data-p18cancel]')) { p18Edit = false; return render(); }
            const md = t.closest('[data-cmod]');
            if (md) {
                const k = md.dataset.cmod;
                if ((k === 'ban' || k === 'delete') && !confirm(T(k === 'ban' ? 'Konto in der Community sperren?' : 'Beitrag löschen?'))) return;
                const note = k === 'hide' || k === 'ban' || k === 'mute' ? (prompt(T('Notiz für das Protokoll (optional)')) || '') : '';
                return api('comm_mod', { do: k, id: md.dataset.id || 0, vrc_id: md.dataset.vrc || '', media: md.dataset.media || '', report: md.dataset.report || 0, hours: 24, note })
                    .then(d => { toast(d.msg); if (sub === 'mod') loadMod(); else loadFeed(); }).catch(x => toast(x.message, true));
            }
        });
        box.addEventListener('change', e => {
            const up = e.target.closest('[data-cup]'), av = e.target.closest('[data-cav]');
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            if (up) { busy = true; upload(f, sub === 'nsfw' ? 'nsfw' : 'sfw').then(d => { attach.push({ id: d.id, name: f.name, status: d.status }); }).catch(x => toast(x.message, true)).finally(() => { busy = false; render(); }); }
            if (av) upload(f, 'sfw').then(d => { prof[av.dataset.cav] = d.id; toast(T('Bild hochgeladen – „Speichern“ nicht vergessen.')); }).catch(x => toast(x.message, true));
        });
        box.addEventListener('submit', e => {
            e.preventDefault();
            const f = e.target;
            if (f.matches('.cm-comp')) {
                const parent = +f.dataset.parent;
                busy = true;
                return api('comm_post', { text: f.text.value, rating: sub === 'nsfw' ? 'nsfw' : 'sfw', parent, media: parent ? [] : attach.map(a => a.id) })
                    .then(d => { toast(T(d.msg)); f.reset(); if (!parent) { attach = []; items.unshift(d.post); } else if (openThread[parent]) { openThread[parent].replies.push(d.post); const p = items.find(x => x.id === parent); if (p) p.replies++; } })
                    .catch(x => toast(x.message, true)).finally(() => { busy = false; render(); });
            }
            if (f.matches('.p18-edit')) return api('comm_profile_save', Object.assign(profBody(prof), { nsfw_bio: f.nsfw_bio.value, nsfw_facts: JSON.stringify(window.NexusProfile18.readNsfw(f)) }))
                .then(d => { toast(d.msg); const feed = prof.feed; prof = d.profile; prof.feed = feed; p18Edit = false; render(); }).catch(x => toast(x.message, true));
            if (f.matches('.cm-pform')) return api('comm_profile_save', Object.assign(profBody(prof), { bio: f.bio.value, pronouns: f.pronouns.value, languages: f.languages.value, interests: f.interests.value, links: f.links.value.split(',').map(x => x.trim()).filter(Boolean) },
                window.NexusProfile18 ? { facts: JSON.stringify(window.NexusProfile18.readFacts(f)) } : {}))
                .then(d => { toast(d.msg); const feed = prof.feed; prof = d.profile; prof.feed = feed; profEdit = false; render(); }).catch(x => toast(x.message, true));
            if (f.matches('.ch-new')) { const v = f.uid.value.trim().replace(/^.*\/(usr_[0-9a-f-]{36}).*$/i, '$1'); if (!/^(?:usr_[0-9a-f-]{36}|[0-9a-z]{10})$/i.test(v)) return toast(T('Bitte eine VRChat-User-ID (usr_…) oder einen Profil-Link angeben.'), true); f.reset(); return chatOpen(v.toLowerCase()); }
            if (f.matches('.ch-comp')) { const text = f.text.value; if (!text.trim()) return; busy = true; return api('chat_send', { uid: chat.uid, text }).then(d => { chat.open = d; f.reset(); }).catch(x => toast(x.message, true)).finally(() => { busy = false; render(); chatLoad(); }); }
            if (f.matches('.cm-sform')) return api('comm_mod', { do: 'mute', vrc_id: f.vrc.value.trim(), hours: f.hours.value }).then(d => { toast(d.msg); loadMod(); }).catch(x => toast(x.message, true));
        });
    }

    window.NexusCommunity = {
        open(s) {
            const el = document.getElementById('cmtBox');
            if (!el) return;
            if (box !== el) { box = el; bind(); }
            loadMe().then(() => go(s && subs().some(x => x[0] === s) ? s : sub));
        },
    };
})();
