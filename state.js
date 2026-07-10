/* ============================================================
   state.js - 全局状态 + 核心辅助函数
   依赖：无（最底层模块）
   ============================================================ */

"use strict";

// ============================================================
// === GLOBAL STATE ===
// ============================================================

const state = {
  bpm: 120,
  sampleRateReal: 10.0,        // 真实 Hz
  offsetSec: 0,                // 真实秒数
  duration: 30,
  fov: 55,
  noteScale: 1.0,              // 音符大小比例 (0.2 ~ 2.0)
  speed: 1.0,                  // 播放倍速 (0.05 ~ 5.0)
  loopA: null,                 // AB 循环起点 (秒), null=未设置
  loopB: null,                 // AB 循环终点 (秒)
  loopEnabled: false,          // 是否启用循环
  audioPath: "",               // 当前加载的音频文件名（可选）

  tracks: [],                  // [{id, segments, _sampledPath?}]
  openedTracks: [],            // 当前打开的轨道 id 列表
  notes: [],                   // [{track,type,time,endTime}]

  audioBuffer: null,
  audioCtx: null,
  audioSource: null,
  audioStartedAt: 0,
  audioStartOffset: 0,
  _musicGain: null,

  keyMap: {},                  // {trackId: keyString}
};

// ============================================================
// === DERIVED TIME/COORD HELPERS ===
// ============================================================

function sampleRateStored() { return Math.round(state.sampleRateReal * 10); }
function offsetStored() { return Math.round(state.offsetSec * state.sampleRateReal) + 500; }
function totalFrames() { return Math.ceil(state.duration * state.sampleRateReal) + 1; }
function secToTimestamp(s) { return Math.round(s * state.sampleRateReal); }
function timestampToSec(ts) { return ts / state.sampleRateReal; }
function beatToSec(b) { return b * 60 / state.bpm; }
function secToBeat(s) { return s * state.bpm / 60; }

function timeInputToSec(val, unit) {
  val = parseFloat(val) || 0;
  return unit === "beat" ? beatToSec(val) : val;
}

function coordToStored(v) { return Math.round(v * 1000 + 5000); }
function storedToCoord(s) { return (s - 5000) / 1000; }

function hueForTrack(i, total) { return (i / Math.max(total, 1)) * 360; }
function hslStr(h, s, l, a) {
  return "hsla(" + h + "," + (s !== undefined ? s : 100) + "%," + (l !== undefined ? l : 60) + "%," + (a === undefined ? 1 : a) + ")";
}

// ============================================================
// === EXPRESSION SYSTEM ===
// ============================================================

function evalNumericInput(str) {
  if (str === null || str === undefined) return NaN;
  var s = String(str).trim();
  if (s === "") return NaN;
  var asNum = Number(s);
  if (isFinite(asNum) && /^[-+]?[\d.eE+-]+$/.test(s)) return asNum;
  try {
    if (!/^[0-9a-zA-Z_.+\-*/^() \t,]+$/.test(s)) return NaN;
    var expr = s.replace(/\^/g, "**");
    var pi = Math.PI, PI = Math.PI, Pi = Math.PI;
    var e = Math.E, E = Math.E;
    var sin = Math.sin, cos = Math.cos, tan = Math.tan;
    var asin = Math.asin, acos = Math.acos, atan = Math.atan, atan2 = Math.atan2;
    var sqrt = Math.sqrt, abs = Math.abs, pow = Math.pow;
    var log = Math.log, log2 = Math.log2, log10 = Math.log10, exp = Math.exp;
    var floor = Math.floor, ceil = Math.ceil, round = Math.round;
    var min = Math.min, max = Math.max;
    var result = eval(expr);
    return isFinite(result) ? result : NaN;
  } catch (err) {
    return NaN;
  }
}

function makeExpr(input) {
  var raw = String(input);
  var v = evalNumericInput(raw);
  return { raw: raw, value: isFinite(v) ? v : NaN };
}

function toExpr(v, fallback) {
  if (fallback === undefined) fallback = 0;
  if (v && typeof v === "object" && "raw" in v && "value" in v) return v;
  if (typeof v === "number") return { raw: String(v), value: v };
  if (typeof v === "string") return makeExpr(v);
  return { raw: String(fallback), value: fallback };
}

function exprVal(v, fallback) {
  if (fallback === undefined) fallback = 0;
  if (v && typeof v === "object" && "value" in v) {
    return isFinite(v.value) ? v.value : fallback;
  }
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    var n = evalNumericInput(v);
    return isFinite(n) ? n : fallback;
  }
  return fallback;
}

function exprRaw(v, fallback) {
  if (fallback === undefined) fallback = "0";
  if (v && typeof v === "object" && "raw" in v) return v.raw;
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  return String(fallback);
}

// ============================================================
// === EXPRESSION INPUT BINDING ===
// ============================================================

function bindExprInput(el, onCommit) {
  if (!el || el._exprBound) return;
  el._exprBound = true;

  function tryCommit() {
    var raw = el.value;
    var v = evalNumericInput(raw);
    if (!isFinite(v)) {
      el.classList.add("expr-invalid");
      return;
    }
    el.classList.remove("expr-invalid");
    if (onCommit) onCommit({ raw: raw, value: v });
  }

  el.addEventListener("input", function () {
    var raw = el.value;
    var v = evalNumericInput(raw);
    if (isFinite(v)) {
      el.classList.remove("expr-invalid");
      if (onCommit) onCommit({ raw: raw, value: v });
    } else {
      el.classList.add("expr-invalid");
    }
  });

  el.addEventListener("blur", tryCommit);
  el.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); el.blur(); }
  });

  el.addEventListener("dblclick", function (e) {
    e.preventDefault();
    openExprZoom(el, onCommit);
  });
}

// ============================================================
// === DOUBLE-CLICK ZOOM EDIT ===
// ============================================================

function openExprZoom(sourceEl, onCommit) {
  var overlay = document.getElementById("exprZoomOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "exprZoomOverlay";
    overlay.className = "expr-zoom-overlay";
    overlay.innerHTML = '<input type="text" id="exprZoomInput" class="expr-zoom-input">';
    document.body.appendChild(overlay);
  }
  var input = document.getElementById("exprZoomInput");
  input.value = sourceEl.value;
  overlay.classList.add("active");

  setTimeout(function () { input.focus(); input.select(); }, 20);

  function close(save) {
    if (save) {
      var raw = input.value;
      sourceEl.value = raw;
      var v = evalNumericInput(raw);
      if (isFinite(v)) {
        sourceEl.classList.remove("expr-invalid");
        if (onCommit) onCommit({ raw: raw, value: v });
      } else {
        sourceEl.classList.add("expr-invalid");
      }
    }
    overlay.classList.remove("active");
    document.removeEventListener("keydown", onKey);
    overlay.removeEventListener("mousedown", onOverlayClick);
    input.removeEventListener("mousedown", stopProp);
  }

  function onKey(e) {
    if (e.key === "Enter") { e.preventDefault(); close(true); }
    else if (e.key === "Escape") { e.preventDefault(); close(false); }
  }
  function onOverlayClick(e) {
    if (e.target === overlay) close(true);
  }
  function stopProp(e) { e.stopPropagation(); }

  document.addEventListener("keydown", onKey);
  overlay.addEventListener("mousedown", onOverlayClick);
  input.addEventListener("mousedown", stopProp);
}

