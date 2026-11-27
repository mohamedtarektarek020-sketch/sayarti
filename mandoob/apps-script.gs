/**
 * طلبات المناديب — استقبال طلبات السلف والشكاوى
 * الكود ده بيتلصق في Google Sheet (Extensions ← Apps Script).
 * أول مرة: شغّل الدالة setup مرة واحدة، وبعدين Deploy ← New deployment ← Web app
 *   Execute as: Me   —   Who has access: Anyone
 */

const SS_ID = '';   // رقم الشيت (من رابطه بين /d/ و /edit) — لو الكود متربط بالشيت من Extensions سيبه فاضي
const SHEET = 'الطلبات';
const ss_ = () => SS_ID ? SpreadsheetApp.openById(SS_ID) : SpreadsheetApp.getActive();
const HEAD = ['رقم الطلب', 'التاريخ', 'النوع', 'رقم الإقامة', 'الاسم', 'المنصة / الحساب', 'المشرف', 'المدينة', 'الجوال',
  'المبلغ', 'السبب / نوع الشكوى', 'التفاصيل', 'الحالة', 'رد الإدارة', 'تاريخ الرد', 'رمز التحقق', 'رد بواسطة', 'الترجمة للعربي', 'سجل الردود', 'المرفقات'];
// ترجمة تلقائية للعربي لأي نص مكتوب بلغة تانية (إنجليزي / بنغالي / أوردو ...)
function tr_(s) {
  s = String(s || '').replace(/\n?الآيبان:[^\n]*/, '').trim(); if (!s) return '';
  const ar = (s.match(/[\u0621-\u064A]/g) || []).length, other = (s.match(/[A-Za-z\u0900-\u09FF]/g) || []).length;
  if (other <= ar || other < 3) return '';
  try { return LanguageApp.translate(s, '', 'ar'); } catch (x) { return ''; }
}
const STATUSES = ['جديد', 'تحت المراجعة', 'تمت الموافقة', 'مرفوض', 'تم الحل'];
const ADMIN_PASS = 'غيّر-الكلمة-دي';   // ⚠️ اكتب هنا كلمة سر صفحة الإدارة (8 حروف أو أكتر)
const VIEW_PASS = '';   // كلمة سر للإدارة: يشوفوا الطلبات بس من غير ما يغيروا حاجة (تقدر تغيرها، 8 حروف أو أكتر)
const LEGAL_PASS = '';   // كلمة سر الشؤون القانونية: بيشوفوا الشكاوى بس ويردّوا عليها (8 حروف أو أكتر)
const LEGAL_USERS = {};  // كلمة سر لكل موظف في الشؤون القانونية علشان يبان مين رد: { 'كلمة السر': 'الاسم' } (8 حروف أو أكتر) — المندوب بيشوف «الشؤون القانونية» بس
const SUP_PASS = '';     // كلمة سر المشرفين: بيشوفوا طلبات السلف وقرار الإدارة فيها بس (عرض فقط) — 8 حروف أو أكتر
// مرفقات الطلبات (صور / PDF): بتتحفظ في فولدر خاص على Google Drive، ومحدش بيفتحها غير اللي ليه صلاحية من صفحة الإدارة
const ATT_MAX = 3, ATT_BYTES = 2 * 1024 * 1024, ATT_DIR = 'مرفقات طلبات المناديب';
const ATT_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
function attDir_() { const pr = PropertiesService.getScriptProperties(); const id = pr.getProperty('ATT_DIR');
  if (id) { try { return DriveApp.getFolderById(id); } catch (x) {} }
  const f = DriveApp.createFolder(ATT_DIR); pr.setProperty('ATT_DIR', f.getId()); return f; }
// بيتأكد إن الملف فعلًا صورة أو PDF (من أول بايتات الملف مش من الاسم بس) وحجمه أقل من 2 ميجا
function attCheck_(files) {
  if (!files) return { ok: true, list: [] }; if (!Array.isArray(files) || files.length > ATT_MAX) return { ok: false, err: 'attn' };
  const list = [];
  for (const f of files) { const t = String(f && f.t || ''); if (!ATT_TYPES[t]) return { ok: false, err: 'atttype' };
    let bytes; try { bytes = Utilities.base64Decode(String(f.d || '')); } catch (x) { return { ok: false, err: 'atttype' }; }
    if (!bytes.length || bytes.length >= ATT_BYTES) return { ok: false, err: 'attsize' };
    const h = bytes.slice(0, 4).map(b => b & 255), magic = t === 'application/pdf' ? h[0] === 0x25 && h[1] === 0x50 && h[2] === 0x44 && h[3] === 0x46 : t === 'image/png' ? h[0] === 0x89 && h[1] === 0x50 : t === 'image/jpeg' ? h[0] === 0xFF && h[1] === 0xD8 : h[0] === 0x52 && h[1] === 0x49;
    if (!magic) return { ok: false, err: 'atttype' };
    list.push({ t, bytes, n: clean_(f.n, 80).replace(/[\\/:*?"|]/g, '_') || 'ملف' }); }
  return { ok: true, list };
}
const NOTIFY = true;          // يبعتلك إيميل مع كل طلب جديد
const MAX_PER_DAY = 3;
// المناديب اللي مش على كفالة الشركة: النظام مقفول عليهم (بصمة رقم الإقامة)
const BLOCKED_SP = '001844370631,00a8cc727bad,02e3fc914912,07c83fe877f7,095b1873dcb2,126f8113bb3e,138d147e715b,187ba2696961,1a963f0b5a48,1a9b2e107c97,1f67571a31b9,2106edae16e6,228fee9dab5c,29f710930ab5,2f3be5f51109,30c379c7156e,339666080f8f,3c5f6817e130,4074f0881ca4,42ef41b6913e,450eea46c193,45fd3b11b3eb,4a62a00b8e65,4b8f492b70f3,4efb1b1f158f,542d4ef2a6df,569565b8a8f0,584c7c3df38e,626913b73517,62d69030242d,65bcde19b8b2,668b3b30a3d1,67618fa78f32,67c9aaaef72a,682594225daa,685b780146d2,6907b364ec28,6f142287ecb2,73152fa182e3,7b864a82cddb,7b8fafac7ef2,7ca7bb6e7300,7fa6f882db9b,7fc9c1945bde,81bcf20f5395,852e583ddf28,8a09bc33c095,8af82a2f13e5,8e89e29e4508,8ed3a750fc84,939805f0fd11,96532726489e,988a36970a08,997e161f5792,9aa0be112459,9c78963efc1b,9c84a70b4555,9fe2d39aa793,a1f0cd458840,a3a324097a02,a4b464b24171,a8f9066bef57,aa2af60c751d,ab806a45beb0,ac6bc9848e57,aec2ca528613,b65fefb091ea,bbece8e596dc,c7258b851caa,cca368267764,ce7e67688cd9,ce8ddf8f73b9,dd7303442399,dd78deb83f0e,defb2f12973e,e3b91cf22b0d,e5dc36396cce,e70efdc93bbd,eb760a553a5f,f15d4989a6ae,f56ec76082ac,f5c225516da9,f6e2597cf096,fa0007113ce2'.split(',');
const notSp_ = iq => BLOCKED_SP.indexOf(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'sp:' + iq, Utilities.Charset.UTF_8).map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('').slice(0, 12)) >= 0;
const ADV_GAP_DAYS = 7;   // بعد الموافقة على سلفة، المندوب يقدر يطلب سلفة جديدة بعد 7 أيام
const ADV_REJ_DAYS = 3;   // بعد رفض سلفة، المندوب يقدر يطلب سلفة جديدة بعد 3 أيام
const ADV_WINS = [[10, 15]];   // طلبات السلف متاحة يوميًا من 10 الصبح لـ 3 العصر بتوقيت السعودية
const ADV_NIGHT = [20, 24], ADV_NIGHT_FROM = '2026-11-21';   // وكمان من 8 بالليل لـ 12 بالليل (للمناديب اللي بيشتغلوا بالليل)
const advOpen_ = () => { const now = new Date(), h = Number(Utilities.formatDate(now, 'Asia/Riyadh', 'H')), d = Utilities.formatDate(now, 'Asia/Riyadh', 'yyyy-MM-dd');
  const wins = d >= ADV_NIGHT_FROM ? ADV_WINS.concat([ADV_NIGHT]) : ADV_WINS; return wins.some(w => h >= w[0] && h < w[1]); };        // أقصى عدد طلبات للمندوب في اليوم

function setup() {
  const ss = ss_();
  let sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
  sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold').setBackground('#2b2470').setFontColor('#ffffff');
  sh.setFrozenRows(1); sh.setRightToLeft(true);
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build();
  sh.getRange(2, 13, 2000, 1).setDataValidation(rule);
  sh.setColumnWidths(1, HEAD.length, 130); sh.setColumnWidth(12, 320); sh.setColumnWidth(14, 260); sh.hideColumns(16);
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
const clean_ = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, n || 200);

function doGet(e) {
  const p = e.parameter || {};
  if (p.action === 'status') return json_(status_(clean_(p.iq, 10), clean_(p.tok, 40)));
  const admin = p.page === 'admin';
  const t = HtmlService.createTemplateFromFile(admin ? 'admin' : 'driver');   // ملفات driver.html و admin.html من فولدر gas
  t.url = ScriptApp.getService().getUrl();
  return t.evaluate().setTitle(admin ? 'إدارة طلبات المناديب' : 'طلبات المناديب')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  let b; try { b = JSON.parse(e.postData.contents); } catch (x) { return json_({ ok: false, err: 'bad' }); }
  if (b.action === 'status') return json_(status_(clean_(b.iq, 10), clean_(b.tok, 40)));
  if (b.action === 'admin_list' || b.action === 'admin_update') {
    const role = adminOk_(b.pass); if (!role) return json_({ ok: false, err: 'pass' });
    if (b.action === 'admin_update' && role !== 'admin' && role !== 'legal') return json_({ ok: false, err: 'role' });
    const who = role === 'legal' && Object.prototype.hasOwnProperty.call(LEGAL_USERS, String(b.pass)) ? String(LEGAL_USERS[String(b.pass)]) : '';
    if (b.action === 'admin_list') { const o = adminList_(role); o.role = role; o.who = who; return json_(o); }
    if (b.action === 'admin_file') return json_(adminFile_(String(b.id || ''), role));
    return json_(adminUpdate_(b, role, who));
  }
  if (b.action !== 'submit') return json_({ ok: false, err: 'bad' });
  const iq = clean_(b.iq, 10);
  if (!/^[12]\d{9}$/.test(iq)) return json_({ ok: false, err: 'iq' });
  if (notSp_(iq)) return json_({ ok: false, err: 'notsp' });
  const type = ['سلفة', 'شكوى', 'آيبان'].indexOf(b.type) >= 0 ? b.type : '';
  if (!type) return json_({ ok: false, err: 'type' });
  if (type === 'سلفة' && !advOpen_()) return json_({ ok: false, err: 'closed' });
  const amount = type === 'سلفة' ? Math.round(Number(b.amount) || 0) : '';
  if (type === 'سلفة' && !(amount > 0 && amount <= 20000)) return json_({ ok: false, err: 'amount' });
  const details = clean_(b.details, 1500);
  if (type === 'شكوى' && details.length < 5) return json_({ ok: false, err: 'details' });
  const iban = String(b.iban || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if ((type === 'آيبان' || type === 'سلفة') && !ibanOk_(iban)) return json_({ ok: false, err: 'iban' });
  const att = type === 'آيبان' ? { ok: true, list: [] } : attCheck_(b.files); if (!att.ok) return json_({ ok: false, err: att.err });

  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = ss_().getSheetByName(SHEET);
    const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, HEAD.length).getValues() : [];
    const today = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd');
    const mine = rows.filter(r => String(r[3]) === iq);
    const tok = clean_(b.tok, 40);
    if (!/^[0-9a-f]{32}$/.test(tok)) return json_({ ok: false, err: 'tok' });
    if (mine.some(r => r[15] && String(r[15]) !== tok)) return json_({ ok: false, err: 'tok' });
    if (mine.filter(r => Utilities.formatDate(new Date(r[1]), 'Asia/Riyadh', 'yyyy-MM-dd') === today).length >= MAX_PER_DAY) return json_({ ok: false, err: 'limit' });
    // طلب سلفة واحد بس في اليوم، وشكوتين بحد أقصى في اليوم
    const todayOf = t => mine.filter(r => r[2] === t && r[1] && Utilities.formatDate(new Date(r[1]), 'Asia/Riyadh', 'yyyy-MM-dd') === today).length;
    if (type === 'سلفة' && todayOf('سلفة') >= 1) return json_({ ok: false, err: 'advday' });
    if (type === 'شكوى' && todayOf('شكوى') >= 2) return json_({ ok: false, err: 'cmpday' });
    if (type === 'سلفة' && mine.some(r => r[2] === 'سلفة' && (r[12] === 'جديد' || r[12] === 'تحت المراجعة'))) return json_({ ok: false, err: 'open' });
    // بعد الموافقة على سلفة: مفيش سلفة جديدة غير بعد أسبوع — وبعد الرفض: بعد 3 أيام (من تاريخ الرد)
    if (type === 'سلفة') {
      let best = null;
      mine.forEach(r => { if (r[2] !== 'سلفة') return; const gap = r[12] === 'تمت الموافقة' ? ADV_GAP_DAYS : r[12] === 'مرفوض' ? ADV_REJ_DAYS : 0; if (!gap) return;
        const t = new Date(r[14] || r[1]).getTime(); if (!(t > 0)) return; const u = t + gap * 864e5;
        if (!best || u > best.u) best = { u, err: r[12] === 'مرفوض' ? 'advrej' : 'advweek' }; });
      if (best && best.u > Date.now()) return json_({ ok: false, err: best.err, until: Utilities.formatDate(new Date(best.u), 'Asia/Riyadh', 'yyyy-MM-dd') });
    }
    const no = (type === 'سلفة' ? 'S' : type === 'آيبان' ? 'B' : 'C') + Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyMMdd') + '-' + String(rows.length + 1).padStart(4, '0');
    const row = [no, new Date(), type, "'" + iq, clean_(b.name, 120), clean_(b.acc, 200), clean_(b.sup, 80), clean_(b.city, 60), "'" + clean_(b.phone, 15),
      amount, clean_(b.reason, 80), details, 'جديد', '', '', tok, '', tr_(details)];
    sh.appendRow(row);
    let attNote = '';
    if (att.list.length) {
      try { const dir = attDir_(), saved = att.list.map((f, i) => { const fl = dir.createFile(Utilities.newBlob(f.bytes, f.t, no + '-' + (i + 1) + '-' + f.n.replace(/\.[^.]*$/, '') + '.' + ATT_TYPES[f.t])); return f.n + ' | ' + fl.getId(); });
        if (!sh.getRange(1, 20).getValue()) sh.getRange(1, 20).setValue('المرفقات');
        sh.getRange(sh.getLastRow(), 20).setValue(saved.join('\n')); attNote = `\nالمرفقات: ${saved.length} ملف`; }
      catch (x) { attNote = '\nالمرفقات: تعذّر الحفظ'; }
    }
    if (iban) saveIban_(iq, row[4], iban, clean_(type === 'سلفة' ? b.bank : b.reason, 60), clean_(b.holder, 80), row[8].slice(1), no);
    if (NOTIFY) {
      try {
        MailApp.sendEmail(Session.getEffectiveUser().getEmail(), `طلب ${type} جديد — ${row[4]} (${no})`,
          `النوع: ${type}\nالاسم: ${row[4]}\nالإقامة: ${iq}\nالحساب: ${row[5]}\nالمشرف: ${row[6]}\nالجوال: ${row[8].slice(1)}\n` +
          (type === 'سلفة' ? `المبلغ: ${amount} ريال\n` : '') + `السبب / النوع: ${row[10]}\nالتفاصيل: ${details}\n` + (row[17] ? `الترجمة: ${row[17]}\n` : '') + attNote + `\nافتح الشيت: ${ss_().getUrl()}`);
      } catch (x) {}
    }
    return json_({ ok: true, no });
  } finally { lock.releaseLock(); }
}

function status_(iq, tok) {
  if (notSp_(iq)) return { ok: false, err: 'notsp' };
  if (!/^[12]\d{9}$/.test(iq) || !/^[0-9a-f]{32}$/.test(tok || '')) return { ok: false, err: 'iq' };
  const sh = ss_().getSheetByName(SHEET);
  if (sh.getLastRow() < 2) return { ok: true, list: [] };
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, HEAD.length).getValues();
  const list = rows.filter(r => String(r[3]) === iq && String(r[15]) === tok).map(r => ({
    no: r[0], date: Utilities.formatDate(new Date(r[1]), 'Asia/Riyadh', 'yyyy-MM-dd'), type: r[2], amount: r[9], reason: r[10], status: r[12] || 'جديد', reply: r[13] || '', by: /^الشؤون القانونية/.test(String(r[16] || '')) ? 'الشؤون القانونية' : (r[16] || ''), att: attOf_(r[19]).length
  })).reverse().slice(0, 20);
  return { ok: true, list };
}

/* ===== صفحة الإدارة ===== */
function adminOk_(pass) {
  const c = CacheService.getScriptCache(), k = 'fails';
  const fails = Number(c.get(k) || 0);
  if (fails >= 10) return false;                       // بعد 10 محاولات غلط يقفل 10 دقايق
  if (ADMIN_PASS.length >= 8 && ADMIN_PASS !== 'غيّر-الكلمة-دي' && String(pass) === ADMIN_PASS) return 'admin';
  if (VIEW_PASS.length >= 8 && String(pass) === VIEW_PASS) return 'view';
  if (LEGAL_PASS.length >= 8 && String(pass) === LEGAL_PASS) return 'legal';
  if (String(pass).length >= 8 && Object.prototype.hasOwnProperty.call(LEGAL_USERS, String(pass))) return 'legal';
  if (SUP_PASS.length >= 8 && String(pass) === SUP_PASS) return 'sup';
  c.put(k, String(fails + 1), 600); return false;
}
function adminList_(role) {
  const sh = ss_().getSheetByName(SHEET);
  if (sh.getLastRow() < 2) return { ok: true, list: [] };
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, HEAD.length).getValues();
  const f = d => d ? Utilities.formatDate(new Date(d), 'Asia/Riyadh', 'yyyy-MM-dd HH:mm') : '';
  if (!sh.getRange(1, 18).getValue()) sh.getRange(1, 18).setValue('الترجمة للعربي');
  let n = 0;   // ترجمة الطلبات القديمة اللي لسه ماتترجمتش (20 في كل مرة)
  rows.forEach((r, i) => { if (n < 20 && r[0] && r[11] && r[17] === '') { const t = tr_(r[11]); r[17] = t || '-'; sh.getRange(i + 2, 18).setValue(r[17]); n++; } });
  return { ok: true, list: rows.filter(r => r[0] && (role !== 'legal' || r[2] === 'شكوى') && (role !== 'sup' || r[2] === 'سلفة')).map(r => ({ no: r[0], date: f(r[1]), type: r[2], iq: String(r[3]), name: r[4], acc: r[5], sup: r[6], city: r[7], phone: String(r[8]),
    amount: r[9], reason: r[10], details: r[11], status: r[12] || 'جديد', reply: r[13] || '', replied: f(r[14]), by: r[16] || '', tr: r[17] && r[17] !== '-' ? r[17] : '', log: r[18] || '', att: attOf_(r[19]) })).reverse() };
}
const attOf_ = v => String(v || '').split('\n').map(l => { const i = l.lastIndexOf(' | '); return i < 0 ? null : { n: l.slice(0, i), id: l.slice(i + 3).trim() }; }).filter(Boolean);
// فتح مرفق: بيتأكد إن الملف تبع طلب اللي فاتح ليه صلاحية يشوفه (الشؤون القانونية = الشكاوى، المشرفين = السلف)
function adminFile_(id, role) {
  if (!/^[\w-]{10,}$/.test(id)) return { ok: false, err: 'no' };
  const sh = ss_().getSheetByName(SHEET); if (sh.getLastRow() < 2) return { ok: false, err: 'no' };
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 20).getValues();
  const r = rows.find(x => attOf_(x[19]).some(a => a.id === id)); if (!r) return { ok: false, err: 'no' };
  if ((role === 'legal' && r[2] !== 'شكوى') || (role === 'sup' && r[2] !== 'سلفة')) return { ok: false, err: 'role' };
  const bl = DriveApp.getFileById(id).getBlob();
  return { ok: true, t: bl.getContentType(), n: attOf_(r[19]).find(a => a.id === id).n, d: Utilities.base64Encode(bl.getBytes()) };
}
function adminUpdate_(b, role, who) {
  if (STATUSES.indexOf(b.status) < 0) return { ok: false, err: 'status' };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = ss_().getSheetByName(SHEET);
    const nos = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 1).getValues().map(r => String(r[0]));
    const i = nos.indexOf(String(b.no)); if (i < 0) return { ok: false, err: 'no' };
    if (role === 'legal' && String(sh.getRange(i + 2, 3).getValue()) !== 'شكوى') return { ok: false, err: 'role' };
    sh.getRange(i + 2, 13, 1, 3).setValues([[b.status, clean_(b.reply, 800), new Date()]]);
    if (!sh.getRange(1, 17).getValue()) sh.getRange(1, 17).setValue('رد بواسطة');
    const by = role === 'legal' ? 'الشؤون القانونية' + (who ? ' — ' + who : '') : 'الإدارة';
    sh.getRange(i + 2, 17).setValue(by);
    // سجل كل الردود (مين رد وقال إيه وإمتى) — للإدارة بس، والمندوب مش بيشوفه
    if (!sh.getRange(1, 19).getValue()) sh.getRange(1, 19).setValue('سجل الردود');
    const old = String(sh.getRange(i + 2, 19).getValue() || ''), line = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH:mm') + ' — ' + by + ' — ' + b.status + (b.reply ? ': ' + clean_(b.reply, 800) : '');
    sh.getRange(i + 2, 19).setValue((old ? old + '\n' : '') + line);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

/* ===== الآيبانات ===== */
function ibanOk_(x) {
  if (!/^SA\d{22}$/.test(x)) return false;
  const r = x.slice(4) + x.slice(0, 4); let m = 0;
  for (const ch of r) { const n = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch; for (const d of n) m = (m * 10 + Number(d)) % 97; }
  return m === 1;
}
function saveIban_(iq, name, iban, bank, holder, phone, no) {
  const ss = ss_(); let sh = ss.getSheetByName('الآيبانات');
  if (!sh) { sh = ss.insertSheet('الآيبانات'); sh.getRange(1, 1, 1, 8).setValues([['رقم الإقامة', 'الاسم', 'الآيبان', 'البنك', 'صاحب الحساب', 'الجوال', 'آخر تحديث', 'رقم الطلب']]).setFontWeight('bold').setBackground('#15803d').setFontColor('#ffffff'); sh.setFrozenRows(1); sh.setRightToLeft(true); sh.setColumnWidth(3, 230); }
  const row = ["'" + iq, name, "'" + iban, bank, holder, "'" + phone, new Date(), no];
  const n = sh.getLastRow(); const iqs = n > 1 ? sh.getRange(2, 1, n - 1, 1).getValues().map(r => String(r[0])) : [];
  const i = iqs.indexOf(iq);
  if (i >= 0) sh.getRange(i + 2, 1, 1, 8).setValues([row]); else sh.appendRow(row);
}
