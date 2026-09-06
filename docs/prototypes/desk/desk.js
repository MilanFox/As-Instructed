/* ------------------------------------------------------------------
   desk.js — behaviour for the desk prototype.
   All copy below is taken verbatim from the real game where it exists
   (src/ui/copy.ts, src/meta/copy.ts, src/levels/index.ts,
   docs/NARRATIVE.md). Numbers marked INVENTED are placeholders.
   ------------------------------------------------------------------ */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var el = function (t, c, h) {
    var n = document.createElement(t);
    if (c) n.className = c;
    if (h != null) n.innerHTML = h;
    return n;
  };
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ================= layout: one unit, everything scales on it ===== */
  function fit() {
    var u = Math.min(innerWidth / 1560, innerHeight / 1000);
    document.documentElement.style.setProperty('--u', u + 'px');
  }
  addEventListener('resize', function () { fit(); board.draw(); });

  /* ================= content ====================================== */

  var PROGRAM =
'// NOTE(4470): two things grow here. the sensor knows which is which\n' +
'// NOTE(4470): the arm does not\n' +
'\n' +
"const HEADINGS = [Dir.North, Dir.East, Dir.South, Dir.West];\n" +
'\n' +
'function worthTaking(d) {\n' +
'  const t = scan(d);\n' +
"  if (!t || t.crop !== 'crop') return false;\n" +
'  return t.growth === t.maxGrowth;\n' +
'}\n' +
'\n' +
'function best() {\n' +
'  for (const d of HEADINGS) if (worthTaking(d)) return d;\n' +
'  return null;\n' +
'}\n' +
'\n' +
'while (inventory() < capacity()) {\n' +
'  const d = best();\n' +
'  if (d === null) { move(Dir.East); continue; }\n' +
'  move(d);\n' +
'  harvest();\n' +
"  print(`hopper ${inventory()} of ${capacity()}`);\n" +
'}\n';

  var LEVELS = {
    field: {
      id: 'W2-05', title: 'Harvest Quota', world: 'REGOLITH FIELDS',
      osd: 'WEST FIELD · GRID 14×8',
      objectives: [
        { t: 'Fill the hopper with crop', meter: [0, 9] }
      ],
      bonus: [{ t: 'Fill the hopper having set foot on at most 24 tiles' }],
      targets: [['ticks', '— / 96'], ['shift ends at', '2600'], ['seeds', '5'], ['closed on every seed', '— / 5']],
      par: 96, endTick: 34
    },
    shaft: {
      id: 'W4-05', title: 'The Deep Shaft', world: 'CAVE SYSTEMS',
      osd: 'DEEP SHAFT · GRID 40×40',
      objectives: [
        { t: 'Carry 5 ore out of the shaft', meter: [0, 5] },
        { t: 'End the run standing on the lift' },
        { t: 'Bring the bot back in one piece' }
      ],
      bonus: [{ t: 'Finish the job on one tank with a fifth of it unused' }],
      targets: [['ticks', '— / 700'], ['shift ends at', '2600'], ['seeds', '5'], ['closed on every seed', '2 / 3']],
      par: 700, endTick: 0
    }
  };

  var LOG_RUN = [
    ['0004', 'hopper 1 of 9'],
    ['0011', 'hopper 2 of 9'],
    ['0019', 'hopper 3 of 9'],
    ['0026', 'hopper 4 of 9'],
    ['0034', 'hopper 5 of 9'],
    ['0043', 'hopper 6 of 9'],
    ['0051', 'hopper 7 of 9'],
    ['0060', 'hopper 8 of 9'],
    ['0071', 'hopper 9 of 9']
  ];

  /* ================= the board ==================================== */
  var board = new Board($('#board'));

  /* ================= the editor =================================== */
  var code = $('#code'), mirror = $('#mirror'), gutter = $('#gutter');

  var KW = /\b(const|let|var|function|return|if|else|for|of|in|while|break|continue|new|null|true|false)\b/g;
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function highlight(src) {
    return src.split('\n').map(function (line) {
      if (/^\s*\/\/\s*(NOTE|TODO)\(4470\)/.test(line)) return '<span class="g">' + esc(line) + '</span>';
      if (/^\s*\/\//.test(line)) return '<span class="c">' + esc(line) + '</span>';
      var out = esc(line);
      out = out.replace(/(`[^`]*`|'[^']*')/g, '<span class="s">$1</span>');
      out = out.replace(/\b([A-Za-z_$][\w$]*)(?=\()/g, '<span class="f">$1</span>');
      out = out.replace(KW, '<span class="k">$&</span>');
      out = out.replace(/\b(\d+)\b/g, '<span class="n">$1</span>');
      return out;
    }).join('\n');
  }

  function renderCode() {
    mirror.innerHTML = highlight(code.value);
    var n = code.value.split('\n').length;
    var g = '';
    for (var i = 1; i <= n + 1; i++) g += i + '\n';
    gutter.textContent = g;
  }
  code.addEventListener('input', function () {
    renderCode();
    setState('EDIT');
    $('#problems').textContent = 'no problems';
    $('#problems').parentNode.classList.remove('err');
  });
  code.addEventListener('scroll', function () { mirror.scrollTop = code.scrollTop; });

  /* ================= the rail ===================================== */
  var level = 'field';

  function paintRail(progress) {
    var L = LEVELS[level];
    var objs = $('#objs'), bon = $('#bonus');
    objs.innerHTML = ''; bon.innerHTML = '';
    var met = 0;
    L.objectives.forEach(function (o, i) {
      var on = progress && progress.done > i;
      var active = progress && progress.done === i;
      if (on) met++;
      var li = el('li', on ? 'on' : (active ? 'active' : ''),
        '<i>' + (on ? '✓' : (active ? '▸' : '□')) + '</i><span>' + o.t + '</span>');
      if (o.meter) {
        var v = progress ? Math.min(o.meter[1], progress.count) : 0;
        li.insertAdjacentHTML('beforeend',
          '<div class="meter"><i style="width:' + (v / o.meter[1] * 100) + '%"></i></div>');
        li.querySelector('span').innerHTML = o.t + ' <b style="color:var(--ink)">' + v + ' / ' + o.meter[1] + '</b>';
      }
      objs.appendChild(li);
    });
    L.bonus.forEach(function (o) {
      bon.appendChild(el('li', progress && progress.bonus ? 'on' : '',
        '<i>' + (progress && progress.bonus ? '★' : '□') + '</i><span>' + o.t + '</span>'));
    });
    $('#objCount').textContent = met + '/' + L.objectives.length;
    var dl = document.querySelector('.targets');
    dl.innerHTML = L.targets.map(function (t) {
      var v = t[0] === 'ticks' && progress ? progress.ticks + ' / ' + L.par : t[1];
      return '<dt>' + t[0] + '</dt><dd>' + v + '</dd>';
    }).join('');
    $('#osdId').textContent = L.osd;
    $('.tb-path') && ($('.tb-path').textContent = '~/orders/' + L.id.toLowerCase());
  }

  function setState(s) { $('#tbState').textContent = s; }

  /* ================= the log ====================================== */
  function logLine(tick, text, cls) {
    var b = $('#logBody');
    b.appendChild(el('div', '', '<span class="t">' + tick + '</span>  <span class="' + (cls || '') + '">' + text + '</span>'));
    while (b.childNodes.length > 7) b.removeChild(b.firstChild);
  }
  function logClear(meta) { $('#logBody').innerHTML = ''; $('#logMeta').textContent = meta || 'idle'; }

  /* ================= sound (synthesised, no assets) =============== */
  var actx = null;
  function ac() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } return actx; }
  function noise(dur, freq, q, gain, type) {
    var c = ac(); if (!c) return;
    var n = c.sampleRate * dur, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.2);
    var src = c.createBufferSource(); src.buffer = buf;
    var f = c.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    var g = c.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(c.destination); src.start();
  }
  var SFX = {
    thud: function () { noise(.20, 160, .8, .55, 'lowpass'); noise(.07, 900, 1.2, .18); },
    clunk: function () { noise(.10, 240, 1.4, .34, 'lowpass'); },
    slide: function () { noise(.34, 2600, .6, .09); },
    tick: function () { noise(.03, 1800, 2, .10); },
    beep: function () {
      var c = ac(); if (!c) return;
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'square'; o.frequency.value = 880; g.gain.value = .04;
      o.connect(g); g.connect(c.destination); o.start();
      g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + .12); o.stop(c.currentTime + .13);
    }
  };

  /* ================= documents ==================================== */
  var paperLayer = $('#paperLayer');
  var docs = {};

  function place(node, x, y, rot) {
    node.style.left = 'calc(50% + ' + x + ' * var(--u))';
    node.style.top = 'calc(50% + ' + y + ' * var(--u))';
    node.style.setProperty('--rot', (rot || 0) + 'deg');
    node.style.transform = 'rotate(' + (rot || 0) + 'deg) scale(var(--rest))';
  }

  function makeDoc(key, cls, w, html) {
    if (docs[key]) { docs[key].remove(); }
    var d = el('div', 'doc ' + (cls || ''), html);
    d.style.width = 'calc(' + w + ' * var(--u))';
    d.dataset.key = key;
    d.dataset.w = w;
    d.insertAdjacentHTML('beforeend', '<div class="putdown">click to put it down</div>');
    if (PINNABLE[key]) {
      var pinBtn = el('button', 'pin');
      pinBtn.title = 'pin it to the copy stand';
      pinBtn.setAttribute('aria-label', 'Pin to the copy stand');
      pinBtn.addEventListener('click', function (e) { e.stopPropagation(); pin(key); });
      d.appendChild(pinBtn);
    }
    paperLayer.appendChild(d);
    docs[key] = d;
    drag(d);
    pickupable(d);
    return d;
  }

  /* ---- 1. PICK IT UP -------------------------------------------------
     Click a sheet and it comes off the desk to a size meant to be read.
     It also gets brighter, because it is nearer the lamp. Click again and
     it goes back exactly where it was. This is not a zoom control; it is
     the gesture a person at a desk actually makes.                        */

  var lifted = null;

  function docScale(d) {
    var u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u'));
    var r = d.getBoundingClientRect();
    var h = r.height / (d.classList.contains('up') ? (+d.dataset.scale || 1) : 1);
    var wantH = innerHeight * 0.92;
    var wantW = innerWidth * 0.42;
    return Math.max(1, Math.min(1.9, wantH / h, wantW / (+d.dataset.w * u)));
  }

  function putDown() {
    if (!lifted) return;
    var d = lifted; lifted = null;
    d.classList.remove('up');
    d.style.transform = 'rotate(' + (d.dataset.rot || '0deg') + ') scale(var(--rest))';
    d.style.left = d.dataset.homeL;
    d.style.top = d.dataset.homeT;
  }

  function pickUp(d) {
    if (lifted === d) { putDown(); return; }
    if (lifted) putDown();
    var r0 = d.getBoundingClientRect();
    d.dataset.homeL = d.style.left;
    d.dataset.homeT = d.style.top;
    d.dataset.rot = d.style.getPropertyValue('--rot') || '0deg';
    var k = docScale(d);
    d.dataset.scale = k;
    d.classList.add('up');
    d.style.zIndex = ++zTop;
    /* over the right of the desk, so it never covers the terminal */
    var w = r0.width * k;
    d.style.left = Math.round(innerWidth - w - innerWidth * 0.04) + 'px';
    d.style.top = Math.round(innerHeight * 0.035) + 'px';
    d.style.transform = 'rotate(-0.5deg) scale(' + k + ')';
    d.style.transformOrigin = '50% 0';
    SFX.slide();
  }

  function pickupable(d) {
    d.addEventListener('click', function (e) {
      if (e.target.closest('button, .sigline, .stampbox, .pin')) return;
      if (holding) return;                 /* a stamp is in hand */
      if (d.dataset.moved) { delete d.dataset.moved; return; }
      pickUp(d);
    });
  }

  /* ---- 2. PIN IT -----------------------------------------------------
     A different mechanism for a different reason. (1) is for reading now.
     (2) is for keeping something readable WHILE YOU WRITE. What goes on
     the stand is the ask and the site data at a larger size than the sheet
     itself carries — the flavour paragraph stays on the paper.            */

  var PINNABLE = {
    order: {
      head: ['WORK ORDER', 'W2-05'],
      ask: 'Come back with the hopper full of crop.',
      facts: [
        ['The field', '<b style="font-family:var(--mono)">12 by 6</b>. Far more ground than one shift buys.'],
        ['The hopper', 'Holds a different amount every shift. <code>inventory()</code> is the only reading of it.'],
        ['harvest()', 'Hands back nothing on a crop that is not ripe yet, and nothing when the hopper is full. The two look the same.'],
        ['scan().crop', '<code>"crop"</code> counts. <code>"ice"</code> does not, and the slot it takes stays spent.'],
        ['Sensor reach', 'scan(Dir.North) and scan(Dir.South) read the rows either side.']
      ]
    },
    req: {
      head: ['REQUISITION', 'KD-2246'],
      ask: 'Two commands were fitted to the bot.',
      facts: [
        ['scan(dir)', 'Returns what is on a neighbouring tile, or on the bot’s own. Sensing is free.'],
        ['harvest()', 'Takes the crop on the bot’s tile into inventory. Costs 2 ticks.'],
        ['Note', 'A subroutine is charged at the point of use, in full, on every call.']
      ]
    },
    cert: {
      head: ['CLOSURE', 'W2-05'],
      ask: 'work order closed — at par',
      facts: [
        ['TICKS', '96, against a par of 96.'],
        ['SEEDS', '5 of 5. Closed on every seed.'],
        ['NOTED', 'Under par. Par has been adjusted. This is how it has always worked.']
      ]
    },
    review: {
      head: ['REVIEW', '#4471'],
      ask: 'EXCEPTIONAL (NON-BINDING)',
      facts: [
        ['GRADE', '78%, over 11 work orders.'],
        ['NOTE', 'Contractor #4470 held this grade for two consecutive quarters.']
      ]
    },
    halt: {
      head: ['HALT NOTICE', 'KD-2231'],
      ask: 'Stopped at the tick budget.',
      facts: [
        ['AT TICK', '96, of an allowance of 96.'],
        ['CAUSE', 'The route walks the whole field. The sensor reads three rows at once.']
      ]
    }
  };

  function pin(key) {
    var c = PINNABLE[key];
    if (!c) return;
    var page = $('#csPage');
    page.innerHTML =
      '<div class="cs-head"><b>' + c.head[0] + '</b><span>' + c.head[1] + '</span></div>' +
      '<div class="cs-ask">' + c.ask + '</div>' +
      '<div class="cs-facts">' + c.facts.map(function (f) {
        return '<div><b>' + f[0] + '</b><span>' + f[1] + '</span></div>';
      }).join('') + '</div>' +
      '<button class="cs-unpin">unpin</button>';
    page.classList.remove('landing');
    void page.offsetWidth;
    page.classList.add('landing');
    page.querySelector('.cs-unpin').addEventListener('click', unpin);
    SFX.clunk();
  }
  function unpin() {
    $('#csPage').innerHTML =
      '<div class="cs-empty"><b>COPY STAND</b><span>nothing pinned</span>' +
      '<small>K&amp;D FORM 40/A · issued 2206</small></div>';
    SFX.tick();
  }

  function arrive(node, x, y, rot, delay) {
    place(node, x, y, rot);
    node.style.opacity = '0';
    setTimeout(function () {
      node.style.opacity = '';
      node.classList.add('doc-arrive');
      if (!reduced) { SFX.slide(); setTimeout(SFX.clunk, 380); }
      node.addEventListener('animationend', function () { node.classList.remove('doc-arrive'); }, { once: true });
    }, delay || 0);
  }

  /* dragging: position is meaningful and it persists */
  function drag(node) {
    var sx, sy, ox, oy, rot;
    node.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button, .sigline, .stampbox')) return;
      node.setPointerCapture(e.pointerId);
      var r = node.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      rot = node.style.getPropertyValue('--rot') || '0deg';
      node.style.zIndex = ++zTop;
      node.dataset.dragging = '1';
    });
    node.addEventListener('pointermove', function (e) {
      if (!node.dataset.dragging) return;
      if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 4) node.dataset.moved = '1';
      if (node.classList.contains('up')) return;
      node.style.left = (ox + e.clientX - sx) + 'px';
      node.style.top = (oy + e.clientY - sy) + 'px';
      node.style.transform = 'rotate(' + rot + ')';
    });
    node.addEventListener('pointerup', function () { delete node.dataset.dragging; });
  }
  var zTop = 20;

  /* ================= the documents themselves ===================== */

  function workOrder() {
    var d = makeDoc('order', '', 452,
      '<h1><b>WORK ORDER</b><span>W2-05</span></h1>' +
      '<h2>Harvest Quota</h2>' +
      '<div class="kicker">REGOLITH FIELDS · WEST</div>' +
      '<dl class="meta">' +
      '<dt>FROM</dt><dd>Field Eng. D. Halloran</dd>' +
      '<dt>TO</dt><dd>Contractor #4471</dd>' +
      '<dt>SEEDS</dt><dd>1 &nbsp;2 &nbsp;3 &nbsp;4 &nbsp;5</dd>' +
      '</dl>' +
      '<p>two things grow in the west field. one of them is the crop. the other is ice-scrub, which likes the same soil and is worth nothing to anybody.</p>' +
      '<p class="ask">Come back with the hopper full of crop.</p>' +
      '<div class="facts">' +
      '<div><b>The field</b><span><b style="color:var(--p-ink);letter-spacing:0;font-family:var(--mono)">12 by 6</b>. Far more ground than one shift buys.</span></div>' +
      '<div><b>The hopper</b><span>Holds a different amount every shift. <code>inventory()</code> is the only reading of it.</span></div>' +
      '<div><b>harvest()</b><span>Hands back nothing on a crop that is not ripe yet, and nothing when the hopper is full. The two look the same.</span></div>' +
      '<div><b>scan().crop</b><span><code>"crop"</code> counts towards the quota. <code>"ice"</code> does not, and the slot it takes stays spent.</span></div>' +
      '<div><b>Sensor reach</b><span><code>scan(Dir.North)</code> and <code>scan(Dir.South)</code> read the rows either side. Three rows from one; the wheels cover one.</span></div>' +
      '</div>' +
      '<div class="foot">Yield is up eleven percent. Yield is measured by a machine that we also maintain.<sup>2</sup></div>' +
      '<div class="ref">KD-W2-05 · SHEET 1 OF 1</div>');
    return d;
  }

  function haltNotice() {
    return makeDoc('halt', 'pink', 400,
      '<h1><b>HALT NOTICE</b><span>KD-2231</span></h1>' +
      '<div class="kicker" style="margin-top:calc(10*var(--u))">SITE SYSTEMS · AUTOMATIC</div>' +
      '<dl class="meta">' +
      '<dt>ORDER</dt><dd>W2-05 &nbsp;Harvest Quota</dd>' +
      '<dt>RUN</dt><dd>#7 &nbsp;· &nbsp;seed 3</dd>' +
      '<dt>AT TICK</dt><dd>96</dd>' +
      '</dl>' +
      '<p>Shift over. Your program burned through its 96-tick allowance and was powered down mid-task. Kessler &amp; Daughters bills by the tick; consider a shorter route.</p>' +
      '<p class="quiet">Nothing was billed. Attempts are not recorded against you.</p>' +
      '<div class="dot">dot: you are walking the whole field. the sensor reads three rows at once. that is the whole of it</div>' +
      '<div class="stampbox filled" style="height:calc(72*var(--u));border-style:solid;border-color:#c3bba9">' +
      '<div class="inked halt" style="--sr:-4deg;font-size:calc(15*var(--u))">FILED<small>NO ACTION REQUIRED</small></div></div>' +
      '<div class="ref">KD-2231 · COPY 3 OF 3</div>');
  }

  function closureCert() {
    return makeDoc('cert', '', 424,
      '<h1><b>CERTIFICATE OF CLOSURE</b><span>W2-05</span></h1>' +
      '<h2 style="font-size:calc(15*var(--u));letter-spacing:.06em">work order closed</h2>' +
      '<p style="margin-top:calc(8*var(--u))">At par. Somebody upstairs will assume par was set wrong.</p>' +
      '<div class="facts" style="margin-top:calc(6*var(--u))">' +
      '<div><b>TICKS</b><span style="font-family:var(--mono);color:var(--p-ink)">96 &nbsp;<span style="color:var(--p-dim)">par 96</span></span></div>' +
      '<div><b>SEEDS</b><span style="font-family:var(--mono)">5 / 5 &nbsp;closed on every seed</span></div>' +
      '<div><b>BONUS</b><span>Fill the hopper having set foot on at most 24 tiles &nbsp;<b style="color:#9a7420">★</b></span></div>' +
      '<div><b>NOTED</b><span>Under par. Par has been adjusted. This is how it has always worked.</span></div>' +
      '</div>' +
      '<div class="stampbox" data-stampbox="1"><span>AFFIX GRADE</span></div>' +
      '<div class="foot">Closure of a work order does not constitute acceptance of the work.<sup>4</sup></div>' +
      '<div class="ref">KD-W2-05 · CLOSURE</div>');
  }

  function requisition() {
    var d = makeDoc('req', 'card', 462,
      '<h1><b>HARDWARE REQUISITION</b><span>KD-2246</span></h1>' +
      '<div class="kicker" style="margin-top:calc(10*var(--u))">PROCUREMENT, VIA DEP. COORDINATOR M. VANCE</div>' +
      '<p>The requisition has cleared. This is unusual and we would rather not examine it.</p>' +
      '<div class="crate"><div class="nm">scan()</div><div>' +
      '<div class="sp">Returns what is on a neighbouring tile, or on the bot’s own. Sensing is free.</div>' +
      '<div class="op">The bot stops needing to be told what is in front of it.</div></div></div>' +
      '<div class="crate"><div class="nm">harvest()</div><div>' +
      '<div class="sp">Takes the crop on the bot’s tile into inventory. Costs 2 ticks.</div>' +
      '<div class="op">The fields can be worked without a person standing in one.</div></div></div>' +
      '<div class="dot">dot: read the reference before you trust it. i didn’t, once</div>' +
      '<div class="sigline"><div class="rule">' +
      '<div class="hint">sign here — drag the pen across the line</div>' +
      '<svg width="100%" height="100%"><path d=""></path></svg>' +
      '</div><div class="cap"><span>CONTRACTOR #4471</span><span>2209–04–11</span></div></div>' +
      '<div class="foot">Fitted to the bot. Procurement have closed the requisition.</div>' +
      '<div class="ref">KD-2246 · DELIVERY NOTE</div>');
    signable(d);
    return d;
  }

  function review() {
    return makeDoc('review', '', 470,
      '<h1><b>PERFORMANCE REVIEW</b><span>CONTRACTOR #4471</span></h1>' +
      '<h2 style="font-size:calc(17*var(--u));letter-spacing:.14em">EXCEPTIONAL<span style="color:var(--p-dim)"> (NON-BINDING)</span></h2>' +
      '<dl class="meta">' +
      '<dt>FROM</dt><dd>Deputy Site Coordinator M. Vance</dd>' +
      '<dt>REVIEWED</dt><dd>11 work orders</dd>' +
      '<dt>GRADE</dt><dd>78%</dd>' +
      '</dl>' +
      '<p>6 gold results. Finance have asked whether the tick budgets were set correctly. They were. I have told them they were. They have asked again.</p>' +
      '<p>Please understand that when a contractor performs at this level, the question the site asks is not “how”, it is “why is this possible”, and that question has historically been resolved by adjusting the budgets.</p>' +
      '<p>Contractor #4470 held this grade for two consecutive quarters.</p>' +
      '<div class="dot">dot: 4470 got this grade too. i’d slow down. i wouldn’t, but i’d say it</div>' +
      '<div class="foot"><sup>1</sup> “Exceptional” is descriptive and confers no entitlement, escalation, or standing.</div>' +
      '<div class="acts"><button class="act">Acknowledge receipt</button></div>' +
      '<div class="ref">PERSONNEL &amp; SCHEDULING</div>');
  }

  /* ================= signing ====================================== */
  function signable(d) {
    var rule = d.querySelector('.sigline .rule');
    var path = d.querySelector('.sigline path');
    var pts = [], down = false;
    rule.addEventListener('pointerdown', function (e) {
      down = true; pts = []; rule.setPointerCapture(e.pointerId);
      d.querySelector('.sigline').classList.add('signed');
      SFX.tick();
    });
    rule.addEventListener('pointermove', function (e) {
      if (!down) return;
      var r = rule.getBoundingClientRect();
      pts.push([e.clientX - r.left, e.clientY - r.top]);
      path.setAttribute('d', 'M' + pts.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('L'));
      if (pts.length % 5 === 0) SFX.tick();
    });
    rule.addEventListener('pointerup', function () {
      down = false;
      if (pts.length > 6) {
        SFX.clunk();
        d.querySelector('.foot').innerHTML =
          'Signed for on your behalf. The signature is not yours and the item is.<br>' +
          '<span style="color:var(--p-ink)">Fitted to the bot. Procurement have closed the requisition.</span>';
      } else {
        d.querySelector('.sigline').classList.remove('signed');
      }
    });
  }

  /* ================= stamping ===================================== */
  var STAMPS = [
    { k: 'gold', d: 'GOLD', sub: 'AT PAR OR UNDER' },
    { k: 'silver', d: 'SILVER', sub: 'UP TO A QUARTER OVER' },
    { k: 'bronze', d: 'BRONZE', sub: 'A PASS' },
    { k: 'closed', d: 'CLOSED', sub: 'NO NOTES' }
  ];
  var rack = $('#rack'), held = $('#held'), heldDie = $('#heldDie'), holding = null;

  STAMPS.forEach(function (s) {
    var b = el('button', 'stamp ' + s.k, '<div class="sh"></div><div class="sb">' + s.d + '</div>');
    b.title = 'pick up the ' + s.d + ' stamp';
    b.addEventListener('click', function () {
      holding = s;
      heldDie.textContent = s.d;
      held.hidden = false;
      document.body.classList.add('stamping');
      SFX.tick();
    });
    rack.appendChild(b);
  });

  addEventListener('pointermove', function (e) {
    if (!holding) return;
    held.style.left = e.clientX + 'px';
    held.style.top = e.clientY + 'px';
  });

  document.addEventListener('click', function (e) {
    if (!holding) return;
    var box = e.target.closest('[data-stampbox]');
    if (!box) {
      if (e.target.closest('.stamp')) return;
      holding = null; held.hidden = true; document.body.classList.remove('stamping');
      return;
    }
    box.classList.add('filled');
    var ink = el('div', 'inked ' + holding.k, holding.d + '<small>' + holding.sub + '</small>');
    ink.style.setProperty('--sr', (-9 + Math.random() * 6).toFixed(1) + 'deg');
    box.appendChild(ink);
    box.closest('.doc').classList.add('shook');
    SFX.thud();
    filed.push({ id: 'w2-05', title: 'Harvest Quota', medal: holding.k, star: true });
    holding = null; held.hidden = true; document.body.classList.remove('stamping');
    var f = box.closest('.doc').querySelector('.foot');
    if (f) f.innerHTML = 'Entered on the record. <span style="color:var(--p-ink)">Filed. Forwarded to somebody who will not read it.</span>';
  });

  /* ================= the binder =================================== */
  var WORLDS = [
    ['1 · BOOT SECTOR', [['w1-01', 'Cold Start', 'closed'], ['w1-02', 'Turn Left', 'gold'], ['w1-03', 'Length Unknown', 'closed'],
      ['w1-04', 'The Long Way', 'silver'], ['w1-05', 'Floor Inspection', 'gold']]],
    ['2 · REGOLITH FIELDS', [['w2-02', 'Rotation', 'gold'], ['w2-04', 'Capacity', 'silver'], ['w2-05', 'Harvest Quota', 'gold'],
      ['w3-01', 'Pick and Place', 'bronze'], ['w3-02', 'Sorted by Colour', 'open']]],
    ['3 · THE SORTING YARDS', [['w3-04', 'First In, First Out', 'open'], ['w4-01', 'Headlamp', 'open'],
      ['w4-02', 'Breadcrumbs', 'open'], ['w4-05', 'The Deep Shaft', 'open'], ['w5-01', 'Mains', 'open']]]
  ];
  var filed = [];

  function openBinder() {
    var grid = $('#boGrid'); grid.innerHTML = '';
    WORLDS.forEach(function (w) {
      grid.appendChild(el('div', 'bo-world', '<span>' + w[0] + '</span><i></i>'));
      w[1].forEach(function (l) {
        var open = l[2] === 'open';
        var mk = open ? 'OPEN' : (l[2] === 'closed' ? 'CLOSED' : l[2].toUpperCase());
        grid.appendChild(el('div', 'bo-card ' + l[2],
          '<div class="id">' + l[0].toUpperCase() + '</div><div class="ti">' + l[1] + '</div>' +
          (open ? '<div class="mk" style="color:#a9a292;transform:none;border-style:dashed">OPEN</div>'
                : '<div class="mk">' + mk + '</div>') +
          (l[2] === 'gold' ? '<div class="star">★</div>' : '')));
      });
    });
    $('#boTally').innerHTML =
      '<div><b>19</b><span>POINTS</span></div><div><b>9</b><span>CLOSED</span></div>' +
      '<div><b>4</b><span>GOLD</span></div><div><b>2</b><span>SILVER</span></div>' +
      '<div><b>1</b><span>BRONZE</span></div><div><b>3</b><span>STARS</span></div>';
    $('#binderOpen').hidden = false;
    SFX.clunk();
  }
  $('#binder').addEventListener('click', openBinder);
  $('#boClose').addEventListener('click', function () { $('#binderOpen').hidden = true; SFX.clunk(); });

  /* ================= the run ====================================== */
  var playing = false, raf = 0, t0 = 0, tickAt = 0, runLen = 34, logIdx = 0, mode = 'write';

  function setMode(m) {
    mode = m;
    document.body.dataset.mode = m;
    setState(m === 'watch' ? 'RUN' : 'EDIT');
  }

  function lamps(a, b, c) {
    $('#lampReady').classList.toggle('on', !!a);
    $('#lampOut').classList.toggle('on', !!b);
    $('#lampBack').classList.toggle('on', !!c);
  }

  function dispatchRun(fail) {
    if (mode === 'watch') return;
    $('#btnDispatch').classList.add('down');
    setTimeout(function () { $('#btnDispatch').classList.remove('down'); }, 160);
    SFX.thud();
    $('#dspSub').textContent = 'in flight · 41 min';
    lamps(0, 1, 0);
    logClear('dispatched · seed 3');
    logIdx = 0;
    board.reveal = reduced ? 1 : 0;
    setMode('watch');
    $('#feedTick').hidden = false;
    $('#feedStamp').hidden = true;
    setTimeout(function () {
      lamps(0, 0, 1);
      $('#dspSub').textContent = 'trace returned';
      play(fail);
    }, reduced ? 60 : 620);
  }

  function play(fail) {
    playing = true;
    $('#btnPlay').innerHTML = '&#10073;&#10073;';
    t0 = performance.now() - tickAt * 90;
    cancelAnimationFrame(raf);
    var end = fail ? runLen * 0.72 : runLen;
    (function step(now) {
      if (!playing) return;
      if (board.reveal < 1) board.reveal = Math.min(1, board.reveal + 0.055);
      tickAt = Math.min(end, (now - t0) / 90);
      board.setTick(tickAt);
      paintTick(fail);
      board.draw();
      if (tickAt >= end) { playing = false; finish(fail); return; }
      raf = requestAnimationFrame(step);
    })(performance.now());
  }

  function paintTick(fail) {
    var shown = Math.round(tickAt / runLen * (fail ? 96 : 96));
    $('#tickRead').textContent = String(shown).padStart(4, '0');
    $('#feedTick').textContent = String(shown).padStart(4, '0');
    $('#scrub').value = Math.round(tickAt / runLen * 1000);
    var n = Math.min(9, Math.floor(tickAt / runLen * 9.4));
    paintRail({ done: n >= 9 ? 1 : 0, count: n, ticks: shown, bonus: false });
    while (logIdx < LOG_RUN.length && LOG_RUN[logIdx][0] <= String(shown).padStart(4, '0')) {
      logLine(LOG_RUN[logIdx][0], LOG_RUN[logIdx][1]);
      logIdx++;
    }
    // the executing line, marked in the gutter and highlighted in the code
    var lines = code.value.split('\n').length;
    var hot = 18 + (Math.floor(tickAt * 1.4) % 5);
    var ex = $('#execLine');
    ex.hidden = false;
    ex.style.top = 'calc((' + (hot - 1) + ' * 21 + 10) * var(--u) * var(--ts))';
  }

  function finish(fail) {
    $('#btnPlay').innerHTML = '&#9654;';
    $('#tickMax').textContent = fail ? '0096' : '0096';
    if (fail) {
      $('#problems').textContent = 'Shift ended. The work did not.';
      $('#problems').parentNode.classList.add('err');
      logLine('0096', 'HALT — tick budget', 'e');
      logLine('', 'Shift over. Your program burned through its 96-tick', 'e');
      logLine('', 'allowance and was powered down mid-task.', 'e');
      $('#logMeta').textContent = 'halted';
      setState('HALT');
      SFX.beep();
      setTimeout(function () { arrive(haltNotice(), 190, -110, -2.2); }, reduced ? 0 : 520);
    } else {
      $('#tickMax').textContent = '0096';
      LEVELS.field.targets[3][1] = '5 / 5';
      logLine('0096', 'work order closed', 'o');
      $('#logMeta').textContent = 'closed · 5 of 5 seeds';
      $('#problems').textContent = 'closed on every seed';
      setState('CLOSED');
      paintRail({ done: 1, count: 9, ticks: 96, bonus: true });
      setTimeout(function () { arrive(closureCert(), 200, -140, 1.6); }, reduced ? 0 : 480);
    }
  }

  /* ================= controls ===================================== */
  $('#btnDispatch').addEventListener('click', function () { dispatchRun(false); });
  $('#btnPlay').addEventListener('click', function () {
    if (playing) { playing = false; $('#btnPlay').innerHTML = '&#9654;'; }
    else { if (tickAt >= runLen) tickAt = 0; play(false); }
  });
  $('#btnFwd').addEventListener('click', function () { tickAt = Math.min(runLen, tickAt + 1); board.setTick(tickAt); paintTick(); board.draw(); });
  $('#btnBack').addEventListener('click', function () { tickAt = Math.max(0, tickAt - 1); board.setTick(tickAt); paintTick(); board.draw(); });
  $('#scrub').addEventListener('input', function () {
    playing = false; $('#btnPlay').innerHTML = '&#9654;';
    tickAt = this.value / 1000 * runLen;
    board.setTick(tickAt); paintTick(); board.draw();
  });

  /* clicking the desk puts down whatever is in your hand */
  document.addEventListener('click', function (e) {
    if (!lifted) return;
    if (e.target.closest('.doc')) return;
    putDown();
  });

  addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); dispatchRun(false); return; }
    var typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if (e.key === 'Escape') { $('#binderOpen').hidden = true; putDown(); }
    if (typing) return;
    if (e.key === ' ') { e.preventDefault(); $('#btnPlay').click(); }
  });

  /* ---- 3. SIZE -------------------------------------------------------
     One control, on the terminal's own bezel, where a 1988 monitor would
     have carried H-SIZE and V-SIZE. It scales TYPE and line boxes across
     the whole desk — screens and paper alike — and leaves the station
     geometry alone, because the station is already fitted to the viewport
     and scaling that up only crops the desk. Persisted, like the art
     direction, under a bootstrap key.                                    */

  var SIZES = [1, 1.15, 1.3, 1.5];
  var sizeIdx = 0;
  try { sizeIdx = Math.max(0, SIZES.indexOf(parseFloat(localStorage.getItem('bootstrap.deskSize')))); } catch (e) { }
  if (sizeIdx < 0) sizeIdx = 0;

  function applySize() {
    var v = SIZES[sizeIdx];
    document.documentElement.style.setProperty('--ts', v);
    $('#sizeRead').textContent = v.toFixed(2).replace(/0$/, '');
    $('.sk-dial i').style.setProperty('--a', (-50 + sizeIdx * 33) + 'deg');
    try { localStorage.setItem('bootstrap.deskSize', v); } catch (e) { }
    if ($('#execLine')) $('#execLine').style.height = 'calc(21 * var(--u) * var(--ts))';
  }
  $('#sizeKnob').addEventListener('click', function () {
    sizeIdx = (sizeIdx + 1) % SIZES.length;
    applySize(); SFX.tick();
  });

  /* ---- the display mode. A switch on the bezel, not a settings screen. */
  var art = 'deepsite';
  try { art = localStorage.getItem('bootstrap.art') || 'deepsite'; } catch (e) { }
  function applyArt() {
    document.body.dataset.art = art;
    $('#dispRead').textContent = art === 'signal' ? 'SIGNAL' : 'DEEP SITE';
    board.setArt(art);
    try { localStorage.setItem('bootstrap.art', art); } catch (e) { }
  }
  $('#dispSw').addEventListener('click', function () {
    art = art === 'signal' ? 'deepsite' : 'signal';
    applyArt(); SFX.tick();
  });

  /* ---- the coordinate readout. AUDIT carried: the player must be able
     to name the tile they are looking at. Nothing is drawn over the grid. */
  $('#board').addEventListener('mousemove', function (e) {
    var g = board.geom; if (!g) return;
    var r = this.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var x = Math.floor(((e.clientX - r.left) * dpr - g.ox) / g.tile);
    var y = Math.floor(((e.clientY - r.top) * dpr - g.oy) / g.tile);
    var L = board.level;
    $('#osdXY').textContent =
      (x >= 0 && y >= 0 && x < L.w && y < L.h) ? x + ', ' + y : '';
  });
  $('#board').addEventListener('mouseleave', function () { $('#osdXY').textContent = ''; });
  $('#manual').addEventListener('click', function () { SFX.clunk(); });

  /* ================= scenes ======================================= */
  function clearPaper() {
    Object.keys(docs).forEach(function (k) { docs[k].remove(); delete docs[k]; });
  }
  function reset() {
    playing = false; cancelAnimationFrame(raf);
    tickAt = 0; logIdx = 0;
    board.setTick(0); board.reveal = 1;
    setMode('write');
    lamps(1, 0, 0);
    $('#dspSub').textContent = 'program not yet sent';
    $('#execLine').hidden = true;
    $('#feedTick').hidden = true;
    $('#feedStamp').hidden = false;
    $('#tickRead').textContent = '0000';
    $('#problems').textContent = 'no problems';
    $('#problems').parentNode.classList.remove('err');
    logClear('idle');
    logLine('', 'Nothing on the wire. print() writes here, stamped', '');
    logLine('', 'with the tick it happened on.', '');
    paintRail(null);
    board.draw();
  }

  var ASIDE = [214, 214, -3.4];   /* where a document lives once it is read */
  var READ = [56, 92, -1.4];      /* where a document lands off the slot */

  function aside() { place(workOrder(), ASIDE[0], ASIDE[1], ASIDE[2]); }

  var SCENES = {
    rest: function () { clearPaper(); reset(); place(workOrder(), READ[0], READ[1], READ[2]); },
    order: function () { clearPaper(); reset(); arrive(workOrder(), READ[0], READ[1], READ[2], 260); },
    write: function () {
      clearPaper(); reset(); aside();
      code.focus();
      code.setSelectionRange(code.value.length - 2, code.value.length - 2);
      code.scrollTop = 0; mirror.scrollTop = 0;
    },
    run: function () {
      clearPaper(); reset(); aside();
      setTimeout(function () { dispatchRun(false); }, 260);
    },
    halt: function () {
      clearPaper(); reset(); aside();
      setTimeout(function () { dispatchRun(true); }, 200);
    },
    result: function () {
      clearPaper(); reset(); aside();
      setMode('watch');
      tickAt = runLen; board.setTick(runLen); paintTick(); board.draw();
      $('#feedTick').hidden = false; $('#feedStamp').hidden = true;
      finishStatic();
      arrive(closureCert(), 132, 46, 1.6, 200);
    },
    req: function () { clearPaper(); reset(); aside(); arrive(requisition(), 128, 30, 1.2, 180); },
    review: function () { clearPaper(); reset(); aside(); arrive(review(), 140, 10, -1.4, 180); },
    binder: function () { clearPaper(); reset(); openBinder(); }
  };

  function finishStatic() {
    $('#tickMax').textContent = '0096';
    LEVELS.field.targets[3][1] = '5 / 5';
    logClear('closed · 5 of 5 seeds');
    LOG_RUN.forEach(function (l) { logLine(l[0], l[1]); });
    logLine('0096', 'work order closed', 'o');
    $('#problems').textContent = 'closed on every seed';
    setState('CLOSED');
    paintRail({ done: 1, count: 9, ticks: 96, bonus: true });
    lamps(0, 0, 1);
    $('#dspSub').textContent = 'trace returned';
  }

  Array.prototype.forEach.call(document.querySelectorAll('.director button'), function (b) {
    b.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.director button'), function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      SCENES[b.dataset.scene]();
    });
  });
  $('#bigBoard').addEventListener('change', function () {
    level = this.checked ? 'shaft' : 'field';
    board.setLevel(this.checked ? 'shaft' : 'field');
    runLen = board.level.endTick;
    reset();
  });
  $('#noLamp').addEventListener('change', function () { document.body.classList.toggle('flat', this.checked); });
  $('#hideDirector').addEventListener('change', function () { document.body.classList.toggle('nodirector', this.checked); });

  (function keyboard() {
    var rows = [
      '  w  w                        ',
      '   w                     hot  ',
      'w      w                w     '
    ];
    Array.prototype.forEach.call(document.querySelectorAll('.kb-row'), function (r, i) {
      var counts = [15, 14, 13][i];
      for (var k = 0; k < counts; k++) {
        var key = el('i');
        if (i === 0 && (k === 0 || k === counts - 1)) key.className = 'w';
        if (i === 1 && k === counts - 1) key.className = 'w hot';   /* the Return key */
        if (i === 2 && (k === 0 || k === counts - 1)) key.className = 'w';
        r.appendChild(key);
      }
    });
  })();

  (function trayEdges() {
    var items = $('#trayItems');
    [[66, -1.1], [74, .6], [82, -.4]].forEach(function (e) {
      var n = el('div', 'edge');
      n.style.top = 'calc(' + e[0] + ' * var(--u))';
      n.style.transform = 'rotate(' + e[1] + 'deg)';
      items.appendChild(n);
    });
  })();

  /* ================= boot ========================================= */
  /* URL parameters exist so a still can be captured deterministically:
     ?scene=run&still=1&nochrome=1&freeze=180&stamp=gold&big=1            */
  var P = new URLSearchParams(location.search);
  var still = P.has('still');

  fit();
  code.value = PROGRAM;
  renderCode();

  if (P.has('big')) {
    level = 'shaft';
    board.setLevel('shaft');
    $('#bigBoard').checked = true;
  }
  runLen = board.level.endTick;
  reset();

  if (P.has('nochrome')) document.body.classList.add('nodirector');
  if (P.has('flat')) document.body.classList.add('flat');

  if (P.has('size')) {
    var want = SIZES.indexOf(parseFloat(P.get('size')));
    if (want >= 0) sizeIdx = want;
  }
  applySize();
  if (P.get('art')) art = P.get('art');
  applyArt();

  var scene = P.get('scene');
  if (scene && SCENES[scene]) SCENES[scene](); else SCENES.rest();

  if (P.get('pin')) setTimeout(function () { pin(P.get('pin')); }, 520);
  if (P.get('up')) setTimeout(function () {
    var d = docs[P.get('up')];
    if (d) pickUp(d);
  }, 620);

  /* hold an animation at a chosen millisecond so motion can be photographed */
  var freezeAt = P.has('freeze') ? (+P.get('freeze') || 0) : null;
  function applyFreeze() {
    if (freezeAt === null) return;
    Array.prototype.forEach.call(document.querySelectorAll('.doc, .inked, .bo-sheet'), function (n) {
      n.style.animationDelay = '-' + freezeAt + 'ms';
      n.style.animationPlayState = 'paused';
    });
  }
  if (freezeAt !== null) setTimeout(applyFreeze, 30);

  /* park the trace on a chosen tick so a run can be photographed mid-flight */
  if (P.has('tick')) {
    setTimeout(function () {
      playing = false; cancelAnimationFrame(raf);
      tickAt = +P.get('tick');
      board.reveal = 1;
      board.setTick(tickAt); paintTick(); board.draw();
    }, 900);
  }

  /* pre-strike: the stamp is in hand, over the box, not yet down */
  if (P.get('stamping')) {
    setTimeout(function () {
      var box = document.querySelector('[data-stampbox]');
      if (!box) return;
      var r = box.getBoundingClientRect();
      $('#heldDie').textContent = P.get('stamping').toUpperCase();
      $('#held').hidden = false;
      $('#held').style.left = (r.left + r.width / 2) + 'px';
      $('#held').style.top = (r.top + r.height / 2 + 6) + 'px';
      document.body.classList.add('stamping');
    }, 700);
  }
  /* struck: the stamp has landed and the certificate carries the grade */
  if (P.get('stamp')) {
    setTimeout(function () {
      var box = document.querySelector('[data-stampbox]');
      if (!box) return;
      var k = P.get('stamp');
      var s = STAMPS.filter(function (x) { return x.k === k; })[0] || STAMPS[0];
      box.classList.add('filled');
      var ink = el('div', 'inked ' + s.k, s.d + '<small>' + s.sub + '</small>');
      ink.style.setProperty('--sr', '-7.4deg');
      box.appendChild(ink);
      if (freezeAt === null) { ink.style.animation = 'none'; ink.style.opacity = '.88'; }
      else applyFreeze();
      var f = box.closest('.doc').querySelector('.foot');
      if (f) f.innerHTML = 'Entered on the record. <span style="color:var(--p-ink)">Filed. Forwarded to somebody who will not read it.</span>';
    }, 760);
  }

  requestAnimationFrame(function () { fit(); board.draw(); });

  /* a slow idle so the station is never a still image */
  if (!still) setInterval(function () { if (!playing) board.draw(); }, 90);
  else setTimeout(function () { board.draw(); document.title = 'READY · ' + document.title; }, 1400);
})();
