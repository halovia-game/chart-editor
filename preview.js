/* ============================================================
   preview.js - 3D 预览渲染 + 游戏循环
   依赖：state.js, presets.js, ui.js, sfx.js, audio.js, notes.js
   ============================================================ */
"use strict";

var previewCanvas = document.getElementById("previewCanvas");
var previewCtx = previewCanvas.getContext("2d");

// 预览区关键帧拖拽
var previewKF = { dragging: false, trackId: -1, startX: 0, startY: 0, origX: 0, origY: 0 };

previewCanvas.addEventListener("mousedown", function(e) {
  if (game.mode === "play") return;
  var rect = previewCanvas.getBoundingClientRect();
  var mx = e.clientX - rect.left, my = e.clientY - rect.top;
  var dpr = window.devicePixelRatio || 1;
  var W = previewCanvas.width / dpr, H = previewCanvas.height / dpr;
  var fovRad = state.fov * Math.PI / 180;
  var viewDist = 1 / Math.tan(fovRad / 2);
  var scaleX = W / 2, scaleY = H / 2, cx = W / 2, cy = H / 2;
  // 逆投影：找最近轨道
  var N = state.tracks.length;
  var bestDist = Infinity, bestTi = -1, bestPos = null;
  for (var ti = 0; ti < N; ti++) {
    var track = state.tracks[ti];
    var pos = getTrackPos(track, game.gameTime);
    if (pos.hidden) continue;
    // 将 3D 坐标转回屏幕
    var sx = cx + pos.x * scaleX, sy = cy - pos.y * scaleY;
    var d = Math.sqrt((mx - sx) * (mx - sx) + (my - sy) * (my - sy));
    if (d < Math.min(scaleX, scaleY) * 0.3) { bestDist = d; bestTi = ti; bestPos = pos; break; }
  }
  if (bestTi < 0) return;
  // 找到或创建该时间点的 keyframe
  var track = state.tracks[bestTi];
  var kfs = track.keyframes;
  var kfIdx = -1;
  var gameT = game.gameTime;
  for (var ki = 0; ki < kfs.length; ki++) {
    if (Math.abs(kfs[ki].time - gameT) < 0.01) { kfIdx = ki; break; }
  }
  if (kfIdx < 0) {
    // 静默拒绝重复时间
    for (var ck2 = 0; ck2 < kfs.length; ck2++) { if (Math.abs(kfs[ck2].time - gameT) < 0.001) return; }
    // 插入新 keyframe
    var ins = kfs.length;
    for (var kj = 1; kj < kfs.length; kj++) { if (kfs[kj].time > gameT) { ins = kj; break; } }
    // 复制上一个段的 preset
    var spSrc = Math.min(ins, track.segmentPresets.length) - 1;
    if (spSrc < 0) spSrc = 0;
    var newSP = track.segmentPresets[spSrc];
    var spCopy = newSP ? { preset: newSP.preset, params: JSON.parse(JSON.stringify(newSP.params || {})) } : { preset: "line", params: {} };
    track.segmentPresets.splice(ins, 0, spCopy);
    var nx = bestPos.x, ny = bestPos.y;
    kfs.splice(ins, 0, { time: gameT, x: nx, y: ny, hidden: false });
    kfIdx = ins;
    if (typeof renderTrackPanels === "function") renderTrackPanels();
  }
  timeline.draggingKF = { trackId: bestTi, kfIdx: kfIdx, startX: mx, origTime: gameT };
  previewKF.dragging = true; previewKF.trackId = bestTi; previewKF.kfIdx = kfIdx;
  previewKF.startX = mx; previewKF.startY = my;
  previewKF.origX = kfs[kfIdx].x; previewKF.origY = kfs[kfIdx].y;
});

previewCanvas.addEventListener("mousemove", function(e) {
  if (!previewKF.dragging) return;
  var rect = previewCanvas.getBoundingClientRect();
  var mx = e.clientX - rect.left, my = e.clientY - rect.top;
  var dpr = window.devicePixelRatio || 1;
  var W = previewCanvas.width / dpr, H = previewCanvas.height / dpr;
  var scaleX = W / 2, scaleY = H / 2, cx = W / 2, cy = H / 2;
  var dx = (mx - previewKF.startX) / scaleX;
  var dy = -(my - previewKF.startY) / scaleY;
  var track = state.tracks[previewKF.trackId];
  if (track && track.keyframes[previewKF.kfIdx]) {
    track.keyframes[previewKF.kfIdx].x = previewKF.origX + dx;
    track.keyframes[previewKF.kfIdx].y = previewKF.origY + dy;
    scheduleSizeEstimate();
    // 实时刷新面板，节流避免频繁 DOM 操作
    if (typeof renderTrackPanels === "function" && (!previewKF._lastRefresh || Date.now() - previewKF._lastRefresh > 80)) {
      previewKF._lastRefresh = Date.now();
      renderTrackPanels();
    }
  }
});

previewCanvas.addEventListener("mouseup", function() {
  if (previewKF.dragging) {
    previewKF.dragging = false;
    timeline.draggingKF = null;
    scheduleSizeEstimate();
    if (typeof renderTrackPanels === "function") renderTrackPanels();
  }
});

previewCanvas.addEventListener("mouseleave", function() {
  if (previewKF.dragging) {
    previewKF.dragging = false;
    timeline.draggingKF = null;
  }
});

function resizePreview() {
  var wrap = document.getElementById("previewWrap");
  var w, h;
  if (game.fullscreen) { w = window.innerWidth; h = window.innerHeight; wrap.style.width = ""; wrap.style.height = ""; }
  else {
    var parent = wrap.parentElement, availW = parent.clientWidth, usedH = 0;
    for (var ci = 0; ci < parent.children.length; ci++) { if (parent.children[ci] !== wrap) usedH += parent.children[ci].offsetHeight; }
    var availH = parent.clientHeight - usedH - 8;
    var targetW = availW, targetH = Math.round(targetW * 9 / 16);
    if (targetH > availH) { targetH = availH; targetW = Math.round(targetH * 16 / 9); }
    if (targetW < 100) targetW = 100; if (targetH < 60) targetH = 60;
    w = targetW; h = targetH;
    wrap.style.width = w + "px"; wrap.style.height = h + "px";
  }
  var dpr = window.devicePixelRatio || 1;
  previewCanvas.width = w * dpr; previewCanvas.height = h * dpr;
  previewCanvas.style.width = w + "px"; previewCanvas.style.height = h + "px";
  previewCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", function() {
  resizePreview(); resizeTimeline();
  setTimeout(function() { resizePreview(); resizeTimeline(); }, 50);
});

function togglePlay() { if (game.playing) pausePreview(); else startPreview(); }

function togglePreviewFullscreen() {
  if (game.fullscreen) {
    // 退出伪全屏
    game.fullscreen = false;
    var wrap = document.getElementById("previewWrap");
    wrap.classList.remove("fullscreen");
    var btn = document.getElementById("previewFsBtn");
    if (btn) btn.remove();
    resizePreview();
  } else {
    // 进入伪全屏（继续播放）
    if (!game.playing) { syncGlobals(); game.playing = true; game.paused = false; game.startRealTime = performance.now(); game.startGameTime = game.gameTime; }
    game.mode = "preview";
    game.fullscreen = true;
    var wrap = document.getElementById("previewWrap");
    wrap.classList.add("fullscreen");
    if (!document.getElementById("previewFsBtn")) {
      var btn = document.createElement("button");
      btn.id = "previewFsBtn";
      btn.className = "pause-btn";
      btn.textContent = "退出全屏";
      btn.onclick = function() { togglePreviewFullscreen(); };
      wrap.appendChild(btn);
    }
    resizePreview();
  }
}

function startPreview() {
  syncGlobals();
  game.mode = "preview"; game.playing = true; game.paused = false;
  game.startRealTime = performance.now(); game.startGameTime = game.gameTime;
  game.autoHits = new Set(); game.judgments = {}; game.combo = 0; game.score = 0;
  game.holdRingShrink = {}; game.effects = [];
  document.getElementById("btnPlay").textContent = "⏸ 暂停";
  if (state.audioBuffer) startAudioAt(game.gameTime);
}

function pausePreview() {
  game.playing = false; game.paused = true;
  document.getElementById("btnPlay").textContent = "▶ 播放";
  stopAudio();
}

function stopPlay() {
  game.playing = false; game.paused = false; game.gameTime = 0;
  game.startGameTime = 0; game.autoHits = new Set(); game.judgments = {};
  game.combo = 0; game.score = 0; game.effects = []; game.holdRingShrink = {}; game.keysDown = {};
  game.playFromAFlag = false;
  document.getElementById("btnPlay").textContent = "▶ 播放";
  document.getElementById("timeSlider").value = 0;
  updateTimeDisplay(); stopAudio();
  if (typeof updateLoopUI === "function") updateLoopUI();
}

document.addEventListener("DOMContentLoaded", function() {
  var slider = document.getElementById("timeSlider");
  if (slider) {
    slider.addEventListener("input", function() {
      if (game.playing) pausePreview();
      syncGlobals();
      var ratio = this.value / 1000;
      game.gameTime = ratio * state.duration;
      game.startGameTime = game.gameTime; game.autoHits = new Set(); game.judgments = {};
      game.combo = 0; game.score = 0;
      updateTimeDisplay();
    });
  }
});

function updateTimeDisplay() {
  var el = document.getElementById("timeDisplay");
  var text = game.gameTime.toFixed(2) + "s";
  el.textContent = text;
  // 根据总时长动态计算最小宽度，保证滑动条刻度不跳动
  var maxStr = state.duration.toFixed(2) + "s";
  if (el._maxLen !== maxStr.length) {
    el._maxLen = maxStr.length;
    el.style.minWidth = (maxStr.length * 0.6) + "em";
  }
  if (state.duration > 0) document.getElementById("timeSlider").value = Math.round((game.gameTime / state.duration) * 1000);
}

// === RENDER LOOP ===
function renderLoop() {
  if (game.playing && !game.paused) {
    var elapsed = (performance.now() - game.startRealTime) / 1000;
    game.gameTime = game.startGameTime + elapsed * (state.speed || 1.0);
    // AB 循环跳转
    var doLoop = state.loopEnabled || game.playFromAFlag;
    if (doLoop && state.loopA !== null && state.loopB !== null && state.loopB > state.loopA) {
      if (game.gameTime < state.loopA) {
        game.gameTime = state.loopA;
        game.startGameTime = state.loopA;
        game.startRealTime = performance.now();
        if (state.audioBuffer && state.audioSource) startAudioAt(state.loopA);
      } else if (game.gameTime >= state.loopB) {
        if (game.playFromAFlag) {
          game.playFromAFlag = false;
          state.loopEnabled = false;
          updateLoopUI();
          game.playing = false;
          stopAudio();
          game.gameTime = state.loopB;
        } else {
          game.gameTime = state.loopA;
          game.startGameTime = state.loopA;
          game.startRealTime = performance.now();
          if (state.audioBuffer && state.audioSource) startAudioAt(state.loopA);
        }
      }
    }
    if (game.gameTime > state.duration + 2) { onPlayEnd(); }
    updateTimeDisplay();
    processAutoJudgments(game.gameTime);
    processHoldContinuous(game.gameTime);
  }
  updateAllHoldShrinks();
  renderPreviewFrame(game.gameTime);
  renderTimeline();
  requestAnimationFrame(renderLoop);
}

function onPlayEnd() {
  if (game.mode === "play") { showResult(); exitPlay(); }
  else { pausePreview(); game.gameTime = state.duration; }
}

// === 3D RENDER FRAME ===
function renderPreviewFrame(gameTime) {
  var dpr = window.devicePixelRatio || 1;
  var W = previewCanvas.width / dpr, H = previewCanvas.height / dpr;
  var ctx = previewCtx;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  var N = state.tracks.length;
  if (N === 0) return;
  var fovRad = state.fov * Math.PI / 180;
  var viewDist = 1 / Math.tan(fovRad / 2);
  var scaleX = W / 2, scaleY = H / 2, cx = W / 2, cy = H / 2;
  function normToScreen(nx, ny) { return { sx: cx + nx * scaleX, sy: cy - ny * scaleY }; }
  function project3D(nx, ny, z) { var dz = z + viewDist; if (dz <= 0.001) return null; var ps = viewDist / dz; return { sx: cx + nx * ps * scaleX, sy: cy - ny * ps * scaleY, s: ps }; }
  // Grid
  ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 1;
  for (var g = -1; g <= 1; g += 0.5) { var p1 = normToScreen(g, -1), p2 = normToScreen(g, 1); ctx.beginPath(); ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.stroke(); var p3 = normToScreen(-1, g), p4 = normToScreen(1, g); ctx.beginPath(); ctx.moveTo(p3.sx, p3.sy); ctx.lineTo(p4.sx, p4.sy); ctx.stroke(); }
  var ringR = H / 9 * (state.noteScale || 1.0);
  var zFar = 4 * viewDist, zNear = -viewDist / 3;
  var fallSpeed = 5.12, ADVANCE_TIME = zFar / fallSpeed;
  function noteOpacity(z) { var absZ = Math.abs(z), plateauHalf = 0.25 * viewDist; if (absZ < plateauHalf) return 1.0; var decayDist = z > 0 ? (zFar - plateauHalf) : (Math.abs(zNear) - plateauHalf); if (decayDist <= 0) return 0; var beyond = absZ - plateauHalf; return Math.max(0, 1 - (beyond / decayDist) * (beyond / decayDist)); }
  // Beat lines
  if (document.getElementById("chkBeatLines") && document.getElementById("chkBeatLines").checked && state.bpm > 0) {
    var beatDur = 60 / state.bpm, tStart = gameTime + zNear / fallSpeed, tEnd = gameTime + zFar / fallSpeed;
    var firstBeat = Math.ceil(tStart / beatDur) * beatDur;
    for (var bt = firstBeat; bt <= tEnd; bt += beatDur) { var dt = bt - gameTime, z = dt * fallSpeed; if (z < zNear || z > zFar) continue; var proj = project3D(0, 0, z); if (!proj) continue; var lw = scaleX * 2 * proj.s; ctx.strokeStyle = "rgba(255,255,255," + (0.15 * Math.min(1, proj.s)) + ")"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - lw / 2, proj.sy); ctx.lineTo(cx + lw / 2, proj.sy); ctx.stroke(); }
  }
  // Collect render notes
  var renderNotes = [];
  for (var ni = 0; ni < state.notes.length; ni++) {
    var note = state.notes[ni];
    if (note.track >= N) continue;
    var j = game.judgments[ni];
    var displayTime = note.time, zOverride = null, displayOpacity = 1.0, dim = false;
    if (j && j.judged) {
      var judgeGameTime = j.judgeTime, elapsedSinceJudge = gameTime - judgeGameTime;
      if (j.result === "P" || j.result === "G") { if (note.type !== 3) continue; continue; }
      else if (j.result === "B") { if (elapsedSinceJudge > 0.2) continue; zOverride = 0; displayOpacity = 1 - elapsedSinceJudge / 0.2; dim = true; }
      else if (j.result === "M") { if (elapsedSinceJudge > 0.2) continue; displayOpacity = 1 - elapsedSinceJudge / 0.2; dim = true; }
    }
    var z = zOverride !== null ? zOverride : (displayTime - gameTime) * fallSpeed;
    if (z > zFar || z < zNear) continue;
    var track = state.tracks[note.track], pos = getTrackPos(track, displayTime), proj = project3D(pos.x, pos.y, z);
    if (!proj) continue;
    var baseOp = noteOpacity(z) * displayOpacity, hue = hueForTrack(note.track, N), isSimul = isSimultaneousJudgment(note);
    renderNotes.push({ note: note, ni: ni, z: z, proj: proj, hue: hue, pos: pos, baseOp: baseOp, dim: dim, isSimul: isSimul });
  }
  // 排序：时间从后向前绘制，上层时间在前（早的在下层，晚的在上层）——倒序后时间大的先画（在下层）
  renderNotes.sort(function(a, b) { return b.note.time - a.note.time; });
  // Hold polys
  var holdPolys = [];
  for (var hi = 0; hi < state.notes.length; hi++) {
    var n2 = state.notes[hi];
    if (n2.type !== 3 || n2.endTime === null || n2.endTime === undefined || n2.track >= N) continue;
    var j2 = game.judgments[hi];
    if (j2 && (j2.result === "B" || j2.holdState === "broken" || j2.holdState === "done")) { if (j2.result === "B" || j2.holdState === "broken") continue; if (gameTime > n2.endTime + 0.1) continue; }
    var track2 = state.tracks[n2.track], hue = hueForTrack(n2.track, N);
    var headT = (j2 && j2.judged && j2.holdState === "holding") ? gameTime : n2.time, tailT = n2.endTime;
    if (tailT < gameTime || headT > gameTime + ADVANCE_TIME) continue;
    var segments = 20, leftPts = [], rightPts = [], opSum = 0, opCount = 0, rSum = 0;
    for (var si = 0; si <= segments; si++) {
      var t = headT + (tailT - headT) * si / segments;
      if (t < gameTime - 0.001) continue; if (t > gameTime + ADVANCE_TIME) break;
      var z2 = (t - gameTime) * fallSpeed; if (z2 < zNear || z2 > zFar) continue;
      var pos2 = getTrackPos(track2, t), proj2 = project3D(pos2.x, pos2.y, z2);
      if (!proj2) continue; var rr = ringR / 3 * proj2.s;
      leftPts.push({ sx: proj2.sx - rr, sy: proj2.sy }); rightPts.push({ sx: proj2.sx + rr, sy: proj2.sy });
      opSum += noteOpacity(z2); opCount++; rSum += rr;
    }
    if (leftPts.length < 2) continue;
    holdPolys.push({ leftPts: leftPts, rightPts: rightPts, hue: hue, isSimul: isSimultaneousJudgment(n2), avgOp: opCount > 0 ? opSum / opCount : 0, meanR: opCount > 0 ? rSum / opCount : 0, maxZ: (headT - gameTime) * fallSpeed });
  }
  holdPolys.sort(function(a, b) { return b.maxZ - a.maxZ; });
  for (var hi2 = 0; hi2 < holdPolys.length; hi2++) {
    var h = holdPolys[hi2];
    // 主体
    ctx.beginPath(); ctx.moveTo(h.leftPts[0].sx, h.leftPts[0].sy);
    for (var li = 1; li < h.leftPts.length; li++) ctx.lineTo(h.leftPts[li].sx, h.leftPts[li].sy);
    for (var ri = h.rightPts.length - 1; ri >= 0; ri--) ctx.lineTo(h.rightPts[ri].sx, h.rightPts[ri].sy);
    ctx.closePath(); ctx.fillStyle = hslStr(h.hue, 90, 55, h.avgOp); ctx.fill();
    // 中心高光（约 40% 宽度）
    ctx.beginPath();
    for (var si = 0; si < h.leftPts.length; si++) {
      var mx = h.leftPts[si].sx + (h.rightPts[si].sx - h.leftPts[si].sx) * 0.3;
      var my = h.leftPts[si].sy + (h.rightPts[si].sy - h.leftPts[si].sy) * 0.3;
      if (si === 0) ctx.moveTo(mx, my); else ctx.lineTo(mx, my);
    }
    for (var si2 = h.rightPts.length - 1; si2 >= 0; si2--) {
      var mx2 = h.leftPts[si2].sx + (h.rightPts[si2].sx - h.leftPts[si2].sx) * 0.7;
      var my2 = h.leftPts[si2].sy + (h.rightPts[si2].sy - h.leftPts[si2].sy) * 0.7;
      ctx.lineTo(mx2, my2);
    }
    ctx.closePath(); ctx.fillStyle = hslStr(h.hue, 80, 70, h.avgOp * 0.3); ctx.fill();
    if (h.isSimul) {
      ctx.save(); ctx.strokeStyle = "rgba(255,255,255," + (h.avgOp * 0.85) + ")"; ctx.lineWidth = Math.max(2, h.meanR * 0.6); ctx.shadowColor = "#fff"; ctx.shadowBlur = h.meanR * 1.2;
      ctx.beginPath(); ctx.moveTo(h.leftPts[0].sx, h.leftPts[0].sy); for (var li2 = 1; li2 < h.leftPts.length; li2++) ctx.lineTo(h.leftPts[li2].sx, h.leftPts[li2].sy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(h.rightPts[0].sx, h.rightPts[0].sy); for (var ri2 = 1; ri2 < h.rightPts.length; ri2++) ctx.lineTo(h.rightPts[ri2].sx, h.rightPts[ri2].sy); ctx.stroke();
      ctx.restore();
    }
  }
  // Draw notes
  for (var rni = 0; rni < renderNotes.length; rni++) {
    var rn = renderNotes[rni], r = ringR * rn.proj.s, op = rn.baseOp, colorL = rn.dim ? 25 : 60;
    if (rn.isSimul && !rn.dim) { var go = r * 1.8; var grad = ctx.createRadialGradient(rn.proj.sx, rn.proj.sy, r, rn.proj.sx, rn.proj.sy, go); grad.addColorStop(0, "rgba(255,255,255," + (op * 0.55) + ")"); grad.addColorStop(0.5, "rgba(255,255,255," + (op * 0.2) + ")"); grad.addColorStop(1, "rgba(255,255,255,0)"); ctx.beginPath(); ctx.arc(rn.proj.sx, rn.proj.sy, go, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill(); }
    if (rn.note.type === 1) {
      // 环：先填充底色再挖黑心，避免笔触缺口
      ctx.beginPath(); ctx.arc(rn.proj.sx, rn.proj.sy, r, 0, Math.PI * 2);
      ctx.fillStyle = hslStr(rn.hue, 100, colorL, op);
      ctx.fill();
      ctx.beginPath(); ctx.arc(rn.proj.sx, rn.proj.sy, r * 2 / 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0," + op + ")";
      ctx.fill();
    } else if (rn.note.type === 2) {
      // 光团：渐近填满整个判定环，不留空隙
      var kr = r * 0.9;
      var grad2 = ctx.createRadialGradient(rn.proj.sx, rn.proj.sy, 0, rn.proj.sx, rn.proj.sy, kr);
      grad2.addColorStop(0, hslStr(rn.hue, 100, rn.dim ? 30 : 70, op * 0.95));
      grad2.addColorStop(0.7, hslStr(rn.hue, 100, rn.dim ? 25 : 55, op * 0.5));
      grad2.addColorStop(1, hslStr(rn.hue, 100, rn.dim ? 20 : 45, op * 0.15));
      ctx.beginPath(); ctx.arc(rn.proj.sx, rn.proj.sy, kr, 0, Math.PI * 2);
      ctx.fillStyle = grad2;
      ctx.fill();
      ctx.strokeStyle = hslStr(rn.hue, 100, rn.dim ? 30 : 65, op * 0.7);
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (rn.note.type === 3) {
      ctx.beginPath(); ctx.arc(rn.proj.sx, rn.proj.sy, r, 0, Math.PI * 2);
      ctx.fillStyle = hslStr(rn.hue, 80, colorL, op * 0.85);
      ctx.fill();
      ctx.strokeStyle = hslStr(rn.hue, 100, rn.dim ? 35 : 70, op);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  // Draw judgment rings (倒序：小号轨道在上层)
  for (var ti = N - 1; ti >= 0; ti--) {
    var track3 = state.tracks[ti], pos3 = getTrackPos(track3, gameTime);
    if (pos3.hidden) continue;
    var hue3 = hueForTrack(ti, N), scr = normToScreen(pos3.x, pos3.y);
    var shrink = getHoldRingShrinkValue(ti), effR = ringR * (1 - 0.2 * shrink);
    ctx.beginPath(); ctx.arc(scr.sx, scr.sy, effR, 0, Math.PI * 2); ctx.strokeStyle = hslStr(hue3, 100, 60, 0.85); ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(scr.sx, scr.sy, effR * 0.95, 0, Math.PI * 2); ctx.fillStyle = hslStr(hue3, 60, 40, 0.12); ctx.fill();
  }
  // Effects
  var nowSec = performance.now() / 1000;
  game.effects = game.effects.filter(function(eff) {
    var elapsed = nowSec - eff.startTime;
    if (elapsed > eff.duration) return false;
    var progress = elapsed / eff.duration, scr2 = normToScreen(eff.x, eff.y);
    if (eff.type === "perfect" || eff.type === "good") {
      var maxR = ringR * 2.2, r2 = ringR + (maxR - ringR) * progress, alpha = 1 - progress * progress;
      ctx.beginPath(); ctx.arc(scr2.sx, scr2.sy, r2, 0, Math.PI * 2);
      ctx.strokeStyle = eff.type === "perfect" ? hslStr(eff.hue, 100, 70, alpha) : "rgba(255,255,255," + alpha + ")";
      ctx.lineWidth = 3 * (1 - progress); ctx.stroke();
    }
    return true;
  });
  document.getElementById("comboDisplay").textContent = game.combo >= 3 ? game.combo + " Combo" : "";
  document.getElementById("scoreDisplay").textContent = pad(Math.round(game.score), 7);
  ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "11px monospace";
  ctx.fillText("T: " + gameTime.toFixed(2) + "s | FOV: " + state.fov + "° | Fs: " + state.sampleRateReal + "Hz", 6, H - 6);
}




