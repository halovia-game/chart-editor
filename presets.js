/* ============================================================
   presets.js - 轨道路径预设定义 + 轨道求值 (v4R keyframe 模型)
   依赖：state.js
   ============================================================ */

"use strict";

// ============================================================
// === PRESET DEFINITIONS ===
// 预设函数签名：fn(localP, fromKF, toKF, P)
//   localP = 段内归一化进度 [0,1]
//   fromKF = 起始 keyframe {x,y}（插值类预设使用）
//   toKF   = 结束 keyframe {x,y}（插值类预设使用）
//   P      = 预设的自定义参数字典（椭圆/Lissajous/自定义使用）
// ============================================================

var PRESETS = {
  hidden: {
    name: "不显示",
    params: [],
    hidden: true
  },
  static: {
    name: "静止",
    params: [],
    fn: function(p, f, t, P) { return { x: f.x, y: f.y }; }
  },
  line: {
    name: "直线",
    params: [],
    fn: function(p, f, t, P) { return { x: f.x + (t.x - f.x) * p, y: f.y + (t.y - f.y) * p }; }
  },
  "line-easein": {
    name: "直线-缓入",
    params: ["k"],
    fn: function(p, f, t, P) { var k = Math.max(0.1, (P.k !== undefined ? P.k : 2)); var ep = Math.pow(p, k); return { x: f.x + (t.x - f.x) * ep, y: f.y + (t.y - f.y) * ep }; }
  },
  "line-easeout": {
    name: "直线-缓出",
    params: ["k"],
    fn: function(p, f, t, P) { var k = Math.max(0.1, (P.k !== undefined ? P.k : 2)); var ep = 1 - Math.pow(1 - p, k); return { x: f.x + (t.x - f.x) * ep, y: f.y + (t.y - f.y) * ep }; }
  },
  "line-easeinout": {
    name: "直线-缓入出",
    params: ["k"],
    fn: function(p, f, t, P) { var k = Math.max(0.1, (P.k !== undefined ? P.k : 2)); var ep = p < 0.5 ? 0.5 * Math.pow(2 * p, k) : 1 - 0.5 * Math.pow(2 * (1 - p), k); return { x: f.x + (t.x - f.x) * ep, y: f.y + (t.y - f.y) * ep }; }
  },
  bezier: {
    name: "贝塞尔曲线",
    params: ["bzX1", "bzY1", "bzX2", "bzY2"],
    fn: function(p, f, t, P) {
      var x1 = P.bzX1, y1 = P.bzY1, x2 = P.bzX2, y2 = P.bzY2;
      var u = p;
      for (var i = 0; i < 8; i++) {
        var u2 = u * u, u3 = u2 * u;
        var bx = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u2 * x2 + u3;
        var dbx = 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u2 * (1 - x2);
        if (Math.abs(dbx) < 1e-9) break;
        u = u - (bx - p) / dbx; u = Math.max(0, Math.min(1, u));
      }
      var uu2 = u * u, uu3 = uu2 * u;
      var ep = 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * uu2 * y2 + uu3;
      return { x: f.x + (t.x - f.x) * ep, y: f.y + (t.y - f.y) * ep };
    }
  },
  ellipse: {
    name: "椭圆/圆",
    params: ["cx", "cy", "ax", "ay", "omega", "phiX", "phiY"],
    fn: function(p, f, t, P) {
      return { x: P.cx + P.ax * Math.cos(P.omega * p + P.phiX), y: P.cy + P.ay * Math.sin(P.omega * p + P.phiY) };
    }
  },
  lissajous: {
    name: "Lissajous",
    params: ["cx", "cy", "ax", "ay", "omegaX", "omegaY", "phiX", "phiY", "funcX", "funcY"],
    fn: function(p, f, t, P) {
      var fx = P.funcX === "cos" ? Math.cos : Math.sin;
      var fy = P.funcY === "cos" ? Math.cos : Math.sin;
      return { x: P.cx + P.ax * fx(P.omegaX * p + P.phiX), y: P.cy + P.ay * fy(P.omegaY * p + P.phiY) };
    }
  },
  custom: {
    name: "自定义",
    params: ["xExpr", "yExpr"],
    fn: null
  }
};

var PARAM_DEFAULTS = {
  cx: 0, cy: 0, ax: 0.5, ay: 0.5,
  omega: 2 * Math.PI, omegaX: 2 * Math.PI, omegaY: 4 * Math.PI,
  phiX: 0, phiY: 0,
  funcX: "sin", funcY: "sin",
  xExpr: "0", yExpr: "0",
  bzX1: 0.42, bzY1: 0, bzX2: 1, bzY2: 1,
  k: 2
};

var PARAM_LABELS = {
  cx: "中心X", cy: "中心Y", ax: "振幅X", ay: "振幅Y",
  omega: "ω(rad)", omegaX: "ωx(rad)", omegaY: "ωy(rad)",
  phiX: "φx(rad)", phiY: "φy(rad)",
  funcX: "X函数", funcY: "Y函数",
  xExpr: "x(p,P,t,T)", yExpr: "y(p,P,t,T)",
  bzX1: "Bz x1", bzY1: "Bz y1", bzX2: "Bz x2", bzY2: "Bz y2",
  k: "强度"
};

function createDefaultTrack(id) {
  return {
    id: id,
    keyframes: [
      { time: 0, x: 0, y: 0, hidden: false },
      { time: state.duration, x: 0, y: 0, hidden: false }
    ],
    segmentPresets: [
      { preset: "line", params: {} }
    ]
  };
}

function evalCustomExpr(expr, p, P) {
  try {
    var sin = Math.sin, cos = Math.cos, tan = Math.tan, abs = Math.abs;
    var pow = Math.pow, min = Math.min, max = Math.max, PI = Math.PI;
    var sqrt = Math.sqrt, floor = Math.floor, ceil = Math.ceil;
    var round = Math.round, log = Math.log, exp = Math.exp;
    var result = eval(expr);
    return isFinite(result) ? result : 0;
  } catch (e) { return 0; }
}

function evalSegmentAt(seg, localP, fromKF, toKF) {
  var preset = PRESETS[seg.preset];
  if (!preset) return { x: 0, y: 0, hidden: false };
  if (preset.hidden) return { x: 0, y: 0, hidden: true };
  var P = {};
  if (preset.params && seg.params) {
    for (var pi = 0; pi < preset.params.length; pi++) {
      var pk = preset.params[pi];
      if (pk === "xExpr" || pk === "yExpr" || pk === "funcX" || pk === "funcY") {
        P[pk] = exprRaw(seg.params[pk], PARAM_DEFAULTS[pk]);
      } else {
        P[pk] = exprVal(seg.params[pk], PARAM_DEFAULTS[pk]);
      }
    }
  }
  if (seg.preset === "custom") {
    return { x: evalCustomExpr(P.xExpr || "0", localP, P), y: evalCustomExpr(P.yExpr || "0", localP, P), hidden: false };
  }
  if (preset.fn) { return preset.fn(localP, fromKF, toKF, P); }
  return { x: 0, y: 0, hidden: false };
}

function evalTrackAt(track, globalTime) {
  if (track._sampledPath) {
    var hz = state.sampleRateReal;
    var idx = Math.round(globalTime * hz);
    if (idx < 0) idx = 0;
    if (idx >= track._sampledPath.length) idx = track._sampledPath.length - 1;
    var cell = track._sampledPath[idx];
    return { x: cell.x, y: cell.y, hidden: !!cell.hidden };
  }
  var kfs = track.keyframes;
  var sps = track.segmentPresets;
  if (!kfs || kfs.length < 2) return { x: 0, y: 0, hidden: false };
  if (globalTime <= kfs[0].time) return { x: kfs[0].x, y: kfs[0].y, hidden: !!kfs[0].hidden };
  if (globalTime >= kfs[kfs.length - 1].time) {
    var last = kfs[kfs.length - 1];
    return { x: last.x, y: last.y, hidden: !!last.hidden };
  }
  // 找到所在段
  for (var si = 0; si < sps.length; si++) {
    var fromKF = kfs[si], toKF = kfs[si + 1];
    if (globalTime >= fromKF.time && globalTime <= toKF.time + 1e-9) {
      var dur = toKF.time - fromKF.time;
      var localP = dur > 0 ? Math.min(1, Math.max(0, (globalTime - fromKF.time) / dur)) : 0;
      var r = evalSegmentAt(sps[si], localP, fromKF, toKF);
      if (r.hidden || fromKF.hidden || toKF.hidden) return { x: r.x, y: r.y, hidden: true };
      return { x: r.x, y: r.y, hidden: false };
    }
  }
  return { x: 0, y: 0, hidden: false };
}

function getTrackPos(track, t) { return evalTrackAt(track, t); }