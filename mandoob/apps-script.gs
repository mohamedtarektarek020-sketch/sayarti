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
  'المبلغ', 'السبب / نوع الشكوى', 'التفاصيل', 'الحالة', 'رد الإدارة', 'تاريخ الرد', 'رمز التحقق', 'رد بواسطة'];
const STATUSES = ['جديد', 'تحت المراجعة', 'تمت الموافقة', 'مرفوض', 'تم الحل'];
const ADMIN_PASS = 'غيّر-الكلمة-دي';   // ⚠️ اكتب هنا كلمة سر صفحة الإدارة (8 حروف أو أكتر)
const VIEW_PASS = '';   // كلمة سر للإدارة: يشوفوا الطلبات بس من غير ما يغيروا حاجة (تقدر تغيرها، 8 حروف أو أكتر)
const LEGAL_PASS = '';   // كلمة سر الشؤون القانونية: بيشوفوا الشكاوى بس ويردّوا عليها (8 حروف أو أكتر)
const NOTIFY = true;          // يبعتلك إيميل مع كل طلب جديد
const MAX_PER_DAY = 3;
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
    const no = (type === 'سلفة' ? 'S' : type === 'آيبان' ? 'B' : 'C') + Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyMMdd') + '-' + String(rows.length + 1).padStart(4, '0');
    const row = [no, new Date(), type, "'" + iq, clean_(b.name, 120), clean_(b.acc, 200), clean_(b.sup, 80), clean_(b.city, 60), "'" + clean_(b.phone, 15),
      amount, clean_(b.reason, 80), details, 'جديد', '', '', tok];
    sh.appendRow(row);
    if (iban) saveIban_(iq, row[4], iban, clean_(type === 'سلفة' ? b.bank : b.reason, 60), clean_(b.holder, 80), row[8].slice(1), no);
    if (NOTIFY) {
      try {
        MailApp.sendEmail(Session.getEffectiveUser().getEmail(), `طلب ${type} جديد — ${row[4]} (${no})`,
          `النوع: ${type}\nالاسم: ${row[4]}\nالإقامة: ${iq}\nالحساب: ${row[5]}\nالمشرف: ${row[6]}\nالجوال: ${row[8].slice(1)}\n` +
          (type === 'سلفة' ? `المبلغ: ${amount} ريال\n` : '') + `السبب / النوع: ${row[10]}\nالتفاصيل: ${details}\n\nافتح الشيت: ${ss_().getUrl()}`);
      } catch (x) {}
    }
    return json_({ ok: true, no });
  } finally { lock.releaseLock(); }
}

function status_(iq, tok) {
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
  return { ok: true, list: rows.filter(r => r[0] && (role !== 'legal' || r[2] === 'شكوى')).map(r => ({ no: r[0], date: f(r[1]), type: r[2], iq: String(r[3]), name: r[4], acc: r[5], sup: r[6], city: r[7], phone: String(r[8]),
    amount: r[9], reason: r[10], details: r[11], status: r[12] || 'جديد', reply: r[13] || '', replied: f(r[14]), by: r[16] || '' })).reverse() };
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
