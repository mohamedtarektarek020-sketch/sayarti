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
  'المبلغ', 'السبب / نوع الشكوى', 'التفاصيل', 'الحالة', 'رد الإدارة', 'تاريخ الرد', 'رمز التحقق', 'رد بواسطة', 'الترجمة للعربي'];
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
const NOTIFY = true;          // يبعتلك إيميل مع كل طلب جديد
const MAX_PER_DAY = 3;
// المناديب اللي مش على كفالة الشركة: النظام مقفول عليهم (بصمة رقم الإقامة)
const BLOCKED_SP = '001844370631,00a8cc727bad,02e3fc914912,07c83fe877f7,095b1873dcb2,126f8113bb3e,138d147e715b,187ba2696961,1a963f0b5a48,1a9b2e107c97,1f67571a31b9,2106edae16e6,228fee9dab5c,29f710930ab5,2f3be5f51109,30c379c7156e,339666080f8f,3c5f6817e130,4074f0881ca4,42ef41b6913e,450eea46c193,45fd3b11b3eb,4a62a00b8e65,4b8f492b70f3,4efb1b1f158f,542d4ef2a6df,569565b8a8f0,584c7c3df38e,626913b73517,62d69030242d,65bcde19b8b2,668b3b30a3d1,67618fa78f32,67c9aaaef72a,682594225daa,685b780146d2,6907b364ec28,6f142287ecb2,73152fa182e3,7b864a82cddb,7b8fafac7ef2,7ca7bb6e7300,7fa6f882db9b,7fc9c1945bde,81bcf20f5395,852e583ddf28,8a09bc33c095,8af82a2f13e5,8e89e29e4508,8ed3a750fc84,939805f0fd11,96532726489e,988a36970a08,997e161f5792,9aa0be112459,9c78963efc1b,9c84a70b4555,9fe2d39aa793,a1f0cd458840,a3a324097a02,a4b464b24171,a8f9066bef57,aa2af60c751d,ab806a45beb0,ac6bc9848e57,aec2ca528613,b65fefb091ea,bbece8e596dc,c7258b851caa,cca368267764,ce7e67688cd9,ce8ddf8f73b9,dd7303442399,dd78deb83f0e,defb2f12973e,e3b91cf22b0d,e5dc36396cce,e70efdc93bbd,eb760a553a5f,f15d4989a6ae,f56ec76082ac,f5c225516da9,f6e2597cf096,fa0007113ce2'.split(',');
const notSp_ = iq => BLOCKED_SP.indexOf(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'sp:' + iq, Utilities.Charset.UTF_8).map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('').slice(0, 12)) >= 0;
const ADV_GAP_DAYS = 7;   // بعد الموافقة على سلفة، المندوب يقدر يطلب سلفة جديدة بعد 7 أيام
const ADV_REJ_DAYS = 3;   // بعد رفض سلفة، المندوب يقدر يطلب سلفة جديدة بعد 3 أيام
const ADV_FROM = 10, ADV_TO = 13;   // طلبات السلف متاحة يوميًا من 10 الصبح لـ 1 الضهر بتوقيت السعودية
const advOpen_ = () => { const h = Number(Utilities.formatDate(new Date(), 'Asia/Riyadh', 'H')); return h >= ADV_FROM && h < ADV_TO; };        // أقصى عدد طلبات للمندوب في اليوم

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
    if (b.action === 'admin_list') { const o = adminList_(role); o.role = role; return json_(o); }
    return json_(adminUpdate_(b, role));
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
    if (iban) saveIban_(iq, row[4], iban, clean_(type === 'سلفة' ? b.bank : b.reason, 60), clean_(b.holder, 80), row[8].slice(1), no);
    if (NOTIFY) {
      try {
        MailApp.sendEmail(Session.getEffectiveUser().getEmail(), `طلب ${type} جديد — ${row[4]} (${no})`,
          `النوع: ${type}\nالاسم: ${row[4]}\nالإقامة: ${iq}\nالحساب: ${row[5]}\nالمشرف: ${row[6]}\nالجوال: ${row[8].slice(1)}\n` +
          (type === 'سلفة' ? `المبلغ: ${amount} ريال\n` : '') + `السبب / النوع: ${row[10]}\nالتفاصيل: ${details}\n` + (row[17] ? `الترجمة: ${row[17]}\n` : '') + `\nافتح الشيت: ${ss_().getUrl()}`);
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
    no: r[0], date: Utilities.formatDate(new Date(r[1]), 'Asia/Riyadh', 'yyyy-MM-dd'), type: r[2], amount: r[9], reason: r[10], status: r[12] || 'جديد', reply: r[13] || '', by: r[16] || ''
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
  return { ok: true, list: rows.filter(r => r[0] && (role !== 'legal' || r[2] === 'شكوى')).map(r => ({ no: r[0], date: f(r[1]), type: r[2], iq: String(r[3]), name: r[4], acc: r[5], sup: r[6], city: r[7], phone: String(r[8]),
    amount: r[9], reason: r[10], details: r[11], status: r[12] || 'جديد', reply: r[13] || '', replied: f(r[14]), by: r[16] || '', tr: r[17] && r[17] !== '-' ? r[17] : '' })).reverse() };
}
function adminUpdate_(b, role) {
  if (STATUSES.indexOf(b.status) < 0) return { ok: false, err: 'status' };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = ss_().getSheetByName(SHEET);
    const nos = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 1).getValues().map(r => String(r[0]));
    const i = nos.indexOf(String(b.no)); if (i < 0) return { ok: false, err: 'no' };
    if (role === 'legal' && String(sh.getRange(i + 2, 3).getValue()) !== 'شكوى') return { ok: false, err: 'role' };
    sh.getRange(i + 2, 13, 1, 3).setValues([[b.status, clean_(b.reply, 800), new Date()]]);
    if (!sh.getRange(1, 17).getValue()) sh.getRange(1, 17).setValue('رد بواسطة');
    sh.getRange(i + 2, 17).setValue(role === 'legal' ? 'الشؤون القانونية' : 'الإدارة');
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
