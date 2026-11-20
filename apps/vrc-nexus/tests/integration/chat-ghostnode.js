/*
 * Integrationstest Privat-Chat gegen eine TESTKOPIE der GhostNode-Webseite (nie gegen den echten Server):
 *   1) node tests/ui/mock-vrchat.js 8792 &
 *   2) in der Testkopie: php tools/tests/nexus_test_setup.php && php -S 127.0.0.1:8903 &
 *   3) GHOSTNODE_SITE=/pfad/zur/testkopie node tests/integration/chat-ghostnode.js
 * Prüft: Sitzungsaufbau, mehrere Geräte, Abgleich, Sicherheitsnummer, Schlüsselwechsel-Warnung, kein Klartext auf dem Server.
 */
process.env.NEXUS_ACCT_BASE = process.env.NEXUS_ACCT_BASE || 'http://127.0.0.1:8903';
const assert = require('assert');
const { openDatabase } = require('../../backend/db');
const { NexusApp } = require('../../backend/app');
const mock = b => fetch('http://127.0.0.1:8792/api/1/__mock/set', { method: 'POST', body: JSON.stringify(b) });
const mk = async uid => {
  const db = await openDatabase(null);
  const app = new NexusApp({ db, crypt: { encrypt: s => 'E:' + Buffer.from(s).toString('base64'), decrypt: s => Buffer.from(String(s).slice(2), 'base64').toString() }, host: { userData: require('os').tmpdir(), notify: (t, b) => console.log('  [notify]', t, b) } });
  app.game.osc.stopListen();
  app.vrc.account = () => ({ vrc_id: uid, me: {} });
  let bio = ''; app.tools.call = async (m, p, q, b) => { if (m === 'PUT') { bio = b.bio; await mock({ id: uid, bio }); } return { bio }; };
  const r = await app.post({ act: 'acct_connect', auto: '1' }, {}); assert.ok(r.connected, uid);
  app.db2 = db; return app;
};
(async () => {
  const UA = 'usr_00000000-0000-4000-8000-000000000001', UB = 'usr_00000000-0000-4000-8000-000000000012';
  const a = await mk(UA), b = await mk(UB), a2 = await mk(UA);   // a2 = zweites Gerät von A
  const P = (app, act, d) => app.post(Object.assign({ act }, d || {}), {});
  await assert.rejects(P(a, 'chat_send', { uid: UB, text: 'hi' }), /noch nicht eingerichtet/);
  await P(b, 'chat_list'); await P(a2, 'chat_list'); await P(a, 'chat_list', { poll: '1' });
  let r = await P(a, 'chat_open', { uid: UB }); assert.ok(r.ready && /\d{5}/.test(r.safety)); const safetyA = r.safety;
  await P(a, 'chat_send', { uid: UB, text: 'Hallo B 🦊' }); await P(a, 'chat_send', { uid: UB, text: 'zweite' });
  r = await P(b, 'chat_open', { uid: UA }); assert.deepStrictEqual(r.messages.map(m => m.text), ['Hallo B 🦊', 'zweite']); 
  assert.strictEqual(r.safety, safetyA, 'Sicherheitsnummer auf beiden Seiten gleich');
  await P(b, 'chat_send', { uid: UA, text: 'Hi A!' });
  r = await P(a, 'chat_open', { uid: UB }); assert.deepStrictEqual(r.messages.map(m => m.text), ['Hallo B 🦊', 'zweite', 'Hi A!']);
  r = await P(a2, 'chat_open', { uid: UB }); assert.deepStrictEqual(r.messages.map(m => m.text), ['Hallo B 🦊', 'zweite', 'Hi A!'], 'zweites Gerät hat alles (auch eigene Nachrichten)');
  await P(a2, 'chat_send', { uid: UB, text: 'vom Handy-PC' });
  r = await P(b, 'chat_open', { uid: UA }); assert.strictEqual(r.messages.pop().text, 'vom Handy-PC');
  r = await P(a, 'chat_open', { uid: UB }); assert.strictEqual(r.messages.pop().text, 'vom Handy-PC');
  // Server sieht keinen Klartext
  const { execSync } = require('child_process');
  const dump = execSync("php -r 'require \"inc/core/pages.php\"; foreach (db_get(\"vrchat\")->query(\"SELECT body FROM chat_inbox\")->fetchAll() as $r) echo $r[\"body\"];' ; ls data", { cwd: process.env.GHOSTNODE_SITE }).toString();
  assert.ok(!/Hallo|zweite|Handy/.test(dump), 'Klartext auf dem Server!');
  // lokal verschlüsselt gespeichert
  assert.ok(!/Hallo/.test(JSON.stringify(a.db2.setting('chat_msgs:' + UA, ''))) && a.db2.setting('chat_msgs:' + UA, '').startsWith('E:'));
  // neues Gerät bei B → Warnung bei A
  const b2 = await mk(UB); await P(b2, 'chat_list');
  r = await P(a, 'chat_open', { uid: UB }); assert.ok(r.changed && r.safety !== safetyA, 'Schlüsseländerung erkannt');
  r = await P(a, 'chat_verify', { uid: UB }); assert.ok(r.verified && !r.changed);
  await P(a, 'chat_send', { uid: UB, text: 'an beide B-Geräte' });
  r = await P(b2, 'chat_open', { uid: UA }); assert.strictEqual(r.messages.pop().text, 'an beide B-Geräte');
  r = await P(b, 'chat_open', { uid: UA }); assert.strictEqual(r.messages.pop().text, 'an beide B-Geräte');
  r = await P(b, 'chat_list'); assert.ok(r.items[0].uid === UA);
  console.log('✔ Chat-Integration: alles gut');
  for (const x of [a, b, a2, b2]) x.tools.stop();
  process.exit(0);
})().catch(e => { console.error('✖', e); process.exit(1); });
