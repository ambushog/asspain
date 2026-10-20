/* i18n.js — DOM-based translator. English page text is the source of truth:
   originals are captured once, so switching back to English is an exact restore. */
(function () {
  var L = 'en:English:English,es:Spanish:Español,fr:French:Français,de:German:Deutsch,it:Italian:Italiano,pt:Portuguese:Português,nl:Dutch:Nederlands,pl:Polish:Polski,ru:Russian:Русский,uk:Ukrainian:Українська,tr:Turkish:Türkçe,ar:Arabic:العربية,fa:Persian:فارسی,ur:Urdu:اردو,hi:Hindi:हिन्दी,pa:Punjabi:ਪੰਜਾਬੀ,bn:Bengali:বাংলা,gu:Gujarati:ગુજરાતી,mr:Marathi:मराठी,ta:Tamil:தமிழ்,te:Telugu:తెలుగు,kn:Kannada:ಕನ್ನಡ,ml:Malayalam:മലയാളം,zh-CN:Chinese (Simplified):中文（简体）,zh-TW:Chinese (Traditional):中文（繁體）,ja:Japanese:日本語,ko:Korean:한국어,vi:Vietnamese:Tiếng Việt,th:Thai:ภาษาไทย,id:Indonesian:Bahasa Indonesia,ms:Malay:Bahasa Melayu,tl:Filipino:Filipino,sw:Swahili:Kiswahili,sv:Swedish:Svenska,no:Norwegian:Norsk,da:Danish:Dansk,fi:Finnish:Suomi,el:Greek:Ελληνικά,cs:Czech:Čeština,sk:Slovak:Slovenčina,hu:Hungarian:Magyar,ro:Romanian:Română,bg:Bulgarian:Български,hr:Croatian:Hrvatski,sr:Serbian:Српски,he:Hebrew:עברית,ne:Nepali:नेपाली,si:Sinhala:සිංහල,ca:Catalan:Català,eu:Basque:Euskara,gl:Galician:Galego'
    .split(',').map(function (s) { var a = s.split(':'); return { code: a[0], name: a[1], native: a[2] }; });
  var RTL = { ar: 1, fa: 1, ur: 1, he: 1 };
  var SKIP = 'script,style,noscript,svg,textarea,iframe,code,.notranslate,[translate="no"],#visit-counter,#lang-overlay';
  var ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  var items = null, cur = 'en', tok = 0, mem = {}, listeners = [];

  function key(c) { return 'i18n2_' + c; }
  function load(c) {
    if (mem[c]) return mem[c];
    try { mem[c] = JSON.parse(localStorage.getItem(key(c)) || '{}'); } catch (e) { mem[c] = {}; }
    return mem[c];
  }
  function save(c) { try { localStorage.setItem(key(c), JSON.stringify(mem[c])); } catch (e) {} }
  function worth(s) { return /\p{L}/u.test(s); }

  function scan() {
    items = [];
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentElement;
        if (!p || p.closest(SKIP)) return NodeFilter.FILTER_REJECT;
        return worth(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var n;
    while ((n = w.nextNode())) {
      var p = n.parentElement;
      if (p.tagName === 'OPTION' && !p.hasAttribute('value')) p.setAttribute('value', p.textContent.trim());
      (function (node) {
        var raw = node.nodeValue, m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
        items.push({ o: m[2], set: function (v) { node.nodeValue = m[1] + v + m[3]; } });
      })(n);
    }
    document.querySelectorAll('[placeholder],[aria-label],[title],[alt]').forEach(function (el) {
      if (el.closest(SKIP)) return;
      ATTRS.forEach(function (a) {
        var v = el.getAttribute(a);
        if (v && worth(v)) items.push({ o: v, set: function (x) { el.setAttribute(a, x); } });
      });
    });
    var d = document.querySelector('meta[name="description"]');
    items.push({ o: document.title, set: function (v) { document.title = v; } });
    window.__i18nDesc = d && d.content;
  }

  function fetchOne(s, c) {
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=' + encodeURIComponent(c) + '&dt=t&q=' + encodeURIComponent(s);
    return fetch(url).then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) { return j[0].map(function (x) { return x[0]; }).join(''); });
  }
  function pool(list, c, myTok) {
    var cache = load(c), i = 0, failed = 0;
    function worker() {
      if (i >= list.length || myTok !== tok) return Promise.resolve();
      var s = list[i++];
      return fetchOne(s, c).then(function (t) { if (t) cache[s] = t; }, function () { failed++; }).then(worker);
    }
    var ws = []; for (var k = 0; k < 6; k++) ws.push(worker());
    return Promise.all(ws).then(function () { save(c); return failed; });
  }
  function enDict() { try { return typeof EN !== 'undefined' ? EN : {}; } catch (e) { return {}; } }

  function paint(c) {
    var cache = c === 'en' ? null : load(c);
    items.forEach(function (it) { it.set(cache && cache[it.o] ? cache[it.o] : it.o); });
    document.documentElement.lang = c;
    document.documentElement.dir = RTL[c] ? 'rtl' : 'ltr';
    cur = c;
    var sel = document.getElementById('lang-select'); if (sel) sel.value = c;
    try { localStorage.setItem('amrik_lang', c); } catch (e) {}
    listeners.forEach(function (f) { try { f(c); } catch (e) {} });
  }

  function set(c) {
    var my = ++tok;
    if (!items) scan();
    if (c === 'en') { paint('en'); return Promise.resolve(true); }
    var cache = load(c), need = {}, list = [];
    items.forEach(function (it) { need[it.o] = 1; });
    var en = enDict(); Object.keys(en).forEach(function (k) { if (typeof en[k] === 'string' && worth(en[k])) need[en[k]] = 1; });
    Object.keys(need).forEach(function (s) { if (!cache[s]) list.push(s); });
    document.documentElement.classList.add('i18n-busy');
    return pool(list, c, my).then(function (failed) {
      document.documentElement.classList.remove('i18n-busy');
      if (my !== tok) return false;            // a newer choice won — never paint stale results
      paint(c);
      return failed === 0;
    });
  }

  function t(k) {
    var en = enDict(), s = en[k] || '';
    if (cur === 'en') return s;
    var c = load(cur); return c[s] || s;
  }

  function init() {
    var sel = document.getElementById('lang-select');
    if (sel) {
      sel.innerHTML = L.map(function (l) { return '<option value="' + l.code + '">' + l.native + '</option>'; }).join('');
      sel.addEventListener('change', function () { set(sel.value); });
    }
    var q = (location.search.match(/[?&]lang=([\w-]+)/) || [])[1], s = null;
    try { s = localStorage.getItem('amrik_lang'); } catch (e) {}
    var want = q || s || 'en';
    if (!/^[a-z]{2,3}(-[A-Za-z]+)?$/.test(want)) want = 'en';
    if (sel) sel.value = want;
    if (want !== 'en') set(want);
  }

  window.I18N = { langs: L, set: set, t: t, get current() { return cur; }, onChange: function (f) { listeners.push(f); } };
  window.t = t;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
