'use strict';
/*
 * Kleiner VRChat-API-Mock für Oberflächen-Tests (nur Testdaten, kein echtes Konto).
 *   node tests/ui/mock-vrchat.js 8792      → http://127.0.0.1:8792/api/1
 * Anmeldung mit beliebigem Namen und Passwort „test“.
 */
const http = require('http');

const ME = 'usr_00000000-0000-4000-8000-000000000001';
const uid = n => 'usr_00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const WORLD = 'wrld_00000000-0000-4000-8000-000000000101';
const names = ['Luna Fox', 'Wolf Byte', 'Pixel Cat', 'Nova Star', 'Ember Fae', 'Kito Rune', 'Sable Moth', 'Juniper Owl'];
const friends = names.map((name, i) => ({
    id: uid(10 + i), displayName: name, status: ['join me', 'active', 'ask me', 'busy'][i % 4], statusDescription: i % 2 ? 'chillen 🎶' : '',
    location: i < 3 ? WORLD + ':1234~friends(' + ME + ')~region(eu)' : i < 6 ? 'offline' : 'private', platform: 'standalonewindows', last_platform: 'standalonewindows',
    tags: ['system_trust_basic', 'system_trust_known'], currentAvatarThumbnailImageUrl: '', userIcon: '', profilePicOverride: '', bio: 'Testprofil', bioLinks: [],
    last_login: new Date().toISOString(), last_activity: new Date().toISOString(), date_joined: '2021-01-01', isFriend: true,
}));
const me = { id: ME, displayName: 'Test Nutzerin', username: 'test', status: 'active', statusDescription: 'Testdaten', currentAvatarThumbnailImageUrl: '', userIcon: '', tags: ['system_trust_veteran', 'system_trust_trusted'],
    friends: friends.map(f => f.id), onlineFriends: friends.slice(0, 3).map(f => f.id), activeFriends: [], offlineFriends: friends.slice(3).map(f => f.id), bio: '', bioLinks: [], location: 'offline', presence: {} };

function route(req, url) {
    const p = url.pathname.replace(/^\/api\/1/, '');
    if (p === '/auth/user') {
        const auth = req.headers.authorization || '';
        if (auth.startsWith('Basic ')) { const [, pw] = Buffer.from(auth.slice(6), 'base64').toString().split(':'); return pw === 'test' ? [200, me, true] : [401, { error: { message: 'Invalid Username/Email or Password' } }]; }
        return /auth=mock/.test(req.headers.cookie || '') ? [200, me] : [401, { error: { message: 'Missing Credentials' } }];
    }
    if (p === '/auth/user/friends') return [200, url.searchParams.get('offline') === 'true' ? friends.filter(f => f.location === 'offline') : friends.filter(f => f.location !== 'offline')];
    let m;
    if ((m = /^\/users\/(usr_[\w-]+)$/.exec(p))) { const u = friends.find(f => f.id === m[1]) || (m[1] === ME ? me : null); return u ? [200, u] : [404, { error: { message: 'Not found' } }]; }
    if (/^\/users\/[\w-]+\/groups/.test(p)) return [200, []];
    if (/^\/worlds\/wrld_/.test(p)) return [200, { id: WORLD, name: 'Testwelt', authorName: 'Mock', capacity: 32, imageUrl: '', thumbnailImageUrl: '' }];
    if (p === '/visits') return [200, 1234];
    return [200, []];
}

function start(port) {
    const srv = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://x');
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
            const [code, json, login] = route(req, url);
            const h = { 'Content-Type': 'application/json' };
            if (login) h['Set-Cookie'] = 'auth=mock; Path=/; HttpOnly';
            res.writeHead(code, h);
            res.end(JSON.stringify(json));
        });
    });
    return new Promise(r => srv.listen(port || 0, '127.0.0.1', () => r(srv)));
}

if (require.main === module) start(+(process.argv[2] || 8792)).then(s => console.log('VRChat-Mock auf http://127.0.0.1:' + s.address().port + '/api/1'));
module.exports = { start, ME, friends, WORLD };
