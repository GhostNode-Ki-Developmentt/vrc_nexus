'use strict';
/*
 * 🕸 Gemeinsames Netzwerk (Nexus Community, 3.2.3) – soziale Verbindungen als Graph, nur aus echten Daten:
 *   Knoten  = deine Freunde (aus der Freundesliste) + optional Nicht-Freunde, die du im Spiel öfter getroffen hast
 *   Kanten  = gemeinsame Freundschaften (VRChat /users/{id}/mutuals/friends, Zwischenspeicher mutual_cache – gleiche Quelle wie „Gemeinsame Freunde“)
 *   Cluster = gemeinsame VRChat-Gruppen („Communities“): nur Gruppen, die du selbst hast und die die Person öffentlich zeigt (/users/{id}/groups)
 * Datenschutz: VRChat liefert nur öffentlich sichtbare Gruppen; blockierte Personen (/auth/user/playermoderations, type block) erscheinen nie.
 * Abruf langsam im Hintergrund (Rate-Limit), Ergebnisse werden zwischengespeichert (Tage einstellbar wie beim Freundesnetz).
 */
const { str, int, now, arr, sleep, VrcAuthError } = require('./util');

const UID = 1;
const MAX_NONFRIENDS = 60;

class NetGraph {
    constructor(app) {
        this.app = app;
        this.busy = false; this.blocked = new Set(); this.blockedAt = 0; this.myGroups = null; this.myGroupsAt = 0;
        app.db.exec('CREATE TABLE IF NOT EXISTS group_cache (vrc_id TEXT PRIMARY KEY, data TEXT NOT NULL, fetched INTEGER NOT NULL)');
    }
    get t() { return this.app.tools; }
    ttl() { return (int(this.app.settings.get('social.mutual_cache')) || 7) * 86400; }
    rows(table) { return new Map(this.app.db.prepare('SELECT vrc_id, data, fetched FROM ' + table).all().map(r => [r.vrc_id, r])); }
    parse(r, d) { if (!r) return d; try { return JSON.parse(r.data); } catch (e) { return d; } }
    /** Leute aus dem Spiel-Log, die keine Freunde sind (oft getroffen) */
    nonFriends(friendIds) {
        const me = (this.app.vrc.account() || {}).vrc_id;
        return this.app.db.prepare(`SELECT player_id AS id, MAX(player_name) AS name, COUNT(*) AS n FROM game_log WHERE user_id = ? AND kind = 'player_join' AND player_id LIKE 'usr_%'
                                    GROUP BY player_id ORDER BY n DESC LIMIT ?`).all(UID, MAX_NONFRIENDS * 3)
            .filter(r => !friendIds.has(r.id) && r.id !== me && r.n >= 2).slice(0, MAX_NONFRIENDS);
    }
    async refreshMeta(force) {
        const t = now();
        if (force || t - this.blockedAt > 600) {
            try { this.blocked = new Set(arr(await this.t.call('GET', '/auth/user/playermoderations')).filter(m => m && m.type === 'block').map(m => str(m.targetUserId))); this.blockedAt = t; } catch (e) { /* später */ }
        }
        if (force || !this.myGroups || t - this.myGroupsAt > 3600) {
            const me = (this.app.vrc.account() || {}).vrc_id;
            try { this.myGroups = arr(await this.t.call('GET', '/users/' + encodeURIComponent(me) + '/groups')).map(g => ({ id: str(g.groupId || g.id), name: str(g.name), icon: str(g.iconUrl), count: int(g.memberCount) })).filter(g => /^grp_/.test(g.id)); this.myGroupsAt = t; }
            catch (e) { this.myGroups = this.myGroups || []; }
        }
    }
    /** Graph aus dem Zwischenspeicher bauen (schnell) – start=1 holt fehlende Daten im Hintergrund */
    async graph(o) {
        o = o || {};
        await this.refreshMeta(!!o.force);
        const v = this.app.vrc, acc = v.account() || {};
        const friends = v.friendList().filter(f => !this.blocked.has(f.id));
        const fIds = new Set(friends.map(f => f.id));
        const mut = this.rows('mutual_cache'), grp = this.rows('group_cache');
        const myGroups = new Map((this.myGroups || []).map(g => [g.id, g]));
        const nf = o.nonfriends ? this.nonFriends(fIds).filter(r => !this.blocked.has(r.id)) : [];
        const people = friends.map(f => ({ id: f.id, name: f.name, image: f.image, state: f.state, status: f.status, desc: f.status_desc, trust: f.trust[1], fav: !!f.favorite, friend: true }))
            .concat(nf.map(r => { const u = this.t.cached(r.id) || {}; return { id: r.id, name: str(u.displayName) || r.name, image: require('./util').userImage(u), state: '', status: '', desc: '', trust: '#7b8794', fav: false, friend: false, met: r.n }; }));
        const ids = new Set(people.map(p => p.id));
        const edges = [], seen = new Set();
        for (const p of people) {
            for (const other of this.parse(mut.get(p.id), [])) {
                if (!ids.has(other) || other === p.id) continue;
                const k = p.id < other ? p.id + '|' + other : other + '|' + p.id;
                if (!seen.has(k)) { seen.add(k); edges.push([p.id, other]); }
            }
        }
        const deg = {};
        for (const [a, b] of edges) { deg[a] = (deg[a] || 0) + 1; deg[b] = (deg[b] || 0) + 1; }
        // Communities: nur Gruppen, in denen ich selbst bin (gemeinsame Communities)
        const members = new Map();
        for (const p of people) {
            const gs = this.parse(grp.get(p.id), []).filter(g => myGroups.has(g));
            p.groups = gs;
            for (const g of gs) { if (!members.has(g)) members.set(g, []); members.get(g).push(p.id); }
        }
        const groups = [...members.entries()].filter(([, m]) => m.length >= 2).sort((a, b) => b[1].length - a[1].length)
            .map(([id, m]) => ({ id, name: myGroups.get(id).name, icon: myGroups.get(id).icon, count: m.length, members: m }));
        const known = new Set(groups.map(g => g.id));
        for (const p of people) { p.groups = p.groups.filter(g => known.has(g)); p.deg = deg[p.id] || 0; p.fetched = mut.has(p.id); }
        const todo = people.filter(p => !mut.has(p.id) || int(mut.get(p.id).fetched) < now() - this.ttl() || !grp.has(p.id) || int(grp.get(p.id).fetched) < now() - this.ttl()).map(p => p.id);
        if (o.start && todo.length && !this.busy) this.fetch(todo);
        return { me: { id: acc.vrc_id, name: str(acc.display_name), image: str(acc.avatar || ''), status: str((acc.me || {}).status), desc: str((acc.me || {}).statusDescription) },
            nodes: people, edges, groups, stats: { friends: friends.length, nonfriends: nf.length, edges: edges.length, done: people.length - todo.length, total: people.length, busy: this.busy, blocked: this.blocked.size } };
    }
    /** gemeinsame Freunde + öffentliche Gruppen je Person – langsam im Hintergrund */
    async fetch(ids) {
        this.busy = true;
        const db = this.app.db, ttl = this.ttl();
        try {
            for (const id of ids) {
                if (this.stopped) break;
                const mut = db.prepare('SELECT fetched FROM mutual_cache WHERE vrc_id = ?').get(id), grp = db.prepare('SELECT fetched FROM group_cache WHERE vrc_id = ?').get(id);
                try {
                    if (!mut || int(mut.fetched) < now() - ttl) {
                        const out = [];
                        for (let off = 0; off < 1000; off += 100) {
                            const page = arr(await this.t.call('GET', '/users/' + encodeURIComponent(id) + '/mutuals/friends', { n: 100, offset: off }));
                            out.push(...page.map(x => str(x.id)).filter(Boolean));
                            if (page.length < 100) break;
                            await sleep(800);
                        }
                        db.prepare('INSERT OR REPLACE INTO mutual_cache (vrc_id, data, fetched) VALUES (?, ?, ?)').run(id, JSON.stringify(out), now());
                        await sleep(1200);
                    }
                    if (!grp || int(grp.fetched) < now() - ttl) {
                        const gs = arr(await this.t.call('GET', '/users/' + encodeURIComponent(id) + '/groups')).map(g => str(g.groupId || g.id)).filter(g => /^grp_/.test(g));
                        db.prepare('INSERT OR REPLACE INTO group_cache (vrc_id, data, fetched) VALUES (?, ?, ?)').run(id, JSON.stringify(gs), now());
                        await sleep(1200);
                    }
                } catch (e) {
                    if (e instanceof VrcAuthError) break;
                    if (/429/.test(e.message)) { await sleep(20000); continue; }
                    if (!mut) db.prepare('INSERT OR REPLACE INTO mutual_cache (vrc_id, data, fetched) VALUES (?, ?, ?)').run(id, '[]', now());
                    if (!grp) db.prepare('INSERT OR REPLACE INTO group_cache (vrc_id, data, fetched) VALUES (?, ?, ?)').run(id, '[]', now());
                }
            }
        } finally { this.busy = false; }
    }
    async action(act, input) {
        if (act === 'net_graph') return await this.graph({ start: input.start === '1' || input.start === true, nonfriends: input.nonfriends === '1' || input.nonfriends === true, force: input.force === '1' });
        if (act === 'net_refetch') {   // „Fetch“: Zwischenspeicher als veraltet markieren und neu abrufen
            this.app.db.exec('UPDATE mutual_cache SET fetched = 0; UPDATE group_cache SET fetched = 0;');
            return await this.graph({ start: true, nonfriends: input.nonfriends === '1', force: true });
        }
        return null;
    }
}

module.exports = { NetGraph };
