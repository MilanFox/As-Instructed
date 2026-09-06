/* ------------------------------------------------------------------
   board.js — a standalone approximation of the DEEP SITE direction.
   Ordered 4x4 Bayer dither, one fixed key light from the north-west,
   materials told apart by texture with colour removed, floor luminance
   held inside a narrow band so the grid and the trail stay on top.
   No dependencies. Draws at device resolution.
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ];

  function hash(x, y, s) {
    var h = (x * 374761393 + y * 668265263 + (s || 0) * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function mix(a, b, t) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t)
    ];
  }
  function rgb(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }

  /* ---------------- materials -------------------------------------- */
  /* Four-step ramps. Floors live in a 0.082-0.103 luminance band so the
     grid (which moves a tile ~0.05) and the trail (~0.025) stay legible. */
  var MAT = {
    soil:    { base: [ 92,  74,  55], hi: [112,  92,  68], lo: [ 74,  59,  43], grain: 0.55 },
    regolith:{ base: [ 88,  80,  70], hi: [110, 100,  87], lo: [ 68,  62,  55], grain: 0.75 },
    floor:   { base: [ 84,  82,  77], hi: [104, 101,  95], lo: [ 66,  65,  61], grain: 0.35 },
    rock:    { base: [ 41,  39,  41], hi: [104,  98,  95], lo: [ 17,  16,  18], grain: 0.85 },
    wall:    { base: [ 40,  38,  37], hi: [108, 102,  95], lo: [ 17,  16,  16], grain: 0.45 },
    ore:     { base: [ 52,  46,  42], hi: [172, 128,  64], lo: [ 24,  22,  21], grain: 1.0 },
    ice:     { base: [ 84,  97, 109], hi: [162, 184, 200], lo: [ 48,  57,  66], grain: 0.3 },
    depot:   { base: [ 80,  76,  68], hi: [136, 124,  96], lo: [ 38,  36,  34], grain: 0.4 },
    pad:     { base: [ 90,  86,  72], hi: [140, 130,  96], lo: [ 46,  44,  38], grain: 0.3 },
    voidT:   { base: [ 16,  18,  21], hi: [ 24,  26,  30], lo: [ 10,  11,  13], grain: 0.2 }
  };

  var SOLID = { rock: 1, wall: 1, ore: 1 };

  /* SIGNAL — one amber phosphor at varying intensity. Kept as a selectable
     direction because monochrome-plus-shape is a real high-contrast mode,
     not a leftover. Every read that Deep Site carries in hue is carried
     here by shape instead. */
  var MAT_DEEPSITE = MAT;
  var MAT_SIGNAL = (function () {
    var out = {};
    var AMB = [255, 176, 48];
    for (var k in MAT) {
      var m = MAT[k];
      out[k] = {
        base: lum(m.base), hi: lum(m.hi), lo: lum(m.lo), grain: m.grain
      };
    }
    function lum(c) {
      var l = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
      l = Math.pow(l, 0.86);
      return [Math.round(AMB[0] * l), Math.round(AMB[1] * l), Math.round(AMB[2] * l)];
    }
    return out;
  })();

  /* ---------------- levels ----------------------------------------- */

  function fieldLevel() {
    // w2-05 Harvest Quota. 14 x 8 with a wall border; a 12 x 6 west field.
    var W = 14, H = 8, t = [], g = [], c = [];
    for (var y = 0; y < H; y++) {
      t[y] = []; g[y] = []; c[y] = [];
      for (var x = 0; x < W; x++) {
        var edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
        t[y][x] = edge ? 'wall' : 'soil';
        g[y][x] = 0; c[y][x] = null;
      }
    }
    t[6][12] = 'depot';
    // two things grow here and only one counts
    var plan = [
      [2, 1, 'crop', 8], [4, 1, 'crop', 3], [6, 1, 'ice', 8], [8, 1, 'crop', 8], [10, 1, 'crop', 6],
      [1, 2, 'crop', 5], [3, 2, 'ice', 8], [5, 2, 'crop', 8], [7, 2, 'crop', 1], [9, 2, 'crop', 8], [11, 2, 'ice', 4],
      [2, 3, 'crop', 8], [4, 3, 'crop', 8], [6, 3, 'crop', 2], [8, 3, 'ice', 8], [10, 3, 'crop', 7],
      [1, 4, 'ice', 6], [3, 4, 'crop', 6], [5, 4, 'crop', 8], [7, 4, 'crop', 8], [9, 4, 'crop', 4], [11, 4, 'crop', 8],
      [2, 5, 'crop', 8], [4, 5, 'ice', 8], [6, 5, 'crop', 8], [8, 5, 'crop', 5], [10, 5, 'crop', 8],
      [1, 6, 'crop', 3], [3, 6, 'crop', 8], [5, 6, 'ice', 2], [7, 6, 'crop', 8], [9, 6, 'crop', 8]
    ];
    for (var i = 0; i < plan.length; i++) {
      var p = plan[i];
      c[p[1]][p[0]] = p[2];
      g[p[1]][p[0]] = p[3];
    }
    var path = [];
    var route = [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [5, 2], [5, 3], [4, 3], [3, 3], [2, 3],
      [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [7, 3], [7, 2], [8, 2], [9, 2],
      [9, 3], [10, 3], [11, 3], [11, 4], [10, 4], [10, 5], [9, 5], [8, 5], [7, 5], [7, 6],
      [8, 6], [9, 6], [10, 6], [11, 6], [12, 6]];
    for (var r = 0; r < route.length; r++) path.push({ x: route[r][0], y: route[r][1] });
    return {
      id: 'w2-05', name: 'Harvest Quota', osd: 'WEST FIELD · GRID 14×14',
      w: W, h: H, terrain: t, growth: g, crop: c, maxGrowth: 8,
      bots: [{ name: 'FIELD-02', path: path, hue: 'cyan' }],
      pads: [[12, 6]], endTick: route.length - 1
    };
  }

  function shaftLevel() {
    // w4-05 The Deep Shaft. 40 x 40. The legibility floor lives here.
    var W = 40, H = 40, t = [], g = [], c = [], y, x;
    for (y = 0; y < H; y++) {
      t[y] = []; g[y] = []; c[y] = [];
      for (x = 0; x < W; x++) { t[y][x] = 'rock'; g[y][x] = 0; c[y][x] = null; }
    }
    // recursive-backtracker maze on odd cells, deterministic
    var seed = 20250906;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    var stack = [[1, 1]];
    t[1][1] = 'floor';
    while (stack.length) {
      var cur = stack[stack.length - 1];
      var dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]];
      for (var i = dirs.length - 1; i > 0; i--) {
        var j = Math.floor(rnd() * (i + 1)), tmp = dirs[i]; dirs[i] = dirs[j]; dirs[j] = tmp;
      }
      var moved = false;
      for (var d = 0; d < 4; d++) {
        var nx = cur[0] + dirs[d][0], ny = cur[1] + dirs[d][1];
        if (nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && t[ny][nx] === 'rock') {
          t[ny][nx] = 'floor';
          t[cur[1] + dirs[d][1] / 2][cur[0] + dirs[d][0] / 2] = 'floor';
          stack.push([nx, ny]); moved = true; break;
        }
      }
      if (!moved) stack.pop();
    }
    // ore seams and a few chambers so it is not uniformly maze
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
      if (t[y][x] === 'rock' && hash(x, y, 7) > 0.955) t[y][x] = 'ore';
    }
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) t[y][x] = 'wall';
    }
    t[38][1] = 'depot';
    t[1][38] = 'pad';
    var path = [], px = 1, py = 1;
    // a walked route through the maze, breadth-first to the pad
    var prev = {}, q = [[1, 1]], seen = {};
    seen['1,1'] = 1;
    while (q.length) {
      var n = q.shift();
      if (n[0] === 38 && n[1] === 1) break;
      var nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var k = 0; k < 4; k++) {
        var ax = n[0] + nb[k][0], ay = n[1] + nb[k][1];
        if (ax < 0 || ay < 0 || ax >= W || ay >= H) continue;
        if (SOLID[t[ay][ax]]) continue;
        var key = ax + ',' + ay;
        if (seen[key]) continue;
        seen[key] = 1; prev[key] = n; q.push([ax, ay]);
      }
    }
    var cursor = [38, 1], chain = [];
    while (cursor) { chain.unshift({ x: cursor[0], y: cursor[1] }); cursor = prev[cursor[0] + ',' + cursor[1]]; }
    path = chain;
    return {
      id: 'w4-05', name: 'The Deep Shaft', osd: 'DEEP SHAFT · GRID 40×40',
      w: W, h: H, terrain: t, growth: g, crop: c, maxGrowth: 8,
      bots: [{ name: 'RIG-01', path: path, hue: 'cyan' }],
      pads: [[38, 1]], endTick: path.length - 1
    };
  }

  /* ---------------- painting --------------------------------------- */

  function paintTile(ctx, m, x, y, px, py, tile, mat) {
    /* m carries the device-pixel dither cell for this frame */
    var steps = 4;
    var n = hash(x, y, 3);
    var lvl = Math.floor(n * steps);
    var col = mix(mat.lo, mat.hi, (lvl + 0.5) / steps * mat.grain + (1 - mat.grain) * 0.5);
    ctx.fillStyle = rgb(mix(mat.base, col, 0.34));
    ctx.fillRect(px, py, tile, tile);

    // Ordered 4x4 Bayer dither, cell pinned to DEVICE PIXELS rather than to a
    // fraction of the tile — so the material looks the same at 24px and at 96px
    // instead of turning into a checkerboard when you zoom in.
    var cell = m.cell;
    var alt = mix(mat.base, mat.hi, 0.34 * mat.grain);
    var alt2 = mix(mat.base, mat.lo, 0.5 * mat.grain);
    var cols = Math.ceil(tile / cell), rows = cols;
    var thr = 4 + Math.floor(hash(x, y, 11) * 9);
    for (var iy = 0; iy < rows; iy++) {
      for (var ix = 0; ix < cols; ix++) {
        var b = BAYER[iy & 3][ix & 3];
        var jitter = hash(x * 41 + ix, y * 41 + iy, 5) * 5;
        var v = b + jitter;
        if (v > thr + 6) continue;
        ctx.fillStyle = v < thr - 3 ? rgb(alt) : rgb(alt2);
        ctx.fillRect(px + ix * cell, py + iy * cell,
                     Math.min(cell, px + tile - (px + ix * cell)),
                     Math.min(cell, py + tile - (py + iy * cell)));
      }
    }
  }

  /* docs/LIGHT.md: key #dbe8f0 at north .46 / west .30, east black .32,
     south is the material's DARK tone multiplied 0.62 then 0.34. An arris
     is a hard rule, never a band. */
  function paintSolidFace(ctx, px, py, tile, mat, nbr) {
    var n = Math.max(1, Math.round(tile * 0.07));
    var w = Math.max(1, Math.round(tile * 0.055));
    if (!nbr.n) { ctx.fillStyle = 'rgba(219,232,240,.46)'; ctx.fillRect(px, py, tile, n); }
    if (!nbr.w) { ctx.fillStyle = 'rgba(219,232,240,.30)'; ctx.fillRect(px, py, w, tile); }
    if (!nbr.e) { ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.fillRect(px + tile - n, py, n, tile); }
    if (!nbr.s) {
      var d = mat.lo;
      var h = Math.max(1, Math.round(tile * 0.085));
      ctx.fillStyle = rgb([Math.round(d[0]*.62), Math.round(d[1]*.62), Math.round(d[2]*.62)]);
      ctx.fillRect(px, py + tile - h * 2, tile, h);
      ctx.fillStyle = rgb([Math.round(d[0]*.34), Math.round(d[1]*.34), Math.round(d[2]*.34)]);
      ctx.fillRect(px, py + tile - h, tile, h);
    }
  }

  function paintCrop(ctx, px, py, tile, kind, growth, maxG) {
    // Ripeness must be tellable by SHAPE at 24 device px, not by colour.
    var cx = px + tile / 2, cy = py + tile / 2;
    var t = growth / maxG;
    var stage = t >= 1 ? 2 : (t >= 0.5 ? 1 : 0);
    var ice = kind === 'ice';
    var stem = ice ? '#7f96a4' : '#6f8a4a';
    var head = ice ? '#b9d2de' : '#cbd66a';
    var ripe = ice ? '#cfe4ee' : '#f2d24e';
    var u = tile / 24;

    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));

    if (ice) {
      // ice-scrub: a splayed three-prong. Never a round head. Worth nothing.
      ctx.strokeStyle = stem;
      ctx.lineWidth = Math.max(1, 1.6 * u);
      ctx.beginPath();
      ctx.moveTo(0, 7 * u); ctx.lineTo(0, -2 * u);
      ctx.moveTo(0, 0); ctx.lineTo(-5 * u, -6 * u);
      ctx.moveTo(0, 0); ctx.lineTo(5 * u, -6 * u);
      ctx.stroke();
      ctx.fillStyle = head;
      ctx.fillRect(Math.round(-5.5 * u), Math.round(-7.5 * u), Math.max(1, 2 * u), Math.max(1, 2 * u));
      ctx.fillRect(Math.round(3.5 * u), Math.round(-7.5 * u), Math.max(1, 2 * u), Math.max(1, 2 * u));
      ctx.fillRect(Math.round(-1 * u), Math.round(-4 * u), Math.max(1, 2 * u), Math.max(1, 2 * u));
      ctx.restore();
      return;
    }

    // crop: stem always; leaves at half; a filled round head only when ripe
    ctx.strokeStyle = stem;
    ctx.lineWidth = Math.max(1, 1.8 * u);
    ctx.beginPath();
    ctx.moveTo(0, 8 * u); ctx.lineTo(0, stage === 0 ? 2 * u : -2 * u);
    ctx.stroke();

    if (stage >= 1) {
      ctx.beginPath();
      ctx.moveTo(0, 2 * u); ctx.lineTo(-5 * u, -1 * u);
      ctx.moveTo(0, 2 * u); ctx.lineTo(5 * u, -1 * u);
      ctx.stroke();
    }

    if (stage === 2) {
      // the ripe read: a solid disc with a lit NW quarter. Reads at 3 device px.
      var r = 6 * u;
      ctx.fillStyle = ripe;
      ctx.beginPath(); ctx.arc(0, -4 * u, r, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#fff0a8';
      ctx.beginPath(); ctx.arc(-1.4 * u, -5.4 * u, r * 0.42, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = 'rgba(20,16,6,.55)';
      ctx.lineWidth = Math.max(1, u);
      ctx.beginPath(); ctx.arc(0, -4 * u, r, 0, 6.2832); ctx.stroke();
    } else {
      ctx.fillStyle = head;
      var s = Math.max(1, 2.4 * u);
      ctx.fillRect(Math.round(-s / 2), Math.round((stage === 0 ? 1 : -3) * u), s, s);
    }
    ctx.restore();
  }

  function paintBot(ctx, px, py, tile, facing, phase) {
    var u = tile / 24;
    var cx = px + tile / 2, cy = py + tile / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(facing * Math.PI / 2);

    // headlight cone, cast forward
    var grd = ctx.createLinearGradient(0, 0, 0, -tile * 1.6);
    grd.addColorStop(0, 'rgba(120,240,220,.20)');
    grd.addColorStop(1, 'rgba(120,240,220,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(0, -6 * u);
    ctx.lineTo(-tile * 0.62, -tile * 1.5);
    ctx.lineTo(tile * 0.62, -tile * 1.5);
    ctx.closePath(); ctx.fill();

    // cast shadow, equal on both axes, because the lamp is due north-west
    ctx.fillStyle = 'rgba(0,0,0,.34)';
    ctx.fillRect(-7 * u + 2.8 * u, -7 * u + 2.8 * u, 14 * u, 14 * u);

    // chassis
    ctx.fillStyle = '#20262c';
    ctx.fillRect(-7 * u, -7 * u, 14 * u, 14 * u);
    ctx.fillStyle = 'rgba(219,232,240,.46)';
    ctx.fillRect(-7 * u, -7 * u, 14 * u, Math.max(1, 1.4 * u));
    ctx.fillStyle = 'rgba(219,232,240,.30)';
    ctx.fillRect(-7 * u, -7 * u, Math.max(1, 1.2 * u), 14 * u);
    ctx.fillStyle = 'rgba(0,0,0,.32)';
    ctx.fillRect(5.8 * u, -7 * u, Math.max(1, 1.2 * u), 14 * u);
    ctx.fillStyle = '#0d1114';
    ctx.fillRect(-7 * u, 5.4 * u, 14 * u, Math.max(1, 1.6 * u));

    // treads
    ctx.fillStyle = '#1a1f24';
    ctx.fillRect(-9 * u, -6 * u, 2 * u, 12 * u);
    ctx.fillRect(7 * u, -6 * u, 2 * u, 12 * u);

    // lamp
    ctx.fillStyle = '#35e0c8';
    ctx.fillRect(-2.5 * u, -7.5 * u, 5 * u, 2.5 * u);
    ctx.fillStyle = 'rgba(53,224,200,.35)';
    ctx.fillRect(-4 * u, -8.5 * u, 8 * u, 1.5 * u);

    // antenna, bobbing
    var bob = Math.sin(phase * 0.11) * 1.6 * u;
    ctx.strokeStyle = '#5b6a74';
    ctx.lineWidth = Math.max(1, u);
    ctx.beginPath(); ctx.moveTo(4 * u, -6 * u); ctx.lineTo(5.5 * u, -12 * u + bob); ctx.stroke();
    ctx.fillStyle = '#ffb020';
    ctx.fillRect(4.8 * u, -13.2 * u + bob, Math.max(1, 1.8 * u), Math.max(1, 1.8 * u));
    ctx.restore();
  }

  /* ---------------- the board -------------------------------------- */

  function Board(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.level = fieldLevel();
    this.tick = 0;
    this.playing = false;
    this.trail = {};
    this.dead = false;
    this.dpr = global.devicePixelRatio || 1;
    this.tilePx = 0;
    this.reveal = 1;
  }

  Board.prototype.setArt = function (id) {
    this.art = id;
    MAT = id === 'signal' ? MAT_SIGNAL : MAT_DEEPSITE;
    this.draw();
  };

  Board.prototype.setLevel = function (id) {
    this.level = id === 'shaft' ? shaftLevel() : fieldLevel();
    this.tick = 0;
    this.trail = {};
    this.draw();
  };

  Board.prototype.botAt = function (t) {
    var p = this.level.bots[0].path;
    var i = Math.max(0, Math.min(p.length - 1, Math.floor(t)));
    var j = Math.min(p.length - 1, i + 1);
    var f = t - i;
    var facing = 0;
    var dx = p[j].x - p[i].x, dy = p[j].y - p[i].y;
    if (dx > 0) facing = 1; else if (dx < 0) facing = 3;
    else if (dy > 0) facing = 2; else facing = 0;
    if (i === j && i > 0) {
      dx = p[i].x - p[i - 1].x; dy = p[i].y - p[i - 1].y;
      if (dx > 0) facing = 1; else if (dx < 0) facing = 3; else if (dy > 0) facing = 2; else facing = 0;
    }
    return { x: p[i].x + (p[j].x - p[i].x) * f, y: p[i].y + (p[j].y - p[i].y) * f, facing: facing };
  };

  Board.prototype.setTick = function (t) {
    this.tick = t;
    var p = this.level.bots[0].path;
    this.trail = {};
    for (var i = 0; i <= Math.min(p.length - 1, Math.floor(t)); i++) {
      var k = p[i].x + ',' + p[i].y;
      this.trail[k] = (this.trail[k] || 0) + 1;
    }
  };

  Board.prototype.resize = function () {
    var r = this.canvas.getBoundingClientRect();
    if (!r.width) return false;
    var dpr = global.devicePixelRatio || 1;
    var w = Math.max(1, Math.round(r.width * dpr));
    var h = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.dpr = dpr;
    return true;
  };

  Board.prototype.draw = function () {
    if (!this.resize()) return;
    var ctx = this.ctx, L = this.level;
    var W = this.canvas.width, H = this.canvas.height;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0e1114';
    ctx.fillRect(0, 0, W, H);

    var pad = Math.round(6 * this.dpr);
    var tile = Math.floor(Math.min((W - pad * 2) / L.w, (H - pad * 2) / L.h));
    if (tile < 1) tile = 1;
    this.tilePx = tile;
    var ox = Math.round((W - tile * L.w) / 2);
    var oy = Math.round((H - tile * L.h) / 2);
    var cellPx = Math.max(2, Math.round(2 * this.dpr));

    var x, y, px, py, tt;
    for (y = 0; y < L.h; y++) {
      for (x = 0; x < L.w; x++) {
        tt = L.terrain[y][x];
        px = ox + x * tile; py = oy + y * tile;
        paintTile(ctx, { cell: cellPx }, x, y, px, py, tile, MAT[tt] || MAT.floor);
      }
    }

    // ambient occlusion where a floor meets a solid, then the lit faces
    for (y = 0; y < L.h; y++) {
      for (x = 0; x < L.w; x++) {
        tt = L.terrain[y][x];
        px = ox + x * tile; py = oy + y * tile;
        if (SOLID[tt]) {
          paintSolidFace(ctx, px, py, tile, MAT[tt], {
            n: y > 0 && SOLID[L.terrain[y - 1][x]],
            s: y < L.h - 1 && SOLID[L.terrain[y + 1][x]],
            w: x > 0 && SOLID[L.terrain[y][x - 1]],
            e: x < L.w - 1 && SOLID[L.terrain[y][x + 1]]
          });
          // cast shadow to the south-east
          // SHADOW_REACH 0.28 of a tile, equal on both axes, flat alpha
          var s = Math.max(1, Math.round(tile * 0.28));
          var c = Math.max(1, Math.round(tile * 0.09));
          ctx.fillStyle = 'rgba(4,9,15,.32)';
          if (y < L.h - 1 && !SOLID[L.terrain[y + 1][x]]) ctx.fillRect(px + s, py + tile, tile, s);
          if (x < L.w - 1 && !SOLID[L.terrain[y][x + 1]]) ctx.fillRect(px + tile, py + s, s, tile);
          ctx.fillStyle = 'rgba(4,9,15,.28)';
          if (y < L.h - 1 && !SOLID[L.terrain[y + 1][x]]) ctx.fillRect(px, py + tile, tile, c);
          ctx.fillStyle = 'rgba(4,9,15,.20)';
          if (x < L.w - 1 && !SOLID[L.terrain[y][x + 1]]) ctx.fillRect(px + tile, py, c, tile);
        }
      }
    }

    // the trail: how often, not merely whether
    for (var key in this.trail) {
      var parts = key.split(','), tx = +parts[0], ty = +parts[1];
      var n = Math.min(4, this.trail[key]);
      ctx.fillStyle = 'rgba(88,232,214,' + (0.055 + n * 0.030) + ')';
      ctx.fillRect(ox + tx * tile, oy + ty * tile, tile, tile);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.020 + n * 0.014) + ')';
      ctx.fillRect(ox + tx * tile, oy + ty * tile, tile, tile);
    }

    // grid — 1.5 device px, never a half pixel
    if (tile >= 8) {
      ctx.strokeStyle = 'rgba(220,236,246,.20)';
      ctx.lineWidth = Math.max(1, Math.round(this.dpr));
      ctx.beginPath();
      for (x = 0; x <= L.w; x++) { ctx.moveTo(ox + x * tile + 0.5, oy); ctx.lineTo(ox + x * tile + 0.5, oy + tile * L.h); }
      for (y = 0; y <= L.h; y++) { ctx.moveTo(ox, oy + y * tile + 0.5); ctx.lineTo(ox + tile * L.w, oy + y * tile + 0.5); }
      ctx.stroke();
    }

    // depots and pads
    for (y = 0; y < L.h; y++) for (x = 0; x < L.w; x++) {
      tt = L.terrain[y][x];
      px = ox + x * tile; py = oy + y * tile;
      if (tt === 'depot') {
        ctx.fillStyle = '#3a3630'; ctx.fillRect(px + tile * .18, py + tile * .18, tile * .64, tile * .64);
        ctx.fillStyle = '#ffb020'; ctx.fillRect(px + tile * .3, py + tile * .3, tile * .4, tile * .12);
        ctx.fillStyle = '#8a6a20'; ctx.fillRect(px + tile * .3, py + tile * .52, tile * .4, tile * .1);
      }
    }

    // goal brackets — the objective, drawn on the board
    ctx.strokeStyle = '#ffb020';
    ctx.lineWidth = Math.max(1, Math.round(this.dpr * 1.4));
    for (var pi = 0; pi < L.pads.length; pi++) {
      var gx = ox + L.pads[pi][0] * tile, gy = oy + L.pads[pi][1] * tile;
      var a = Math.max(3, tile * 0.3);
      ctx.beginPath();
      ctx.moveTo(gx + 1, gy + a); ctx.lineTo(gx + 1, gy + 1); ctx.lineTo(gx + a, gy + 1);
      ctx.moveTo(gx + tile - a, gy + 1); ctx.lineTo(gx + tile - 1, gy + 1); ctx.lineTo(gx + tile - 1, gy + a);
      ctx.moveTo(gx + 1, gy + tile - a); ctx.lineTo(gx + 1, gy + tile - 1); ctx.lineTo(gx + a, gy + tile - 1);
      ctx.moveTo(gx + tile - a, gy + tile - 1); ctx.lineTo(gx + tile - 1, gy + tile - 1); ctx.lineTo(gx + tile - 1, gy + tile - a);
      ctx.stroke();
    }

    // crops
    for (y = 0; y < L.h; y++) for (x = 0; x < L.w; x++) {
      if (!L.crop[y][x]) continue;
      paintCrop(ctx, ox + x * tile, oy + y * tile, tile, L.crop[y][x], L.growth[y][x], L.maxGrowth);
    }

    // ore glints on solid ore so a seam reads at distance
    for (y = 0; y < L.h; y++) for (x = 0; x < L.w; x++) {
      if (L.terrain[y][x] !== 'ore') continue;
      px = ox + x * tile; py = oy + y * tile;
      ctx.fillStyle = '#c8823a';
      var q = Math.max(1, Math.round(tile * 0.16));
      ctx.fillRect(px + tile * .28, py + tile * .34, q, q);
      ctx.fillRect(px + tile * .56, py + tile * .56, q, q);
      ctx.fillStyle = '#f0b060';
      ctx.fillRect(px + tile * .28, py + tile * .34, Math.max(1, q / 2), Math.max(1, q / 2));
    }

    // the bot
    if (!this.dead) {
      var b = this.botAt(this.tick);
      paintBot(ctx, ox + b.x * tile, oy + b.y * tile, tile, b.facing, this.tick * 8 + Date.now() / 90);
    }

    // --- the graticule. Screen space, in the bezel margin, never on a tile.
    var gm = Math.max(8, Math.round(9 * this.dpr));
    ctx.fillStyle = 'rgba(150,178,186,.55)';
    ctx.font = Math.round(8 * this.dpr) + 'px ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'middle';
    for (x = 0; x <= L.w; x++) {
      var tx2 = ox + x * tile;
      var major = x % 5 === 0;
      ctx.fillRect(tx2, oy - (major ? gm * 0.62 : gm * 0.3), Math.max(1, this.dpr), major ? gm * 0.62 : gm * 0.3);
      if (major && x < L.w && tile > 14 * this.dpr) {
        ctx.textAlign = 'left';
        ctx.fillText(String(x), tx2 + 2 * this.dpr, oy - gm);
      }
    }
    for (y = 0; y <= L.h; y++) {
      var ty2 = oy + y * tile;
      var maj = y % 5 === 0;
      ctx.fillRect(ox - (maj ? gm * 0.62 : gm * 0.3), ty2, maj ? gm * 0.62 : gm * 0.3, Math.max(1, this.dpr));
      if (maj && y < L.h && tile > 14 * this.dpr) {
        ctx.textAlign = 'right';
        ctx.fillText(String(y), ox - gm, ty2 + tile * 0.5);
      }
    }
    // origin mark, north-west, because that is also where the lamp is
    ctx.fillStyle = 'rgba(150,178,186,.8)';
    ctx.fillRect(ox - gm, oy - gm, gm * 0.7, Math.max(1, this.dpr));
    ctx.fillRect(ox - gm, oy - gm, Math.max(1, this.dpr), gm * 0.7);

    this.geom = { ox: ox, oy: oy, tile: tile };

    // reveal wipe — the feed catching up, capped and skippable
    if (this.reveal < 1) {
      ctx.fillStyle = '#07090b';
      ctx.fillRect(0, H * this.reveal, W, H);
      ctx.fillStyle = 'rgba(53,224,200,.35)';
      ctx.fillRect(0, H * this.reveal, W, Math.max(1, this.dpr));
    }
  };

  global.Board = Board;
})(window);
