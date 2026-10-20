/* =====================================================================
   LIQUID GLASS — runtime
   1. Refraction: builds a per-element SVG displacement map (a lens that
      bends the backdrop at the bezel) and feeds it to backdrop-filter.
      Chromium only; every other browser keeps the CSS blur fallback.
   2. Light: moves the specular rim + bloom toward the pointer.
   3. Hero: scroll-scrubbed frame sequence from /hero-frames/.
   ===================================================================== */
(function () {
    'use strict';

    /* ------------------------------------------------------------------
       1. REFRACTION
    ------------------------------------------------------------------ */
    var SURFACES = [
        'body > nav', '.jobs-card', '.wa-builder', '.help-modal', '#jobs-popup', '#pwa-install-popup',
        '#jobs-bottom-banner', '#seek-help-notice', '#lang-toast', '#ham-drawer', '.seo-links a',
        '.wa-preview-box', '#section-3 > div', '#section-5 #section-5-text-col', '.jobs-badge',
        '.top', '.rel a', 'details', 'body > footer',
        '#section-2 .grid-2 > div:first-child', '#section-4 .grid-2 > div:last-child'
    ];
    var CONTROLS = [
        '.btn-solid', '.seek-help-btn', '.wa-send-btn', '.jobs-cta-btn', '.hf-submit-btn', '.social-btn',
        '.tt-carousel-btn', '.lang-btn', '.hf-chip', '.nav-lang-btn', '#nav-install-btn', '.hero-social-icon',
        '.ham-btn', '.help-modal-close', '.pwaw-btn-back', '.pwaw-btn-next', '.pwaw-btn-dismiss',
        '.pwaw-btn-chrome', '.notice-cta', '.jbb-btn', '.jobs-popup-cta', '.lang-confirm-btn',
        '.footer-links a', '.hero-scroll', '#hero-cursor-dot'
    ];
    /* video + tiktok cards hold iframes: they get the rim and cheap blur, no displacement */
    var RIM_ONLY = ['.video-card', '.tiktok-card'];
    var ALL = SURFACES.concat(CONTROLS, RIM_ONLY).join(',');
    var BIG_OK = '#section-3 > div, #section-5 #section-5-text-col, #section-2 .grid-2 > div:first-child, #section-4 .grid-2 > div:last-child';

    var NS = 'http://www.w3.org/2000/svg';
    var ua = navigator.userAgent;
    var chromium = /Chrome\/|Chromium\//.test(ua) && !/Firefox\//.test(ua);
    var lowPower = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) ||
                   (navigator.deviceMemory && navigator.deviceMemory <= 2);
    var noTransparency = window.matchMedia && matchMedia('(prefers-reduced-transparency: reduce)').matches;
    var refract = chromium && !lowPower && !noTransparency &&
                  window.CSS && CSS.supports && CSS.supports('backdrop-filter', 'blur(1px)');

    var defs = null, uid = 0, cache = new Map(), tracked = new WeakMap();

    function ensureDefs() {
        if (defs) return defs;
        var svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
        svg.setAttribute('aria-hidden', 'true');
        svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
        defs = document.createElementNS(NS, 'defs');
        svg.appendChild(defs);
        document.body.appendChild(svg);
        return defs;
    }

    /* Displacement map. R/G carry the sample offset, 128 = neutral.
       Strongest at the rim, fading to zero across the bezel, so the middle of
       the glass is clear and the edge visibly bends the backdrop. */
    function buildMap(w, h, r, bezel) {
        var sc = Math.min(1, Math.sqrt(220000 / (w * h)));
        var W = Math.max(4, Math.round(w * sc)), H = Math.max(4, Math.round(h * sc));
        var R = Math.min(r * sc, Math.min(W, H) / 2), B = Math.max(2, bezel * sc);
        var cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        var ctx = cv.getContext('2d');
        var img = ctx.createImageData(W, H), d = img.data;
        var cx = W / 2, cy = H / 2, hx = W / 2 - R, hy = H / 2 - R;
        for (var y = 0; y < H; y++) {
            for (var x = 0; x < W; x++) {
                var px = x + 0.5 - cx, py = y + 0.5 - cy;
                var qx = Math.abs(px) - hx, qy = Math.abs(py) - hy;
                var ox = Math.max(qx, 0), oy = Math.max(qy, 0);
                var len = Math.hypot(ox, oy);
                var depth = -(len + Math.min(Math.max(qx, qy), 0) - R);
                var nx = 0, ny = 0;
                if (len > 0) { nx = Math.sign(px) * ox / len; ny = Math.sign(py) * oy / len; }
                else if (qx > qy) { nx = Math.sign(px); }
                else { ny = Math.sign(py); }
                var mag = 0;
                if (depth > 0 && depth < B) {
                    var t = depth / B;
                    mag = Math.pow(1 - t, 1.7);
                } else if (depth <= 0) { mag = 1; }
                var i = (y * W + x) * 4;
                d[i]     = 128 + 127 * (-nx * mag);
                d[i + 1] = 128 + 127 * (-ny * mag);
                d[i + 2] = 128;
                d[i + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        return cv.toDataURL('image/png');
    }

    function el(tag, attrs) {
        var n = document.createElementNS(NS, tag);
        for (var k in attrs) n.setAttribute(k, attrs[k]);
        return n;
    }

    function filterFor(w, h, r, strength, bezel, disperse) {
        var key = [w, h, Math.round(r), strength, Math.round(bezel), disperse ? 1 : 0].join('|');
        if (cache.has(key)) return cache.get(key);
        var id = 'lg-' + (++uid);
        var f = el('filter', {
            id: id, x: 0, y: 0, width: w, height: h,
            filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse',
            'color-interpolation-filters': 'sRGB'
        });
        var im = el('feImage', { x: 0, y: 0, width: w, height: h, preserveAspectRatio: 'none', result: 'map' });
        var url = buildMap(w, h, r, bezel);
        im.setAttribute('href', url);
        im.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', url);
        f.appendChild(im);
        if (!disperse) {
            f.appendChild(el('feDisplacementMap', {
                'in': 'SourceGraphic', in2: 'map', scale: strength,
                xChannelSelector: 'R', yChannelSelector: 'G'
            }));
        } else {
            /* slight chromatic dispersion: red, green and blue bend by different amounts */
            [['R', 0.9, '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'],
             ['G', 1.0, '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0'],
             ['B', 1.12, '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0']].forEach(function (c) {
                f.appendChild(el('feDisplacementMap', {
                    'in': 'SourceGraphic', in2: 'map', scale: strength * c[1],
                    xChannelSelector: 'R', yChannelSelector: 'G', result: 'd' + c[0]
                }));
                f.appendChild(el('feColorMatrix', { 'in': 'd' + c[0], type: 'matrix', values: c[2], result: 'c' + c[0] }));
            });
            f.appendChild(el('feBlend', { 'in': 'cR', in2: 'cG', mode: 'screen', result: 'rg' }));
            f.appendChild(el('feBlend', { 'in': 'rg', in2: 'cB', mode: 'screen' }));
        }
        ensureDefs().appendChild(f);
        cache.set(key, id);
        return id;
    }

    function apply(node) {
        var rect = node.getBoundingClientRect();
        var w = Math.round(rect.width), h = Math.round(rect.height);
        if (w < 8 || h < 8) return;
        var cs = getComputedStyle(node);
        if (cs.position === 'static') node.style.position = 'relative';

        var rimOnly = node.matches(RIM_ONLY.join(','));
        var fixed = cs.position === 'fixed';
        var area = w * h;
        var limit = (fixed || node.matches(BIG_OK)) ? 520000 : 170000;
        if (!refract || rimOnly || fixed || area > limit) return;

        var minDim = Math.min(w, h);
        var r = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, minDim / 2);
        if (/%/.test(cs.borderTopLeftRadius)) r = minDim / 2;
        var bezel = Math.max(8, Math.min(minDim * 0.42, 38));
        var strength = Math.max(10, Math.min(minDim * 0.42, 34));
        var disperse = node.id === 'hero-cursor-dot';
        if (disperse) { strength = 38; bezel = minDim * 0.4; }

        var id = filterFor(w, h, r, Math.round(strength), bezel, disperse);
        var blur = minDim < 80 ? '0.6px' : '1.2px';
        var tone = disperse ? 'saturate(1.25) brightness(1.02)' : 'saturate(1.9) brightness(1.12)';
        node.style.setProperty('--lg-bf', 'url(#' + id + ') blur(' + blur + ') ' + tone);
    }

    var ro = ('ResizeObserver' in window) ? new ResizeObserver(function (entries) {
        entries.forEach(function (e) { schedule(e.target); });
    }) : null;
    var pending = new Set(), queued = false;
    function schedule(node) {
        pending.add(node);
        if (queued) return;
        queued = true;
        requestAnimationFrame(function () {
            queued = false;
            pending.forEach(apply);
            pending.clear();
        });
    }
    function register(root) {
        var list = root.querySelectorAll ? root.querySelectorAll(ALL) : [];
        for (var i = 0; i < list.length; i++) {
            var n = list[i];
            if (tracked.has(n)) continue;
            tracked.set(n, true);
            if (ro) ro.observe(n); else schedule(n);
        }
    }

    /* ------------------------------------------------------------------
       2. LIGHT — rim + bloom follow the pointer
    ------------------------------------------------------------------ */
    var lastLit = null;
    function lightOn(e) {
        var t = e.target;
        var n = t && t.closest ? t.closest(ALL) : null;
        if (lastLit && lastLit !== n) lastLit.style.removeProperty('--mx');
        lastLit = n;
        if (!n) return;
        var r = n.getBoundingClientRect();
        var x = e.clientX - r.left, y = e.clientY - r.top;
        n.style.setProperty('--mx', x + 'px');
        n.style.setProperty('--my', y + 'px');
        var ang = Math.atan2(y - r.height / 2, x - r.width / 2) * 180 / Math.PI + 90;
        n.style.setProperty('--lg-a', ang.toFixed(0) + 'deg');
    }

    /* ------------------------------------------------------------------
       3. HERO — scroll-scrubbed frame sequence
    ------------------------------------------------------------------ */
    function hero() {
        var cv = document.getElementById('hero-canvas');
        var track = document.getElementById('hero-track');
        var box = document.getElementById('hero-box');
        if (!cv || !track) return;

        var N = 240;
        var mq = window.matchMedia('(max-width: 768px)');
        var DIR = mq.matches ? 'hero-frames-mobile/frame_' : 'hero-frames/frame_';
        var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
        var saveData = navigator.connection && navigator.connection.saveData;
        var frames = new Array(N);
        var ctx = cv.getContext('2d', { alpha: false });
        var cur = 0, target = 0, lastIdx = -1, lastW = 0, dpr = 1, running = false;

        function src(i) { return DIR + String(i + 1).padStart(4, '0') + '.jpg'; }

        function fit() {
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            var w = box.clientWidth, h = box.clientHeight;
            cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
            lastIdx = -1;
            draw(true);
        }

        function nearest(i) {
            for (var a = i; a >= 0; a--) if (frames[a]) return a;
            for (var b = i + 1; b < N; b++) if (frames[b]) return b;
            return -1;
        }

        function draw(force) {
            var want = Math.round(cur);
            var idx = nearest(want);
            if (idx < 0 || (idx === lastIdx && !force)) return;
            var img = frames[idx];
            var cw = cv.width, ch = cv.height, iw = img.naturalWidth, ih = img.naturalHeight;
            var s = Math.max(cw / iw, ch / ih);
            var dw = iw * s, dh = ih * s;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, cw, ch);
            ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
            lastIdx = idx;
        }

        function progress() {
            var r = track.getBoundingClientRect();
            /* the next section overlaps the last viewport of the track, so the
               sequence finishes one viewport earlier */
            var total = r.height - window.innerHeight * 2;
            if (total <= 0) return 0;
            return Math.min(1, Math.max(0, -r.top / total));
        }

        function tick() {
            target = progress() * (N - 1);
            var diff = target - cur;
            cur = Math.abs(diff) < 0.02 ? target : cur + diff * 0.16;
            draw(false);
            if (Math.abs(target - cur) > 0.02) requestAnimationFrame(tick); else running = false;
        }
        function kick() { if (!running) { running = true; requestAnimationFrame(tick); } }

        /* load order: first frame, then a coarse pass, then fill the gaps */
        var order, qi, inflight = 0, MAX = 6, gen = 0;
        function plan() {
            order = [0]; qi = 0;
            var seen = { 0: 1 };
            [8, 4, 2, 1].forEach(function (stride) {
                if (saveData && stride < 4) return;
                for (var i = 0; i < N; i += stride) if (!seen[i]) { seen[i] = 1; order.push(i); }
            });
        }
        plan();
        function pump() {
            while (inflight < MAX && qi < order.length) {
                (function (i, g) {
                    inflight++;
                    var im = new Image();
                    im.decoding = 'async';
                    im.onload = function () {
                        if (g !== gen) { inflight--; return; }
                        frames[i] = im; inflight--;
                        if (i === 0) { box.classList.add('is-ready'); fit(); }
                        else if (Math.abs(i - cur) < 2) draw(false);
                        pump();
                    };
                    im.onerror = function () { inflight--; pump(); };
                    im.src = src(i);
                })(order[qi++], gen);
            }
        }

        /* phone <-> desktop switch (rotate, resize): load the other frame set */
        var onMq = function () {
            DIR = mq.matches ? 'hero-frames-mobile/frame_' : 'hero-frames/frame_';
            gen++; frames = new Array(N); lastIdx = -1; inflight = 0;
            plan(); pump();
        };
        if (mq.addEventListener) mq.addEventListener('change', onMq); else mq.addListener(onMq);

        window.addEventListener('resize', function () { fit(); kick(); }, { passive: true });
        if (!reduce) window.addEventListener('scroll', function () {
            box.classList.toggle('is-scrolled', window.scrollY > 40);
            kick();
        }, { passive: true });

        fit();
        pump();
        if (!reduce) kick();
    }

    /* ------------------------------------------------------------------ */
    function init() {
        register(document);
        if (window.MutationObserver) {
            new MutationObserver(function (muts) {
                muts.forEach(function (m) {
                    m.addedNodes.forEach(function (n) {
                        if (n.nodeType !== 1) return;
                        if (n.matches && n.matches(ALL) && !tracked.has(n)) { tracked.set(n, true); if (ro) ro.observe(n); }
                        register(n);
                    });
                });
            }).observe(document.body, { childList: true, subtree: true });
        }
        document.addEventListener('pointermove', lightOn, { passive: true });
        hero();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
