/* VRC Nexus – 🕸 Gemeinsames Netzwerk (Nexus Community, 3.2.3).
 * Interaktiver Graph aus echten Daten (Backend netgraph.js): Freunde als Knoten mit Profilbild, Linien = gemeinsame Freundschaften,
 * farbige Community-Cluster = gemeinsame VRChat-Gruppen. Eigene Canvas-Darstellung (keine externe Bibliothek – die App lädt nichts aus dem Netz):
 * Kräfte mit Raster (schnell auch bei mehreren hundert Knoten), Zeichnen nur bei Änderung.
 * Bedienung: Mausrad = Zoom, Ziehen = verschieben, Klick = auswählen, Doppelklick = Profil, Rechtsklick = Menü, Hover = Infos. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, T = s => (window.t ? window.t(s) : s);
    const PAL = ['#ff4fa3', '#38d5e6', '#f3c262', '#51e57e', '#b38cff', '#ff8a5c', '#3fe0c5', '#ff6b6b', '#7aa2ff', '#e6f35a', '#ff9de2', '#8be9fd'];
    const ST = { 'join me': '#38bdf8', active: '#51e57e', 'ask me': '#f59e0b', busy: '#ef4444' };
    let box = null, data = null, poll = null;
    const S = { q: '', mode: 'all', min: 0, clusters: true, nonfriends: false, groups: new Set(), hidden: new Set(), sel: '', hover: '', sort: 'status', fq: '' };
    const V = { x: 0, y: 0, k: 1 };                  // Kamera
    const P = new Map();                              // Positionen je Knoten (bleiben beim Neuladen erhalten)
    const IMG = new Map();
    let nodes = [], edges = [], byId = new Map(), alpha = 0, dirty = true, canvas = null, ctx = null, dpr = 1, W = 800, H = 600;

    const colorOf = gid => { const i = data ? data.groups.findIndex(g => g.id === gid) : -1; return i < 0 ? '#7b8794' : PAL[i % PAL.length]; };
    function img(url) {
        if (!url) return null;
        let im = IMG.get(url);
        if (!im) { im = new Image(); im.decoding = 'async'; im.referrerPolicy = 'no-referrer'; im.onload = () => { dirty = true; }; im.src = UI.pic ? UI.pic(url) : url; IMG.set(url, im); }
        return im.complete && im.naturalWidth ? im : null;
    }

    // ---------- sichtbare Teilmenge nach Filtern ----------
    function visible() {
        if (!data) return;
        const q = S.q.toLowerCase();
        nodes = data.nodes.filter(n => !S.hidden.has(n.id)
            && (S.mode !== 'friends' || n.friend)
            && (S.mode !== 'fof' || !n.friend || n.deg > 0)
            && (n.friend || S.nonfriends)
            && (n.deg >= S.min || n.id === S.sel || (q && n.name.toLowerCase().includes(q)))
            && (!S.groups.size || n.groups.some(g => S.groups.has(g))));
        byId = new Map(nodes.map(n => [n.id, n]));
        edges = data.edges.map(([a, b]) => [byId.get(a), byId.get(b)]).filter(e => e[0] && e[1]);
        for (const n of nodes) {
            if (!P.has(n.id)) { const a = Math.random() * Math.PI * 2, r = 80 + Math.random() * 260; P.set(n.id, { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0 }); }
            n.p = P.get(n.id); n.r = 11 + Math.min(13, Math.sqrt(n.deg) * 2.2); n.prim = n.groups[0] || '';
        }
        alpha = Math.max(alpha, 0.9); dirty = true;
    }

    // ---------- Kräfte (Raster statt n²) ----------
    function tick() {
        if (!data || alpha < 0.005) return false;
        const cell = 140, grid = new Map();
        for (const n of nodes) { const k = Math.floor(n.p.x / cell) + ',' + Math.floor(n.p.y / cell); (grid.get(k) || grid.set(k, []).get(k)).push(n); }
        for (const n of nodes) {
            const cx = Math.floor(n.p.x / cell), cy = Math.floor(n.p.y / cell);
            for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
                const list = grid.get((cx + i) + ',' + (cy + j)); if (!list) continue;
                for (const m of list) {
                    if (m === n) continue;
                    let dx = n.p.x - m.p.x, dy = n.p.y - m.p.y, d2 = dx * dx + dy * dy || 0.01;
                    const min = n.r + m.r + 14, f = (1400 / d2) + (d2 < min * min ? 0.4 : 0);
                    n.p.vx += dx * f * alpha * 0.05; n.p.vy += dy * f * alpha * 0.05;
                }
            }
        }
        for (const [a, b] of edges) {
            const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y, d = Math.sqrt(dx * dx + dy * dy) || 1, f = (d - 90) * 0.006 * alpha;
            a.p.vx += dx / d * f * 10; a.p.vy += dy / d * f * 10; b.p.vx -= dx / d * f * 10; b.p.vy -= dy / d * f * 10;
        }
        if (S.clusters && data.groups.length) {   // zur Mitte der eigenen (ersten) Community ziehen
            const cen = new Map();
            for (const n of nodes) if (n.prim) { const c = cen.get(n.prim) || cen.set(n.prim, { x: 0, y: 0, n: 0 }).get(n.prim); c.x += n.p.x; c.y += n.p.y; c.n++; }
            for (const n of nodes) { const c = n.prim && cen.get(n.prim); if (c && c.n > 1) { n.p.vx += (c.x / c.n - n.p.x) * 0.01 * alpha; n.p.vy += (c.y / c.n - n.p.y) * 0.01 * alpha; } }
        }
        for (const n of nodes) {
            if (n.drag) { n.p.vx = n.p.vy = 0; continue; }
            n.p.vx += -n.p.x * 0.0015 * alpha; n.p.vy += -n.p.y * 0.0015 * alpha;
            n.p.vx *= 0.78; n.p.vy *= 0.78;
            n.p.x += Math.max(-12, Math.min(12, n.p.vx)); n.p.y += Math.max(-12, Math.min(12, n.p.vy));
        }
        alpha *= 0.985;
        return true;
    }

    // ---------- Zeichnen ----------
    const toScreen = p => ({ x: (p.x - V.x) * V.k + W / 2, y: (p.y - V.y) * V.k + H / 2 });
    const toWorld = (sx, sy) => ({ x: (sx - W / 2) / V.k + V.x, y: (sy - H / 2) / V.k + V.y });
    function draw() {
        if (!ctx || !data) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        const sel = S.sel && byId.get(S.sel), neigh = new Set();
        if (sel) for (const [a, b] of edges) { if (a === sel) neigh.add(b.id); if (b === sel) neigh.add(a.id); }
        const q = S.q.toLowerCase();
        ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(V.k, V.k); ctx.translate(-V.x, -V.y);
        // Community-Cluster (weiche Kreise um die Mitglieder)
        if (S.clusters) {
            for (const g of data.groups) {
                if (S.groups.size && !S.groups.has(g.id)) continue;
                const m = nodes.filter(n => n.groups.includes(g.id)); if (m.length < 2) continue;
                const cx = m.reduce((s, n) => s + n.p.x, 0) / m.length, cy = m.reduce((s, n) => s + n.p.y, 0) / m.length;
                const r = Math.max(...m.map(n => Math.hypot(n.p.x - cx, n.p.y - cy) + n.r)) + 18;
                const c = colorOf(g.id), on = S.groups.has(g.id);
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fillStyle = c + (on ? '22' : '12'); ctx.fill();
                ctx.strokeStyle = c + (on ? 'aa' : '44'); ctx.lineWidth = (on ? 2 : 1) / V.k; ctx.setLineDash([6 / V.k, 6 / V.k]); ctx.stroke(); ctx.setLineDash([]);
                if (V.k > 0.45) { ctx.font = (12 / V.k) + 'px Segoe UI, sans-serif'; ctx.fillStyle = c; ctx.textAlign = 'center'; ctx.fillText(g.name + ' · ' + m.length, cx, cy - r - 6 / V.k); }
            }
        }
        // Linien
        for (const [a, b] of edges) {
            const hi = sel && (a === sel || b === sel);
            ctx.strokeStyle = hi ? 'rgba(255,255,255,0.75)' : sel ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.10)';
            ctx.lineWidth = (hi ? 1.8 : 1) / V.k;
            ctx.beginPath(); ctx.moveTo(a.p.x, a.p.y); ctx.lineTo(b.p.x, b.p.y); ctx.stroke();
        }
        // Knoten
        for (const n of nodes) {
            const dim = sel && n !== sel && !neigh.has(n.id), match = q && n.name.toLowerCase().includes(q);
            ctx.globalAlpha = dim ? 0.25 : 1;
            const r = n.r, x = n.p.x, y = n.p.y;
            if (n === sel || match) { ctx.beginPath(); ctx.arc(x, y, r + 7, 0, Math.PI * 2); ctx.fillStyle = n === sel ? 'rgba(56,213,230,0.35)' : 'rgba(243,194,98,0.35)'; ctx.fill(); }
            const im = img(n.image);
            ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
            if (im) ctx.drawImage(im, x - r, y - r, r * 2, r * 2); else { ctx.fillStyle = '#1b2533'; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.fillStyle = '#cbd5e1'; ctx.font = (r) + 'px Segoe UI'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText((n.name[0] || '?').toUpperCase(), x, y + 1); }
            ctx.restore();
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.lineWidth = 3 / Math.max(1, V.k * 0.8); ctx.strokeStyle = n.prim ? colorOf(n.prim) : (n.friend ? n.trust : '#7b8794'); ctx.stroke();
            if (!n.friend) { ctx.setLineDash([3, 3]); ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
            // weitere Communities als Punkte am Rand (Mehrfachzugehörigkeit)
            n.groups.slice(1, 5).forEach((g, i) => { const a = -Math.PI / 4 + i * 0.5; ctx.beginPath(); ctx.arc(x + Math.cos(a) * (r + 1), y + Math.sin(a) * (r + 1), 3.2, 0, Math.PI * 2); ctx.fillStyle = colorOf(g); ctx.fill(); });
            if (n.state && n.state !== 'offline') { ctx.beginPath(); ctx.arc(x + r * 0.7, y + r * 0.7, 4, 0, Math.PI * 2); ctx.fillStyle = ST[n.status] || '#51e57e'; ctx.fill(); ctx.strokeStyle = '#0b121b'; ctx.lineWidth = 1.5; ctx.stroke(); }
            if (V.k > 0.85 || n === sel || n.id === S.hover || match) { ctx.font = '600 ' + (11 / Math.max(1, V.k * 0.9)) + 'px Segoe UI, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = '#e2e8f0'; ctx.fillText(n.name, x, y + r + 4); }
            ctx.globalAlpha = 1;
        }
        ctx.restore();
    }
    function loop() {
        if (!canvas || !document.body.contains(canvas)) { canvas = null; return; }
        if (box && box.offsetParent) { const moved = tick(); if (moved || dirty) { draw(); dirty = false; } }
        requestAnimationFrame(loop);
    }

    // ---------- Kamera ----------
    function focus(n, k) {
        if (!n) return;
        const from = { x: V.x, y: V.y, k: V.k }, to = { x: n.p.x, y: n.p.y, k: k || Math.max(V.k, 1.3) }, t0 = performance.now();
        const step = t => { const f = Math.min(1, (t - t0) / 350), e = 1 - Math.pow(1 - f, 3); V.x = from.x + (to.x - from.x) * e; V.y = from.y + (to.y - from.y) * e; V.k = from.k + (to.k - from.k) * e; dirty = true; if (f < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
    }
    function fit() {
        if (!nodes.length) { V.x = V.y = 0; V.k = 1; dirty = true; return; }
        const xs = nodes.map(n => n.p.x), ys = nodes.map(n => n.p.y);
        const w = Math.max(...xs) - Math.min(...xs) + 120, h = Math.max(...ys) - Math.min(...ys) + 120;
        V.x = (Math.max(...xs) + Math.min(...xs)) / 2; V.y = (Math.max(...ys) + Math.min(...ys)) / 2; V.k = Math.max(0.2, Math.min(2, Math.min(W / w, H / h))); dirty = true;
    }
    const hit = (sx, sy) => { const w = toWorld(sx, sy); let best = null, bd = Infinity; for (const n of nodes) { const d = Math.hypot(n.p.x - w.x, n.p.y - w.y); if (d < n.r + 4 && d < bd) { bd = d; best = n; } } return best; };

    // ---------- Oberfläche ----------
    function shell() {
        box.innerHTML = '<div class="ng">'
            + '<div class="ng-bar nc-row">'
            + '<input type="search" id="ngQ" placeholder="' + esc(T('Person suchen (Name oder usr_…)')) + '">'
            + '<button type="button" class="btn btn-sm btn-gold" data-ng="fetch" title="' + esc(T('Netzwerkdaten bei VRChat neu abrufen')) + '">⇣ Fetch</button>'
            + '<button type="button" class="btn btn-sm" data-ng="reload" title="' + esc(T('Visualisierung neu laden')) + '">↻ ' + esc(T('Neu laden')) + '</button>'
            + '<label class="ng-tg"><input type="checkbox" data-ngt="nonfriends"> ' + esc(T('Nicht-Freunde')) + '</label>'
            + '<label class="ng-tg"><input type="checkbox" data-ngt="clusters" checked> ' + esc(T('Communities')) + '</label>'
            + '<select id="ngMode" title="' + esc(T('Verbindungsfilter')) + '"><option value="all">' + esc(T('Alle')) + '</option><option value="friends">' + esc(T('Nur direkte Freunde')) + '</option><option value="fof">' + esc(T('Nur mit Verbindungen')) + '</option></select>'
            + '<label class="ng-sl" title="' + esc(T('Mindestanzahl gemeinsamer Verbindungen')) + '">' + esc(T('min.')) + ' <input type="range" id="ngMin" min="0" max="20" value="0"> <b id="ngMinV">0</b></label>'
            + '<button type="button" class="btn btn-sm" data-ng="reset">⟲ ' + esc(T('Zurücksetzen')) + '</button>'
            + '<span class="ng-info small muted" id="ngInfo"></span></div>'
            + '<div class="ng-body"><div class="ng-main"><canvas id="ngCanvas"></canvas><div class="ng-tip" id="ngTip" hidden></div><div class="ng-hint small muted">' + esc(T('Mausrad: Zoom · Ziehen: verschieben · Klick: auswählen · Doppelklick: Profil · Rechtsklick: Menü')) + '</div></div>'
            + '<aside class="ng-side" id="ngSide"></aside></div></div>';
        canvas = box.querySelector('#ngCanvas'); ctx = canvas.getContext('2d');
        const resize = () => { const r = canvas.parentNode.getBoundingClientRect(); dpr = window.devicePixelRatio || 1; W = Math.max(300, r.width); H = Math.max(300, r.height); canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; dirty = true; };
        new ResizeObserver(resize).observe(canvas.parentNode); resize();
        bind();
        requestAnimationFrame(loop);
    }
    function side() {
        const el = box.querySelector('#ngSide'); if (!el || !data) return;
        const me = data.me, st = data.stats;
        const fq = S.fq.toLowerCase();
        const order = { 'join me': 0, active: 1, 'ask me': 2, busy: 3 };
        const friends = data.nodes.filter(n => n.friend && (!fq || n.name.toLowerCase().includes(fq))).sort(S.sort === 'name' ? (a, b) => a.name.localeCompare(b.name)
            : S.sort === 'conn' ? (a, b) => b.deg - a.deg || a.name.localeCompare(b.name)
                : (a, b) => ((a.state === 'offline') - (b.state === 'offline')) || ((order[a.status] ?? 9) - (order[b.status] ?? 9)) || a.name.localeCompare(b.name));
        el.innerHTML = '<div class="ng-me">' + UI.img(me.image, 'fs-img', me.name) + '<div><b data-no-i18n>' + esc(me.name) + '</b><small>' + UI.statusDot(me.status) + ' ' + esc(me.desc || '') + '</small></div></div>'
            + '<div class="vx-kpis sm"><div><b>' + st.friends + '</b><span>' + esc(T('Freunde')) + '</span></div><div><b>' + st.edges + '</b><span>' + esc(T('gemeinsame Verbindungen')) + '</span></div><div><b>' + data.groups.length + '</b><span>' + esc(T('Communities')) + '</span></div></div>'
            + (st.busy || st.done < st.total ? '<p class="small muted">' + esc(T('Abgefragt')) + ' ' + st.done + '/' + st.total + (st.busy ? ' · ⏳' : '') + '</p>' : '')
            + '<h4 class="ng-h">🫂 ' + esc(T('Communities')) + (S.groups.size ? ' <button type="button" class="nc-link" data-ngg="">' + esc(T('alle')) + '</button>' : '') + '</h4>'
            + '<div class="ng-groups">' + (data.groups.length ? data.groups.map(g => '<button type="button" class="ng-g' + (S.groups.has(g.id) ? ' on' : '') + '" data-ngg="' + esc(g.id) + '" title="' + esc(T('Als Filter umschalten')) + '"><i style="background:' + colorOf(g.id) + '"></i><span data-no-i18n>' + esc(g.name) + '</span><small>' + g.count + '</small></button>').join('') : '<p class="small muted">' + esc(T('Noch keine gemeinsamen Communities – „Fetch“ fragt die Gruppen deiner Freunde ab.')) + '</p>') + '</div>'
            + '<h4 class="ng-h">👥 ' + esc(T('Freunde')) + '</h4><div class="nc-row"><input type="search" id="ngFq" placeholder="' + esc(T('Freunde suchen …')) + '" value="' + esc(S.fq) + '" style="flex:1"><select id="ngSort"><option value="status"' + (S.sort === 'status' ? ' selected' : '') + '>' + esc(T('Status')) + '</option><option value="name"' + (S.sort === 'name' ? ' selected' : '') + '>A–Z</option><option value="conn"' + (S.sort === 'conn' ? ' selected' : '') + '>' + esc(T('Verbindungen')) + '</option></select></div>'
            + '<div class="ng-list">' + friends.slice(0, 400).map(n => '<button type="button" class="fs-row ng-f' + (n.id === S.sel ? ' sel' : '') + (byId.has(n.id) ? '' : ' off') + '" data-ngf="' + esc(n.id) + '">' + UI.img(n.image, 'fs-img', n.name)
                + '<span class="fs-txt"><b data-no-i18n>' + UI.statusDot(n.state === 'offline' ? 'offline' : n.status) + ' ' + esc(n.name) + '</b><small>' + n.deg + ' ' + esc(T('gemeinsam')) + (n.groups.length ? ' · ' + n.groups.length + ' ' + esc(T('Communities')) : '') + '</small></span></button>').join('') + '</div>';
    }
    function info() {
        const el = box.querySelector('#ngInfo'); if (!el || !data) return;
        el.textContent = nodes.length + ' ' + T('Personen') + ' · ' + edges.length + ' ' + T('Verbindungen') + (data.stats.busy ? ' · ⏳ ' + T('lädt') + ' ' + data.stats.done + '/' + data.stats.total : '');
    }
    function select(id, center) { S.sel = id || ''; dirty = true; side(); if (center && id) focus(byId.get(id)); }
    function tip(n, sx, sy) {
        const t = box.querySelector('#ngTip'); if (!t) return;
        if (!n) { t.hidden = true; return; }
        const gs = n.groups.map(g => data.groups.find(x => x.id === g)).filter(Boolean);
        t.innerHTML = '<b data-no-i18n>' + esc(n.name) + '</b>' + (n.friend ? '' : ' <span class="vx-pill">' + esc(T('kein Freund')) + '</span>')
            + '<div class="small">' + (n.friend ? UI.statusDot(n.state === 'offline' ? 'offline' : n.status) + ' ' + esc(n.desc || (n.state === 'offline' ? T('offline') : n.status)) : esc(T('im Spiel getroffen')) + ': ' + n.met + '×') + '</div>'
            + '<div class="small">🔗 ' + n.deg + ' ' + esc(T('gemeinsame Verbindungen')) + '</div>'
            + (gs.length ? '<div class="small">' + gs.map(g => '<span class="ng-dot" style="background:' + colorOf(g.id) + '"></span>' + esc(g.name)).join(' · ') + '</div>' : '');
        t.hidden = false;
        t.style.left = Math.min(sx + 14, W - 240) + 'px'; t.style.top = Math.min(sy + 14, H - 90) + 'px';
    }
    function bind() {
        let drag = null, moved = false, lastClick = 0;
        const pt = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
        canvas.addEventListener('wheel', e => { e.preventDefault(); const [sx, sy] = pt(e), w = toWorld(sx, sy), f = e.deltaY < 0 ? 1.15 : 1 / 1.15; V.k = Math.max(0.1, Math.min(5, V.k * f)); const w2 = toWorld(sx, sy); V.x += w.x - w2.x; V.y += w.y - w2.y; dirty = true; }, { passive: false });
        canvas.addEventListener('mousedown', e => { if (e.button !== 0) return; const [sx, sy] = pt(e), n = hit(sx, sy); moved = false; drag = { n, sx, sy, vx: V.x, vy: V.y }; if (n) n.drag = true; });
        window.addEventListener('mousemove', e => {
            if (!canvas) return;
            const [sx, sy] = pt(e);
            if (drag) {
                if (Math.abs(sx - drag.sx) + Math.abs(sy - drag.sy) > 3) moved = true;
                if (drag.n) { const w = toWorld(sx, sy); drag.n.p.x = w.x; drag.n.p.y = w.y; alpha = Math.max(alpha, 0.3); }
                else { V.x = drag.vx - (sx - drag.sx) / V.k; V.y = drag.vy - (sy - drag.sy) / V.k; }
                dirty = true; return;
            }
            if (e.target !== canvas) return;
            const n = hit(sx, sy); canvas.style.cursor = n ? 'pointer' : 'grab';
            if ((n && n.id) !== S.hover) { S.hover = n ? n.id : ''; dirty = true; }
            tip(n, sx, sy);
        });
        window.addEventListener('mouseup', () => {
            if (!drag) return;
            if (drag.n) drag.n.drag = false;
            if (!moved) {
                const t = Date.now();
                if (drag.n && t - lastClick < 320 && S.sel === drag.n.id) UI.openUser(drag.n.id);   // Doppelklick = Profil
                else select(drag.n ? drag.n.id : '');
                lastClick = t;
            }
            drag = null;
        });
        canvas.addEventListener('mouseleave', () => { tip(null); S.hover = ''; dirty = true; });
        canvas.addEventListener('contextmenu', e => {
            const [sx, sy] = pt(e), n = hit(sx, sy); if (!n) return;
            e.preventDefault();
            const a = document.createElement('span'); a.style.cssText = 'position:fixed;left:' + e.clientX + 'px;top:' + e.clientY + 'px'; document.body.appendChild(a);
            UI.popMenu(a, [{ head: n.name }, { label: '👤 ' + T('Profil öffnen'), fn: () => UI.openUser(n.id) }, { label: '🎯 ' + T('Fokus'), fn: () => select(n.id, true) },
                { label: '🙈 ' + T('Ausblenden'), fn: () => { S.hidden.add(n.id); if (S.sel === n.id) S.sel = ''; visible(); side(); info(); } }]);
            setTimeout(() => a.remove(), 0);
        });
        box.addEventListener('click', e => {
            const b = e.target.closest('[data-ng]');
            if (b) {
                const k = b.dataset.ng;
                if (k === 'fetch') return load('net_refetch');
                if (k === 'reload') { P.clear(); return load('net_graph', true); }
                if (k === 'reset') { S.groups.clear(); S.hidden.clear(); S.min = 0; S.mode = 'all'; S.q = ''; S.sel = ''; box.querySelector('#ngQ').value = ''; box.querySelector('#ngMin').value = 0; box.querySelector('#ngMinV').textContent = '0'; box.querySelector('#ngMode').value = 'all'; visible(); fit(); side(); info(); return; }
            }
            const g = e.target.closest('[data-ngg]');
            if (g) { const id = g.dataset.ngg; if (!id) S.groups.clear(); else if (S.groups.has(id)) S.groups.delete(id); else S.groups.add(id); visible(); side(); info(); return; }
            const f = e.target.closest('[data-ngf]');
            if (f) { if (!byId.has(f.dataset.ngf)) { S.hidden.delete(f.dataset.ngf); S.min = 0; S.groups.clear(); box.querySelector('#ngMin').value = 0; box.querySelector('#ngMinV').textContent = '0'; visible(); } select(f.dataset.ngf, true); }
        });
        box.addEventListener('dblclick', e => { const f = e.target.closest('[data-ngf]'); if (f) UI.openUser(f.dataset.ngf); });
        box.addEventListener('change', e => {
            const t = e.target;
            if (t.dataset.ngt === 'nonfriends') { S.nonfriends = t.checked; return load('net_graph'); }
            if (t.dataset.ngt === 'clusters') { S.clusters = t.checked; alpha = Math.max(alpha, 0.5); dirty = true; return; }
            if (t.id === 'ngMode') { S.mode = t.value; visible(); info(); return; }
            if (t.id === 'ngSort') { S.sort = t.value; return side(); }
        });
        box.addEventListener('input', e => {
            const t = e.target;
            if (t.id === 'ngMin') { S.min = +t.value; box.querySelector('#ngMinV').textContent = t.value; visible(); info(); return; }
            if (t.id === 'ngFq') { S.fq = t.value; const pos = t.selectionStart; side(); const n = box.querySelector('#ngFq'); n.focus(); n.setSelectionRange(pos, pos); return; }
            if (t.id === 'ngQ') { S.q = t.value.trim(); visible(); info(); }
        });
        box.addEventListener('keydown', e => {
            if (e.target.id !== 'ngQ' || e.key !== 'Enter') return;
            const q = S.q.toLowerCase(), n = nodes.find(x => x.id.toLowerCase() === q) || nodes.find(x => x.name.toLowerCase().includes(q));
            if (n) select(n.id, true); else UI.toast(T('Nicht im Netzwerk gefunden.'), true);
        });
    }
    function load(act, refit) {
        clearTimeout(poll);
        return UI.api(act, { start: '1', nonfriends: S.nonfriends ? '1' : '' }).then(d => {
            const first = !data;
            data = d; visible(); side(); info();
            if (first || refit) setTimeout(fit, 600);
            if (d.stats.busy) poll = setTimeout(() => { if (box && box.offsetParent) load('net_graph'); }, 6000);
        }).catch(e => UI.toast('⚠ ' + e.message, true));
    }
    window.NexusNet = {
        open() {
            const el = document.getElementById('ngBox'); if (!el) return;
            if (box !== el || !el.querySelector('#ngCanvas')) { box = el; shell(); }
            if (!canvas) { canvas = box.querySelector('#ngCanvas'); ctx = canvas.getContext('2d'); requestAnimationFrame(loop); }
            load('net_graph');
        },
    };
})();
