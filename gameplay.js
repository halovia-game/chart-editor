/* ============================================================
   gameplay.js - 试玩模式 + 判定系统 + 键位映射
   依赖：state.js, presets.js, ui.js, sfx.js, audio.js, preview.js
   ============================================================ */
"use strict";

// === GAME STATE (defined here so preview.js can also access it) ===
var game = {
  mode: "preview", playing: false, paused: false,
  gameTime: 0, startRealTime: 0, startGameTime: 0,
  fullscreen: false,
  judgments: {}, combo: 0, score: 0,
  effects: [], holdRingShrink: {},
  autoHits: new Set(), keysDown: {},
  simulHitKeys: new Set()
};

// === JUDGMENT ===
function getJudgment(diffMs) {
  if (diffMs < -120) return null;
  if (diffMs > 120) return "M";
  var abs = Math.abs(diffMs);
  if (abs <= 60) return "P";
  if (abs <= 100) return "G";
  return "B";
}

function isTrackMapped(trackId) { return !!state.keyMap[trackId]; }

function processAutoJudgments(currentTime) {
  for (var i = 0; i < state.notes.length; i++) {
    if (game.judgments[i] && game.judgments[i].judged) continue;
    var note = state.notes[i];
    var isAuto = (game.mode === "preview") || !isTrackMapped(note.track);
    if (note.type === 2) {
      if (isAuto) { if (currentTime >= note.time) applyJudgment(i, note, "P", note.time); }
      else {
        var key = state.keyMap[note.track], isHeld = key && game.keysDown[key];
        var diffMs = (currentTime - note.time) * 1000;
        if (diffMs >= -60 && diffMs <= 60 && isHeld) applyJudgment(i, note, "P", currentTime);
        else if (diffMs > 60) applyJudgment(i, note, "M", currentTime);
      }
      continue;
    }
    if (isAuto) { if (currentTime >= note.time) applyJudgment(i, note, "P", note.time); }
    else { if (currentTime > note.time + 0.120) applyJudgment(i, note, "M", currentTime); }
  }
}

function processHoldContinuous(currentTime) {
  for (var i = 0; i < state.notes.length; i++) {
    var note = state.notes[i];
    if (note.type !== 3) continue;
    var j = game.judgments[i];
    if (!j || !j.judged || j.holdState !== "holding") continue;
    var endT = note.endTime !== null ? note.endTime : note.time;
    var isAuto = (game.mode === "preview") || !isTrackMapped(note.track);
    if (isAuto) { if (currentTime >= endT) { j.holdState = "done"; setHoldRingShrink(note.track, false); } }
    else {
      var key = state.keyMap[note.track], isHeld = key && game.keysDown[key];
      if (currentTime >= endT - 0.060) { if (currentTime >= endT) { j.holdState = "done"; setHoldRingShrink(note.track, false); } }
      else if (!isHeld) { j.holdState = "broken"; revertAndMiss(i, j); setHoldRingShrink(note.track, false); }
    }
  }
}

function applyJudgment(noteIdx, note, result, judgeTime) {
  game.judgments[noteIdx] = {
    judged: true, result: result, judgeTime: judgeTime,
    holdState: note.type === 3 ? ((result === "P" || result === "G") ? "holding" : "done") : "done"
  };
  var track = state.tracks[note.track];
  if (track) {
    var pos = getTrackPos(track, note.time), hue = hueForTrack(note.track, state.tracks.length);
    var isSimul = isSimultaneousJudgment(note);
    var effType = result === "P" ? "perfect" : result === "G" ? "good" : result === "B" ? "bad" : "miss";
    game.effects.push({ type: effType, x: pos.x, y: pos.y, hue: hue, simul: isSimul, startTime: performance.now() / 1000, duration: 0.2, noteIdx: noteIdx, noteType: note.type });
  }
  if (note.type === 3 && (result === "P" || result === "G")) setHoldRingShrink(note.track, true);
  if (result === "P" || result === "G") playSfx(note.type);
  if (result === "P" || result === "G") game.combo++; else game.combo = 0;
  var total = state.notes.length, perNote = total > 0 ? 1000000 / total : 0;
  var mult = result === "P" ? 1.0 : result === "G" ? 0.6 : 0;
  game.score += perNote * mult;
}

function revertAndMiss(noteIdx, j) {
  var total = state.notes.length, perNote = total > 0 ? 1000000 / total : 0;
  var oldMult = j.result === "P" ? 1.0 : j.result === "G" ? 0.6 : 0;
  game.score -= perNote * oldMult;
  j.result = "M"; game.combo = 0;
}

function isSimultaneousJudgment(note) {
  var ts = secToTimestamp(note.time), count = 0;
  for (var i = 0; i < state.notes.length; i++) { if (secToTimestamp(state.notes[i].time) === ts) count++; if (count > 1) return true; }
  return false;
}

var HOLD_SHRINK_DUR = 40;
function setHoldRingShrink(trackId, target) {
  if (!game.holdRingShrink[trackId]) game.holdRingShrink[trackId] = { target: 0, current: 0, lastUpdate: performance.now() };
  else game.holdRingShrink[trackId].lastUpdate = performance.now();
  game.holdRingShrink[trackId].target = target ? 1 : 0;
}

function updateAllHoldShrinks() {
  var now = performance.now();
  for (var tid in game.holdRingShrink) {
    if (game.holdRingShrink.hasOwnProperty(tid)) {
      var s = game.holdRingShrink[tid], dt = now - s.lastUpdate;
      s.lastUpdate = now; if (dt > 100) dt = 16; if (dt < 0) dt = 0;
      var diff = s.target - s.current; s.current += diff * Math.min(1, dt / HOLD_SHRINK_DUR);
    }
  }
}

function getHoldRingShrinkValue(trackId) {
  var s = game.holdRingShrink[trackId]; return s ? s.current : 0;
}

// === KEY MAPPING ===
var bindingRow = null;

function showPlayModal() {
  syncGlobals();
  var sortedUsed = state.tracks.map(function(t) { return t.id; }).sort(function(a, b) { return a - b; });
  if (sortedUsed.length === 0) { showToast("没有可用的轨道", "warn"); return; }
  var memKey = "halovia_keymap_" + sortedUsed.join(",");
  var remembered = JSON.parse(localStorage.getItem(memKey) || "{}");
  var defaults = getDefaultKeyMap(sortedUsed);
  state.keyMap = {};
  for (var i = 0; i < sortedUsed.length; i++) {
    var tid = sortedUsed[i]; state.keyMap[tid] = remembered[tid] || defaults[tid] || "";
  }
  renderKeyMapList(sortedUsed);
  document.getElementById("keyMapModal").classList.add("active");
}

function getDefaultKeyMap(usedTracks) {
  var n = usedTracks.length;
  var presets = { 4: ["D","F","J","K"], 5: ["D","F"," ","J","K"], 6: ["S","D","F","J","K","L"], 7: ["S","D","F"," ","J","K","L"], 8: ["W","E","R","V","N","U","I","O"] };
  var map = {};
  if (presets[n]) { for (var i = 0; i < usedTracks.length; i++) map[usedTracks[i]] = presets[n][i]; }
  return map;
}

function renderKeyMapList(usedTracks) {
  var list = document.getElementById("keyMapList"); list.innerHTML = "";
  var total = state.tracks.length;
  for (var i = 0; i < usedTracks.length; i++) {
    var tid = usedTracks[i], hue = hueForTrack(tid, total);
    var key = state.keyMap[tid] || "";
    var row = document.createElement("div");
    row.className = "keymap-row"; row.dataset.trackId = tid;
    row.innerHTML = "<span class=\"color-dot\" style=\"background:" + hslStr(hue, 100, 55) + "\"></span><span class=\"track-label\">轨道 " + tid + "</span><span class=\"key-display " + (key ? "" : "unbound") + "\">" + (formatKey(key) || "未绑定") + "</span>";
    row.onclick = (function(t) { return function() { startKeyBinding(row, t); }; })(tid);
    list.appendChild(row);
  }
}

function startKeyBinding(row, tid) {
  if (bindingRow) bindingRow.classList.remove("binding");
  bindingRow = row; row.classList.add("binding");
  var disp = row.querySelector(".key-display"); disp.textContent = "按键..."; disp.classList.remove("unbound");
}

function captureBindKey(e) {
  if (!bindingRow) return;
  e.preventDefault();
  var tid = parseInt(bindingRow.dataset.trackId);
  var keyStr = serializeKey(e);
  state.keyMap[tid] = keyStr;
  var disp = bindingRow.querySelector(".key-display"); disp.textContent = formatKey(keyStr); disp.classList.remove("unbound");
  bindingRow.classList.remove("binding"); bindingRow = null;
}

function serializeKey(e) {
  var mods = [];
  if (e.ctrlKey) mods.push("Ctrl"); if (e.shiftKey) mods.push("Shift"); if (e.altKey) mods.push("Alt");
  var k = e.key; if (k === " ") k = "Space"; else if (k.length === 1) k = k.toUpperCase();
  if (["Control","Shift","Alt","Meta"].indexOf(e.key) >= 0) return null;
  return mods.concat([k]).join("+");
}

function formatKey(k) { return k || ""; }

function resetKeyMapDefault() {
  var usedTracks = Object.keys(state.keyMap).map(Number).sort(function(a, b) { return a - b; });
  var def = getDefaultKeyMap(usedTracks);
  for (var i = 0; i < usedTracks.length; i++) state.keyMap[usedTracks[i]] = def[usedTracks[i]] || "";
  renderKeyMapList(usedTracks);
}

function confirmKeyMapAndPlay() {
  var usedTracks = Object.keys(state.keyMap).map(Number).sort(function(a, b) { return a - b; });
  for (var i = 0; i < usedTracks.length; i++) { if (!state.keyMap[usedTracks[i]]) { showToast("轨道 " + usedTracks[i] + " 未绑定按键，无法开始", "error"); return; } }
  var memKey = "halovia_keymap_" + usedTracks.join(",");
  localStorage.setItem(memKey, JSON.stringify(state.keyMap));
  closeKeyMapModal();
  startPlayMode();
}

function closeKeyMapModal() {
  document.getElementById("keyMapModal").classList.remove("active");
  if (bindingRow) { bindingRow.classList.remove("binding"); bindingRow = null; }
}

// === PLAY MODE ===
function startPlayMode() {
  game.mode = "play"; game.playing = true; game.paused = false; game.gameTime = 0;
  game.startRealTime = performance.now(); game.startGameTime = 0; game.combo = 0; game.score = 0;
  game.judgments = {}; game.effects = []; game.autoHits = new Set(); game.keysDown = {}; game.holdRingShrink = {};
  enterFullscreen();
  if (state.audioBuffer) startAudioAt(0);
  updateTimeDisplay();
}

function enterFullscreen() {
  game.fullscreen = true; var wrap = document.getElementById("previewWrap");
  wrap.classList.add("fullscreen");
  if (!document.getElementById("inGamePauseBtn")) {
    var btn = document.createElement("button"); btn.id = "inGamePauseBtn"; btn.className = "pause-btn";
    btn.textContent = "暂停"; btn.onclick = function() { pauseGame(); };
    wrap.appendChild(btn);
  }
  resizePreview();
}

function exitFullscreen() {
  game.fullscreen = false; var wrap = document.getElementById("previewWrap");
  wrap.classList.remove("fullscreen");
  var btn = document.getElementById("inGamePauseBtn"); if (btn) btn.remove();
  resizePreview();
}

function pauseGame() {
  if (!game.playing) return;
  game.paused = true; game.playing = false; stopAudio();
  document.getElementById("pauseModal").classList.add("active");
}

function resumePlay() {
  document.getElementById("pauseModal").classList.remove("active");
  game.paused = false; game.playing = true;
  game.startRealTime = performance.now(); game.startGameTime = game.gameTime;
  if (state.audioBuffer) startAudioAt(game.gameTime);
}

function retryPlay() {
  document.getElementById("pauseModal").classList.remove("active");
  game.gameTime = 0; game.startGameTime = 0; game.combo = 0; game.score = 0;
  game.judgments = {}; game.effects = []; game.paused = false; game.playing = true;
  game.startRealTime = performance.now(); game.keysDown = {}; game.holdRingShrink = {};
  if (state.audioBuffer) startAudioAt(0);
}

function exitPlay() {
  document.getElementById("pauseModal").classList.remove("active");
  game.playing = false; game.paused = false; stopAudio(); exitFullscreen();
}

// === KEYBOARD EVENTS ===
document.addEventListener("keydown", function(e) {
  if (bindingRow) { var k = serializeKey(e); if (k) captureBindKey(e); return; }
  if (game.fullscreen && game.mode === "preview") {
    if (e.key === "Escape") { togglePreviewFullscreen(); return; }
  }
  if (game.mode === "play" && game.playing) {
    if (e.key === "Escape") { exitPlay(); return; }
    var keyStr = serializeKey(e);
    if (keyStr && !game.keysDown[keyStr]) { game.keysDown[keyStr] = true; handleKeyPress(keyStr); }
    e.preventDefault();
  } else if (game.mode === "play" && game.paused) {
    if (e.key === "Escape") exitPlay();
  }
});

document.addEventListener("keyup", function(e) {
  var keyStr = serializeKey(e);
  if (keyStr) game.keysDown[keyStr] = false;
});

function handleKeyPress(keyStr) {
  var tracks = [];
  for (var tid in state.keyMap) { if (state.keyMap[tid] === keyStr) tracks.push(parseInt(tid)); }
  if (tracks.length === 0) return;
  for (var ti = 0; ti < tracks.length; ti++) {
    var tid = tracks[ti], bestIdx = -1, bestDiff = Infinity;
    for (var ni = 0; ni < state.notes.length; ni++) {
      var note = state.notes[ni];
      if (note.track !== tid) continue;
      if (note.type === 2) continue;
      var j = game.judgments[ni]; if (j && j.judged) continue;
      var diffMs = (game.gameTime - note.time) * 1000;
      if (diffMs < -120 || diffMs > 120) continue;
      if (Math.abs(diffMs) < Math.abs(bestDiff)) { bestDiff = diffMs; bestIdx = ni; }
    }
    if (bestIdx >= 0) { var note2 = state.notes[bestIdx], result = getJudgment(bestDiff); if (result) applyJudgment(bestIdx, note2, result, game.gameTime); }
  }
}
