const { webcrypto: C } = require('crypto'); const fs = require('fs');
const enc = new TextEncoder(); const SALT = 'drivers-requests-v1';
const j = require('./shamel.json'), R = j.base.residents, S = require('./state2.json').months['2026-11'];
const P = {};
const add = (iq, o) => { if (!/^[12]\d{9}$/.test(iq || '')) return; const x = P[iq] = P[iq] || { n: '', ph: '', c: '', ib: '', acc: [], bd: '' }; Object.keys(o).forEach(k => { if (k === 'acc') x.acc.push(o.acc); else if (o[k] && !x[k]) x[k] = o[k]; }); };
for (const r of Object.values(R)) if (!r.left) add(r.iq, { n: r.name, ph: r.phone || '', c: r.city || '', ib: r.iban ? String(r.iban).replace(/\s/g, '').slice(-4) : '', bd: r.birth ? String(r.birth.__d || r.birth).slice(0, 10) : '' });
for (const r of S.k) add(r[1], { n: r[2].replace(/\s+/g, ' ').trim(), c: r[8], acc: { p: 'كيتا', id: r[0], s: r[9] } });
for (const r of S.h) add(r[1], { n: r[3].replace(/\s+/g, ' ').trim(), c: r[5], acc: { p: 'هنقرستيشن', id: r[0], s: r[11] } });
(async () => {
  const d = {}; const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  const SPON = new Set(Object.values(R).filter(r => !r.left).map(r => String(r.iq)));   // على الكفالة بس
  // اللي نزل نهائي ورجع بإقامة جديدة (مثلاً على مسار الصفوة برو): الإقامة الجديدة والقديمة الاتنين مسموحين
  const LINKS = (j.base && j.base.links) || j.links || {}; for (const [nw, x] of Object.entries(LINKS)) if (x && x.old) { SPON.add(nw); SPON.add(String(x.old)); }
  for (const iq in P) {
    if (!SPON.has(iq)) { d[hex(await C.subtle.digest('SHA-256', enc.encode('req:' + iq))).slice(0, 24)] = 'x:'; continue; }   // مش على الكفالة: النظام مقفول
    const id = hex(await C.subtle.digest('SHA-256', enc.encode('req:' + iq))).slice(0, 24);
    const bd = P[iq].bd; delete P[iq].bd; const secret = bd ? iq + '|' + bd : iq;
    const base = await C.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
    const key = await C.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode(SALT), iterations: 120000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const iv = C.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await C.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(P[iq]))));
    const all = new Uint8Array(12 + ct.length); all.set(iv); all.set(ct, 12); d[id] = (bd ? 'b:' : 'i:') + Buffer.from(all).toString('base64');
  }
  fs.writeFileSync('/home/claude/sayarti/mandoob/data.json', JSON.stringify({ v: 2, asOf: new Date().toISOString().slice(0, 10), n: Object.keys(d).length, d }));
  console.log('drivers', Object.keys(d).length, 'need birth', Object.values(d).filter(x => x.startsWith('b:')).length, 'with accounts', Object.values(P).filter(x => x.acc.length).length, 'with phone', Object.values(P).filter(x => x.ph).length);
})();
