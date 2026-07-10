/* ============================================================
   ui.js - UI 工具（Toast / 同步 / 弹窗 / 大小预估）
   依赖：state.js
   ============================================================ */
"use strict";

function showToast(msg, type) {
  var t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast " + (type || "success") + " show";
  clearTimeout(t._timeout);
  t._timeout = setTimeout(function() { t.classList.remove("show"); }, 3000);
}

function syncGlobals() {
  var bpmEl = document.getElementById("gBPM");
  var srEl = document.getElementById("gSampleRate");
  var offEl = document.getElementById("gOffset");
  var durEl = document.getElementById("gDuration");
  var fovEl = document.getElementById("gFOV");
  var bpm = Math.round(evalNumericInput(bpmEl.value));
  var sr = evalNumericInput(srEl.value);
  var off = evalNumericInput(offEl.value);
  var dur = evalNumericInput(durEl.value);
  var fov = evalNumericInput(fovEl.value);
  state.bpm = (isFinite(bpm) && bpm > 0) ? bpm : state.bpm || 120;
  state.sampleRateReal = (isFinite(sr) && sr > 0) ? sr : state.sampleRateReal || 10;
  state.offsetSec = isFinite(off) ? off : (state.offsetSec || 0);
  state.duration = (isFinite(dur) && dur > 0) ? dur : state.duration || 30;
  state.fov = (isFinite(fov) && fov > 0) ? fov : state.fov || 55;
  // 倍速
  var spEl = document.getElementById("gSpeed");
  if (spEl) state.speed = parseInt(spEl.value) / 100;
  // 更新进度数字最小宽度
  var tdEl = document.getElementById("timeDisplay");
  if (tdEl) {
    var maxStr = state.duration.toFixed(2) + "s";
    tdEl._maxLen = maxStr.length;
    tdEl.style.minWidth = (maxStr.length * 0.6) + "em";
  }
  var nsEl = document.getElementById("gNoteScale");
  if (nsEl) state.noteScale = parseInt(nsEl.value) / 100;
}

var sizeEstTimeout = null;
function scheduleSizeEstimate() {
  if (sizeEstTimeout) return;
  sizeEstTimeout = setTimeout(function() {
    sizeEstTimeout = null;
    updateSizeEstimate();
  }, 800);
}

function updateSizeEstimate() {
  try {
    var hvp = encodeHVP(true);
    if (hvp) {
      var kb = (hvp.length / 1024).toFixed(1);
      document.getElementById("sizeEstimate").textContent = "预估: " + hvp.length + " 字符 (" + kb + " KB)";
    } else {
      document.getElementById("sizeEstimate").textContent = "预估: 校验失败";
    }
  } catch (e) {
    document.getElementById("sizeEstimate").textContent = "预估: 错误";
  }
}

function showImportModal() {
  document.getElementById("importModal").classList.add("active");
  document.getElementById("importText").value = "";
  document.getElementById("importFile").value = "";
}
function closeImportModal() {
  document.getElementById("importModal").classList.remove("active");
}
function showResult() {
  document.getElementById("resultScore").textContent = pad(Math.round(game.score), 7);
  document.getElementById("resultModal").classList.add("active");
}

function escapeHtmlAttr(s) {
  return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/'/g,"&#39;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function showHelp() { document.getElementById("helpModal").classList.add("active"); }
function closeHelp() { document.getElementById("helpModal").classList.remove("active"); }

// === AB 循环 ===
function updateLoopUI() {
  var a = state.loopA, b = state.loopB, en = state.loopEnabled;
  document.getElementById("btnLoopToggle").className = en ? "small" : "small secondary";
  document.getElementById("btnLoopToggle").textContent = en ? "■" : "↺";
  document.getElementById("btnLoopA").className = a !== null ? "small" : "small secondary";
  document.getElementById("btnLoopB").className = b !== null ? "small" : "small secondary";
  document.getElementById("btnPlayA").textContent = game.playFromAFlag ? "■" : "▶";
  document.getElementById("btnPlayA").className = game.playFromAFlag ? "small" : "small secondary";
  var info = "";
  if (a !== null) info = "A:" + a.toFixed(2) + "s";
  if (b !== null) info += (info ? "  " : "") + "B:" + b.toFixed(2) + "s";
  document.getElementById("loopInfo").textContent = info;
}

function setLoopA() {
  if (state.loopA !== null && Math.abs(state.loopA - game.gameTime) < 0.001) {
    state.loopA = null;
    updateLoopUI();
    showToast("循环起点 A 已取消", "info");
    return;
  }
  state.loopA = Math.max(0, game.gameTime);
  if (state.loopB !== null && state.loopA >= state.loopB) state.loopB = null;
  updateLoopUI();
  showToast("循环起点 A = " + state.loopA.toFixed(2) + "s", "info");
}

function setLoopB() {
  if (state.loopB !== null && Math.abs(state.loopB - game.gameTime) < 0.001) {
    state.loopB = null;
    updateLoopUI();
    showToast("循环终点 B 已取消", "info");
    return;
  }
  state.loopB = Math.max(0, game.gameTime);
  if (state.loopA !== null && state.loopB <= state.loopA) state.loopA = null;
  updateLoopUI();
  showToast("循环终点 B = " + state.loopB.toFixed(2) + "s", "info");
}

function toggleLoop() {
  if (state.loopA === null || state.loopB === null) {
    showToast("请先设置 A 和 B 点", "warn");
    return;
  }
  if (state.loopEnabled) {
    // ■ 暂停
    state.loopEnabled = false;
    game.playFromAFlag = false;
    if (game.playing && typeof pausePreview === "function") pausePreview();
    else if (typeof stopPlay === "function") stopPlay();
    updateLoopUI();
    showToast("循环已暂停", "info");
    return;
  }
  state.loopEnabled = true;
  game.playFromAFlag = false;
  if (game.gameTime < state.loopA || game.gameTime > state.loopB) game.gameTime = state.loopA;
  game.startGameTime = game.gameTime;
  game.startRealTime = performance.now();
  if (state.audioBuffer) startAudioAt(game.gameTime);
  updateTimeDisplay();
  if (!game.playing) {
    game.playing = true; game.paused = false; game.mode = "preview";
    game.autoHits = new Set(); game.judgments = {}; game.combo = 0; game.score = 0;
    game.holdRingShrink = {}; game.effects = [];
    document.getElementById("btnPlay").textContent = "⏸ 暂停";
  }
  updateLoopUI();
  showToast("循环已开启", "info");
}

function clearLoop() {
  state.loopA = null; state.loopB = null; state.loopEnabled = false;
  game.playFromAFlag = false;
  updateLoopUI();
  showToast("AB 循环已清除", "info");
}

function playFromA() {
  if (game.playFromAFlag) { pausePreview(); return; }
  if (state.loopA === null) { showToast("请先设置 A 点", "warn"); return; }
  if (state.loopB === null || state.loopB <= state.loopA) { showToast("请先设置 B 点（需大于 A）", "warn"); return; }
  state.loopEnabled = false;
  game.playFromAFlag = true;
  game.gameTime = state.loopA;
  game.startGameTime = state.loopA;
  game.startRealTime = performance.now();
  game.playing = true; game.paused = false; game.mode = "preview";
  game.autoHits = new Set(); game.judgments = {}; game.combo = 0; game.score = 0;
  game.holdRingShrink = {}; game.effects = [];
  if (state.audioBuffer) startAudioAt(state.loopA);
  document.getElementById("btnPlay").textContent = "⏸ 暂停";
  updateLoopUI();
}

