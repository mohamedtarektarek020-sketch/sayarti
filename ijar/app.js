/* منصة إيجار — تطبيق المناديب */
(function () {
  // رابط السيرفر (Google Apps Script) — بيتحط هنا بعد الـ Deploy
  var API = 'https://script.google.com/macros/s/AKfycbxmEUUhbRT2DBVuKHAKGl1L_4yszBdIMxk3Yu_7RiZbbUR_yheOpFPPYCekM_vfdmmlsw/exec';
  var API_READY = /^https:\/\/script\.google\.com\//.test(API);

  var COLORS = { 'أبيض': '#F7F8FA', 'فضي': '#C3C8CE', 'رمادي': '#8C9299', 'رصاصي': '#5F656C', 'أسود': '#1F2328' };
  var CARS = [
    { plate: 'أ ص ع 2044', serial: '62395910', name: 'شيري اريزو 5', en: 'Chery Arrizo 5', brand: 'شيري', year: '2023', color: 'رمادي', img: 'img/chery_grey.jpg?v=2', daily: true },
    { plate: 'ا ع ح 2628', serial: '618345020', name: 'هيونداي أي تن', en: 'Hyundai i10', brand: 'هيونداي', year: '2024', color: 'فضي', img: 'img/i10_silver.jpg' },
    { plate: 'ا ع ح 8864', serial: '552821710', name: 'ميتسوبيشي اتراج', en: 'Mitsubishi Attrage', brand: 'ميتسوبيشي', year: '2019', color: 'رصاصي', img: 'img/attrage_gunmetal.jpg' },
    { plate: 'أ ط ل 3761', serial: '334939810', name: 'هيونداي اكسنت', en: 'Hyundai Accent', brand: 'هيونداي', year: '2022', color: 'أبيض', img: 'img/accent_white.jpg' },
    { plate: 'أ ط س 8002', serial: '188836910', name: 'كيا بيجاس', en: 'Kia Pegas', brand: 'كيا', year: '2023', color: 'أبيض', img: 'img/pegas_white.jpg' },
    { plate: 'أ ص ل 8624', serial: '753605120', name: 'سوزوكي ديزاير', en: 'Suzuki Dzire', brand: 'سوزوكي', year: '2025', color: 'فضي', img: 'img/dzold_silver.jpg' },
    { plate: 'أ ص ل 9496', serial: '600185120', name: 'سوزوكي ديزاير', en: 'Suzuki Dzire', brand: 'سوزوكي', year: '2025', color: 'فضي', img: 'img/dzold_silver.jpg' },
    { plate: 'أ ص ل 8629', serial: '154605120', name: 'سوزوكي ديزاير', en: 'Suzuki Dzire', brand: 'سوزوكي', year: '2025', color: 'أبيض', img: 'img/dzold_white.jpg' },
    { plate: 'أ ص ل 8635', serial: '95605120', name: 'سوزوكي ديزاير', en: 'Suzuki Dzire', brand: 'سوزوكي', year: '2025', color: 'أبيض', img: 'img/dzold_white.jpg' },
    { plate: 'أ ط ح 7773', serial: '794995910', name: 'نيسان صني', en: 'Nissan Sunny', brand: 'نيسان', year: '2023', color: 'رصاصي', img: 'img/sunny_gunmetal.jpg' },
    { plate: 'أ ط ن 9891', serial: '91984910', name: 'تويوتا يارس', en: 'Toyota Yaris', brand: 'تويوتا', year: '2023', color: 'فضي', img: 'img/yaris_silver.jpg' }
  ];

  /* قائمة العربيات المتاحة بتتحدّث من الداش بورد (كل ساعة) — القائمة اللي فوق احتياطي لو السيرفر مردّش */
  var MODELS = [
    { re: /اريزو|أريزو|شيري/, key: 'chery', name: 'شيري اريزو 5', en: 'Chery Arrizo 5', brand: 'شيري', daily: true },
    { re: /أي ?تن|اي ?تن|[أا]ي ?10|i10/i, key: 'i10', name: 'هيونداي أي تن', en: 'Hyundai i10', brand: 'هيونداي' },
    { re: /اتراج|أتراج/, key: 'attrage', name: 'ميتسوبيشي اتراج', en: 'Mitsubishi Attrage', brand: 'ميتسوبيشي' },
    { re: /اكسنت|أكسنت/, key: 'accent', name: 'هيونداي اكسنت', en: 'Hyundai Accent', brand: 'هيونداي' },
    { re: /بيجاس/, key: 'pegas', name: 'كيا بيجاس', en: 'Kia Pegas', brand: 'كيا' },
    { re: /سوز|سوذ|دي[زذ] ?ا?ير|ديزير/, key: 'dzold', name: 'سوزوكي ديزاير', en: 'Suzuki Dzire', brand: 'سوزوكي' },
    { re: /صني/, key: 'sunny', name: 'نيسان صني', en: 'Nissan Sunny', brand: 'نيسان' },
    { re: /يارس/, key: 'yaris', name: 'تويوتا يارس', en: 'Toyota Yaris', brand: 'تويوتا' }
  ];
  var COLOR_FILE = { 'أبيض': 'white', 'فضي': 'silver', 'رمادي': 'grey', 'رصاصي': 'gunmetal', 'أسود': 'black' };
  function carFromDash(c) {
    var model = String(c.model || '').trim(), color = String(c.color || '').trim();
    var m = null; for (var i = 0; i < MODELS.length; i++) if (MODELS[i].re.test(model)) { m = MODELS[i]; break; }
    var file = COLOR_FILE[color] || 'white';
    return {
      plate: c.plate, serial: String(c.serial || ''), year: String(c.year || ''), color: color || 'غير محدد',
      name: m ? m.name : (model || 'سيارة'), en: m ? m.en : model, brand: m ? m.brand : (model || 'أخرى'),
      img: m ? ('img/' + m.key + '_' + file + '.jpg?v=3') : 'img/generic.svg', daily: !!(m && m.daily)
    };
  }
  function loadCars() {
    if (!API_READY) return;
    fetch(API + '?a=cars').then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok || !j.cars || !j.cars.length) return;
      CARS = j.cars.filter(function (c) { return c && c.plate; }).map(carFromDash);
      if (S.screen === 'cars') renderCars();
    }).catch(function () {});
  }
  loadCars();

  var S = { screen: 'home', name: '', company: '', iqama: '', phone: '', plan: 'day', cat: 'all' };

  /* ---------- اللغة / Language ---------- */
  var DICT = {
    'إيجار': 'Ijar', 'تأجير سيارات يومي وشهري': 'Daily & monthly car rental', 'تسجيل الدخول': 'Sign in', 'الاسم': 'Name',
    'الاسم كما في الإقامة': 'Name as on your Iqama', 'رقم الإقامة': 'Iqama number', 'رقم الجوال': 'Mobile number', 'الشركة': 'Company',
    'مسار': 'Masar', 'عسيري': 'Asiri', 'الدخول': 'Sign in', 'متابعة طلبي الحالي': 'Track my current request', 'رجوع': 'Back',
    'الخطوة 2 من 3': 'Step 2 of 3', 'أدخل رمز التحقق': 'Enter the verification code',
    'أرسلنا رسالة نصية فيها رمز من 4 أرقام إلى الجوال': 'We sent a 4-digit code by text message to',
    'رمز التحقق': 'Verification code', 'الرمز غير صحيح، حاول مرة ثانية': 'Wrong code, please try again', 'تأكيد': 'Confirm',
    'إعادة إرسال الرمز': 'Resend code', 'تغيير رقم الجوال': 'Change mobile number', 'تم إرسال رمز جديد': 'A new code was sent',
    'نسخة تجريبية: الرسالة لا تُرسل فعليًا، استخدم الرمز 1234': 'Test version: no message is actually sent, use code 1234',
    'الخطوة 3 من 3': 'Step 3 of 3', 'اختر نوع الإيجار': 'Choose the rental type', 'إيجار يومي': 'Daily rental', 'إيجار شهري': 'Monthly rental',
    '100 ريال في اليوم': 'SAR 100 per day', '60 ريال في اليوم': 'SAR 60 per day', 'السيارات المتاحة': 'Available cars',
    'نوع الإيجار': 'Rental type', 'يومي': 'Daily', 'شهري': 'Monthly',
    'صور السيارات توضيحية للموديل — المصدر: Wikimedia Commons (تراخيص حرة CC)': 'Car photos show the model for illustration — source: Wikimedia Commons (CC licenses)',
    'ملخص طلب الحجز': 'Booking request summary', 'إرسال الطلب للاعتماد': 'Send for approval', 'إلغاء': 'Cancel',
    'شعار العسيري اللوجستية ومسار الصفوة اللوجستية': 'Asiri Logistics and Masar Alsafwa Logistics logo', 'التنبيهات': 'Notifications',
    'اكتب الاسم': 'Enter your name', 'رقم الإقامة لازم يكون 10 أرقام ويبدأ بـ 1 أو 2': 'Iqama number must be 10 digits starting with 1 or 2',
    'رقم الجوال لازم يكون 10 أرقام ويبدأ بـ 05': 'Mobile number must be 10 digits starting with 05',
    'اختار الشركة: مسار أو عسيري': 'Choose the company: Masar or Asiri', 'سيارة': 'cars', 'إيجار ': 'Rental: ', 'الكل': 'All',
    'لا توجد سيارات متاحة في هذا النوع حاليًا': 'No cars available for this type right now', 'متاحة': 'Available', 'ريال': 'SAR',
    'في الشهر (60 ريال في اليوم)': 'per month (SAR 60/day)', 'في اليوم': 'per day', 'في الشهر': 'per month', 'احجز الآن': 'Book now',
    'اللون': 'Color', 'اللوحة': 'Plate', 'التسلسلي': 'Serial', 'الرقم التسلسلي': 'Serial number', 'السيارة': 'Car', 'الموديل': 'Model',
    'السعر': 'Price', 'الجوال': 'Mobile', 'التطبيق لسه ما اتربطش بالسيرفر. كلّم قسم الحركة.': 'The app is not connected yet. Contact the fleet department.',
    'جاري الإرسال...': 'Sending...', 'العربية دي اتحجزت خلاص، اختار عربية تانية.': 'This car was just booked, please choose another one.',
    'الطلب ما اتبعتش، راجع البيانات وحاول تاني.': 'The request was not sent. Check your details and try again.',
    'مفيش اتصال بالإنترنت، حاول تاني.': 'No internet connection, please try again.', 'تم قبول طلبك': 'Your request was approved',
    'تم رفض طلبك': 'Your request was rejected', 'لا يوجد طلب حالي': 'No current request', 'بانتظار الاعتماد': 'Pending approval',
    'رقم الطلب': 'Request number', 'السبب': 'Reason', 'طلب سيارة جديدة': 'Request another car',
    'طلبك وصل لقسم الاعتمادات. الصفحة دي بتتحدّث لوحدها، وهيرن الجرس لما يوصل الرد.': 'Your request reached the approvals team. This page updates by itself, and a bell will ring when the reply arrives.',
    'تواصل مع قسم الحركة لاستلام السيارة.': 'Contact the fleet department to pick up the car.',
    'مسار الصفوة': 'Masar Alsafwa', 'العسيري': 'Asiri',
    'أبيض': 'White', 'فضي': 'Silver', 'رمادي': 'Grey', 'رصاصي': 'Dark grey', 'أسود': 'Black', 'غير محدد': 'Not specified',
    'بني': 'Brown', 'بيج': 'Beige', 'أحمر': 'Red', 'أزرق': 'Blue', 'برتقالي': 'Orange',
    'شيري': 'Chery', 'هيونداي': 'Hyundai', 'ميتسوبيشي': 'Mitsubishi', 'كيا': 'Kia', 'سوزوكي': 'Suzuki', 'نيسان': 'Nissan', 'تويوتا': 'Toyota', 'أخرى': 'Other'
  };
  var LANG = 'ar';
  try { LANG = localStorage.getItem('ijar-lang') === 'en' ? 'en' : 'ar'; } catch (e) {}
  function T(s) { return (LANG === 'en' && DICT[s]) ? DICT[s] : s; }
  var AR_RE = /[؀-ۿ]/;
  function translateTree(root) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) {
      if (n.__ar === undefined) { if (!AR_RE.test(n.nodeValue)) continue; n.__ar = n.nodeValue; }
      var src = n.__ar, key = src.trim();
      n.nodeValue = (LANG === 'en' && DICT[key]) ? src.replace(key, DICT[key]) : src;
    }
    ['placeholder', 'aria-label', 'alt'].forEach(function (a) {
      Array.prototype.forEach.call(root.querySelectorAll('[' + a + ']'), function (el) {
        var k = 'ar_' + a.replace('-', '_');
        if (el.dataset[k] === undefined) { var v = el.getAttribute(a); if (!AR_RE.test(v)) return; el.dataset[k] = v; }
        var o = el.dataset[k]; el.setAttribute(a, LANG === 'en' && DICT[o] ? DICT[o] : o);
      });
    });
  }
  function applyLang() {
    var dir = LANG === 'en' ? 'ltr' : 'rtl';
    document.documentElement.lang = LANG; document.documentElement.dir = dir;
    var app = document.getElementById('app'); app.dir = dir; app.lang = LANG;
    document.title = LANG === 'en' ? 'Ijar' : 'إيجار';
    var b1 = document.getElementById('langBtn'), b2 = document.getElementById('langBtn2');
    b1.textContent = LANG === 'en' ? 'العربية' : 'English'; b1.lang = LANG === 'en' ? 'ar' : 'en';
    b2.textContent = LANG === 'en' ? 'ع' : 'EN'; b2.setAttribute('aria-label', LANG === 'en' ? 'العربية' : 'English');
    translateTree(app);
  }
  function toggleLang() {
    LANG = LANG === 'en' ? 'ar' : 'en';
    try { localStorage.setItem('ijar-lang', LANG); } catch (e) {}
    applyLang();
    if (S.screen === 'cars') renderCars();
    if (S.screen === 'status') renderStatus();
    if (!$('sheet').hidden && PENDING) fillSum();
    if (!$('idErr').hidden && $('idErr').__msg) $('idErr').textContent = T($('idErr').__msg);
  }

  var TAKEN = {}, MYREQ = null, PENDING = null, pollT = null;
  var $ = function (id) { return document.getElementById(id); };
  var screens = { home: 'home', otp: 's-otp', plan: 's-plan', cars: 's-cars', status: 's-status' };
  var BACK = { otp: 'home', plan: 'home', cars: 'plan', status: 'home' };

  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }

  function show(name) {
    S.screen = name;
    Object.keys(screens).forEach(function (k) { $(screens[k]).hidden = (k !== name); });
    $('s-id').hidden = true;
    $('bar').hidden = (name === 'home');
    window.scrollTo(0, 0);
    if (name === 'cars') { renderCars(); loadTaken(); loadCars(); }
    if (name === 'status') { renderStatus(); refreshStatus(); }
    if (name === 'otp') setTimeout(function () { $('otp').focus(); }, 50);
    clearInterval(pollT);
    if (name === 'status') pollT = setInterval(refreshStatus, 30000);
  }
  function digits(el, n) { el.value = el.value.replace(/[^0-9]/g, '').slice(0, n); return el.value; }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 4000); }

  /* ---------- Bell ---------- */
  var AC = null;
  function ring() {
    try {
      if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
      var t0 = AC.currentTime;
      [0, 0.28].forEach(function (d) {
        var o = AC.createOscillator(), g = AC.createGain();
        o.frequency.value = 1046; g.gain.setValueAtTime(0.0001, t0 + d);
        g.gain.exponentialRampToValueAtTime(0.18, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.6);
        o.connect(g); g.connect(AC.destination); o.start(t0 + d); o.stop(t0 + d + 0.65);
      });
    } catch (e) {}
    if (navigator.vibrate) try { navigator.vibrate([200, 100, 200]); } catch (e) {}
  }

  /* ---------- Login ---------- */
  var saved = load('ijar-user');
  if (saved) {
    $('fullName').value = saved.name || ''; $('iqama').value = saved.iqama || ''; $('phone').value = saved.phone || '';
    Array.prototype.forEach.call(document.querySelectorAll('input[name="company"]'), function (r) { r.checked = (r.value === saved.company); });
  }
  MYREQ = load('ijar-req');
  $('myReqBtn').hidden = !MYREQ;
  $('myReqBtn').addEventListener('click', function () { show('status'); });
  $('backBtn').addEventListener('click', function () { show(BACK[S.screen] || 'home'); });

  $('iqama').addEventListener('input', function (e) { digits(e.target, 10); $('idErr').hidden = true; });
  $('phone').addEventListener('input', function (e) { digits(e.target, 10); $('idErr').hidden = true; });
  $('fullName').addEventListener('input', function () { $('idErr').hidden = true; });
  Array.prototype.forEach.call(document.querySelectorAll('input[name="company"]'), function (r) { r.addEventListener('change', function () { $('idErr').hidden = true; }); });

  $('idForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var nm = $('fullName').value.trim().replace(/\s+/g, ' '), iq = $('iqama').value, ph = $('phone').value, msg = '';
    var coEl = document.querySelector('input[name="company"]:checked'), co = coEl ? coEl.value : '';
    if (nm.length < 3) msg = 'اكتب الاسم';
    else if (!/^[12][0-9]{9}$/.test(iq)) msg = 'رقم الإقامة لازم يكون 10 أرقام ويبدأ بـ 1 أو 2';
    else if (!/^05[0-9]{8}$/.test(ph)) msg = 'رقم الجوال لازم يكون 10 أرقام ويبدأ بـ 05';
    else if (!co) msg = 'اختار الشركة: مسار أو عسيري';
    if (msg) { $('idErr').__msg = msg; $('idErr').textContent = T(msg); $('idErr').hidden = false; return; }
    S.name = nm; S.company = co; S.iqama = iq; S.phone = ph;
    store('ijar-user', { name: nm, company: co, iqama: iq, phone: ph });
    $('maskedPhone').textContent = ph.slice(0, 3) + '•••••' + ph.slice(-2);
    $('otp').value = ''; $('otpErr').hidden = true; $('resent').hidden = true;
    show('otp');
  });
  $('otp').addEventListener('input', function (e) { digits(e.target, 4); $('otpErr').hidden = true; });
  $('otpForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if ($('otp').value === '1234') { $('planStep').textContent = S.name + ' · ' + T(S.company); show('plan'); }
    else $('otpErr').hidden = false;
  });
  $('resendBtn').addEventListener('click', function () { $('resent').hidden = false; $('otp').value = ''; $('otpErr').hidden = true; });
  $('changePhoneBtn').addEventListener('click', function () { show('home'); $('phone').focus(); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-plan]'), function (b) {
    b.addEventListener('click', function () { S.plan = b.getAttribute('data-plan'); S.cat = 'all'; show('cars'); });
  });

  /* ---------- Cars ---------- */
  function loadTaken() {
    if (!API_READY) return;
    fetch(API + '?a=taken').then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) return; TAKEN = {}; (j.plates || []).forEach(function (p) { TAKEN[p] = true; });
      if (S.screen === 'cars') renderCars();
    }).catch(function () {});
  }
  function renderCars() {
    var month = S.plan === 'month';
    var planCars = CARS.filter(function (c) { return (month ? !c.daily : !!c.daily) && !TAKEN[c.plate]; });
    var brands = []; planCars.forEach(function (c) { if (brands.indexOf(c.brand) < 0) brands.push(c.brand); });
    if (S.cat !== 'all' && brands.indexOf(S.cat) < 0) S.cat = 'all';
    var list = S.cat === 'all' ? planCars : planCars.filter(function (c) { return c.brand === S.cat; });
    Array.prototype.forEach.call(document.querySelectorAll('.seg [data-plan]'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-plan') === S.plan ? 'true' : 'false');
    });
    $('carsSub').textContent = list.length + ' ' + T('سيارة') + ' · ' + T(month ? 'شهري' : 'يومي');
    var chips = $('chips'); chips.innerHTML = '';
    if (brands.length > 1) {
      ['all'].concat(brands).forEach(function (b) {
        var el = document.createElement('button'); el.type = 'button';
        el.textContent = b === 'all' ? T('الكل') : T(b);
        el.setAttribute('aria-pressed', S.cat === b ? 'true' : 'false');
        el.addEventListener('click', function () { S.cat = b; renderCars(); });
        chips.appendChild(el);
      });
    }
    var grid = $('grid'); grid.innerHTML = '';
    if (!list.length) { var em = document.createElement('div'); em.className = 'empty'; em.textContent = T('لا توجد سيارات متاحة في هذا النوع حاليًا'); grid.appendChild(em); }
    list.forEach(function (c) {
      var price = month ? 1800 : 100;
      var art = document.createElement('article'); art.className = 'car';
      art.innerHTML =
        '<span class="badge">' + T('متاحة') + '</span>' +
        '<div class="ph"><img loading="lazy" alt=""></div>' +
        '<h3></h3><p class="en"></p>' +
        '<div class="color"><span class="dot"></span><span class="cn"></span></div>' +
        '<div class="tags"><span class="pl"></span><span class="sr"></span></div>' +
        '<div class="foot"><div><div class="price">' + price + ' <small>' + T('ريال') + '</small></div><div class="per">' +
        T(month ? 'في الشهر (60 ريال في اليوم)' : 'في اليوم') + '</div></div>' +
        '<button class="book" type="button">' + T('احجز الآن') + '</button></div>';
      var img = art.querySelector('img'); img.src = c.img; img.alt = (LANG === 'en' ? c.en + ' — ' : c.name + ' باللون ') + T(c.color);
      art.querySelector('h3').textContent = LANG === 'en' ? (c.en || c.name) : c.name;
      art.querySelector('.en').textContent = c.en + ' · ' + c.year;
      art.querySelector('.dot').style.background = COLORS[c.color] || '#F7F8FA';
      art.querySelector('.cn').textContent = T('اللون') + ': ' + T(c.color);
      var pl = art.querySelector('.pl'); pl.textContent = T('اللوحة') + ': '; pl.appendChild(bdi(c.plate));
      art.querySelector('.sr').textContent = T('التسلسلي') + ': ' + c.serial;
      art.querySelector('.book').addEventListener('click', function () { openSheet(c, price, month); });
      grid.appendChild(art);
    });
  }

  /* ---------- Booking ---------- */
  function rowsFor(r) {
    var rows = [['السيارة', LANG === 'en' ? r.model : r.carName], ['اللوحة', r.plate], ['الرقم التسلسلي', r.serial], ['اللون', T(r.color)], ['الموديل', r.model],
      ['نوع الإيجار', T(r.plan === 'month' ? 'شهري' : 'يومي')], ['السعر', r.price + ' ' + T('ريال') + ' ' + T(r.plan === 'month' ? 'في الشهر' : 'في اليوم')],
      ['الاسم', r.name], ['الشركة', T(r.company)], ['رقم الإقامة', r.iqama], ['الجوال', r.phone]];
    return rows.map(function (x) { return [T(x[0]), x[1]]; });
  }
  function openSheet(c, price, month) {
    PENDING = { plate: c.plate, serial: c.serial, carName: c.name, model: c.en + ' ' + c.year, color: c.color,
      plan: month ? 'month' : 'day', price: price, name: S.name, company: S.company, iqama: S.iqama, phone: S.phone };
    fillSum();
    $('sendErr').hidden = true; $('sendReq').disabled = false; $('sendReq').textContent = T('إرسال الطلب للاعتماد');
    $('sheet').hidden = false; $('sendReq').focus();
  }
  function bdi(txt) { var b = document.createElement('bdi'); b.textContent = txt; return b; }
  function fillSum() {
    var dl = $('sum'); dl.innerHTML = '';
    rowsFor(PENDING).forEach(function (r) {
      var dt = document.createElement('dt'); dt.textContent = r[0];
      var dd = document.createElement('dd'); dd.appendChild(bdi(r[1]));
      dl.appendChild(dt); dl.appendChild(dd);
    });
  }
  $('closeSheet').addEventListener('click', function () { $('sheet').hidden = true; });
  $('sheet').addEventListener('click', function (e) { if (e.target.id === 'sheet') $('sheet').hidden = true; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('sheet').hidden = true; });

  $('sendReq').addEventListener('click', function () {
    var err = $('sendErr'), btn = $('sendReq');
    if (!API_READY) { err.textContent = T('التطبيق لسه ما اتربطش بالسيرفر. كلّم قسم الحركة.'); err.hidden = false; return; }
    btn.disabled = true; btn.textContent = T('جاري الإرسال...');
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action: 'create' }, PENDING)) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok) {
          MYREQ = Object.assign({}, PENDING, { id: j.id, status: 'بانتظار الاعتماد', reason: '', createdAt: new Date().toISOString() });
          store('ijar-req', MYREQ); $('myReqBtn').hidden = false;
          $('sheet').hidden = true; show('status'); return;
        }
        btn.disabled = false; btn.textContent = T('إرسال الطلب للاعتماد');
        err.textContent = T((j && j.error === 'taken') ? 'العربية دي اتحجزت خلاص، اختار عربية تانية.' : 'الطلب ما اتبعتش، راجع البيانات وحاول تاني.');
        err.hidden = false;
        if (j && j.error === 'taken') { TAKEN[PENDING.plate] = true; renderCars(); }
      })
      .catch(function () { btn.disabled = false; btn.textContent = T('إرسال الطلب للاعتماد'); err.textContent = T('مفيش اتصال بالإنترنت، حاول تاني.'); err.hidden = false; });
  });

  /* ---------- Status ---------- */
  function refreshStatus() {
    if (!MYREQ || !MYREQ.id || !API_READY) return;
    fetch(API + '?a=status&id=' + encodeURIComponent(MYREQ.id) + '&iqama=' + encodeURIComponent(MYREQ.iqama))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) return;
        var changed = j.status !== MYREQ.status;
        MYREQ.status = j.status; MYREQ.reason = j.reason || ''; MYREQ.decidedAt = j.decidedAt || '';
        store('ijar-req', MYREQ);
        if (changed && j.status !== 'بانتظار الاعتماد') { ring(); toast(T(j.status === 'مقبول' ? 'تم قبول طلبك' : 'تم رفض طلبك')); }
        if (S.screen === 'status') renderStatus();
      }).catch(function () {});
  }
  function renderStatus() {
    var box = $('statusCard'); box.innerHTML = '';
    var r = MYREQ;
    function add(tag, txt, css) { var el = document.createElement(tag); if (txt != null) el.textContent = txt; if (css) el.style.cssText = css; box.appendChild(el); return el; }
    if (!r) { add('h2', T('لا يوجد طلب حالي')); return; }
    var key = r.status === 'مقبول' ? 'approved' : r.status === 'مرفوض' ? 'rejected' : 'pending';
    var map = { pending: ['بانتظار الاعتماد', 'var(--act-soft)', 'var(--act)', 'M12 7v5l3 2'], approved: ['تم قبول طلبك', 'var(--ok-soft)', 'var(--ok)', 'M5 12l5 5 9-10'], rejected: ['تم رفض طلبك', '#FDECEC', 'var(--err)', 'M6 6l12 12M18 6L6 18'] };
    var m = map[key];
    var ic = add('div', null, 'background:' + m[1] + ';color:' + m[2]); ic.className = 'big';
    ic.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (key === 'pending' ? '<circle cx="12" cy="12" r="9"></circle>' : '') + '<path d="' + m[3] + '"></path></svg>';
    add('h2', T(m[0]));
    add('p', T('رقم الطلب') + ': ' + (r.id || ''), 'margin:0;color:var(--muted);font-variant-numeric:tabular-nums');
    if (key === 'pending') add('p', T('طلبك وصل لقسم الاعتمادات. الصفحة دي بتتحدّث لوحدها، وهيرن الجرس لما يوصل الرد.'), 'margin:0;color:var(--muted)');
    if (key === 'rejected' && r.reason) add('p', T('السبب') + ': ' + r.reason, 'margin:0;color:var(--err);font-weight:600');
    if (key === 'approved') add('p', T('تواصل مع قسم الحركة لاستلام السيارة.'), 'margin:0;color:var(--muted)');
    var dl = document.createElement('dl'); dl.className = 'kv'; dl.style.textAlign = 'start'; dl.style.width = '100%';
    rowsFor(r).forEach(function (x) { var w = document.createElement('div'); var dt = document.createElement('dt'); dt.textContent = x[0] + ':'; var dd = document.createElement('dd'); dd.appendChild(bdi(x[1])); w.appendChild(dt); w.appendChild(dd); dl.appendChild(w); });
    box.appendChild(dl);
    if (key !== 'pending') { var b = add('button', T('طلب سيارة جديدة')); b.className = 'primary'; b.style.width = '100%'; b.addEventListener('click', function () { store('ijar-req', null); MYREQ = null; $('myReqBtn').hidden = true; show('home'); }); }
  }

  $('langBtn').addEventListener('click', toggleLang);
  $('langBtn2').addEventListener('click', toggleLang);
  applyLang();
  if (MYREQ && MYREQ.status === 'بانتظار الاعتماد') refreshStatus();
  show('home');
})();
