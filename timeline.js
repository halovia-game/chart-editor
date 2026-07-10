/* ============================================================
   timeline.js - 时间轴 Canvas + 交互 + 渲染
   依赖：state.js, presets.js, ui.js, notes.js
   ============================================================ */
"use strict";

var timeline = {
  canvas: null, ctx: null, W: 0, H: 0,
  viewStart: 0, viewEnd: 30,
  rulerH: 24, trackH: 28,
  draggingNote: null,
  draggingKF: null,           // {trackId, kfIdx, startX, origTime}
  playheadDrag: false,
  rightDragging: null,
  panning: false, panStartX: 0, panStartView: 0,
  hoveredTrack: -1, mouseTime: 0
};

function initTimeline() {
  timeline.canvas = document.getElementById("timelineCanvas");
  timeline.ctx = timeline.canvas.getContext("2d");
  var c = timeline.canvas;
  c.addEventListener("mousedown", onTimelineMouseDown);
  c.addEventListener("mousemove", onTimelineMouseMove);
  c.addEventListener("mouseup", onTimelineMouseUp);
  c.addEventListener("mouseleave", onTimelineMouseUp);
  c.addEventListener("contextmenu", function(e) { e.preventDefault(); });
  c.addEventListener("wheel", onTimelineWheel, { passive: false });
  c.addEventListener("dblclick", onTimelineDblClick);
}

function resizeTimeline() {
  if (!timeline.canvas) return;
  var wrap = document.getElementById("timelineWrap");
  var dpr = window.devicePixelRatio || 1;
  var w = wrap.clientWidth, h = wrap.clientHeight;
  timeline.W = w; timeline.H = h;
  timeline.canvas.width = w * dpr;
  timeline.canvas.height = h * dpr;
  timeline.canvas.style.width = w + "px";
  timeline.canvas.style.height = h + "px";
  timeline.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function timeToX(t) { return ((t - timeline.viewStart) / (timeline.viewEnd - timeline.viewStart)) * timeline.W; }
function xToTime(x) { var span = timeline.viewEnd - timeline.viewStart; return timeline.viewStart + (x / timeline.W) * span; }
function yToTrack(y) { if (y < timeline.rulerH) return -1; var idx = Math.floor((y - timeline.rulerH) / timeline.trackH); return (idx < 0 || idx >= state.tracks.length) ? -1 : idx; }
function trackToY(ti) { return timeline.rulerH + ti * timeline.trackH + timeline.trackH / 2; }

function getSnapStep() {
  var period = 1 / (state.sampleRateReal || 10);
  var span = timeline.viewEnd - timeline.viewStart;
  var k = Math.max(1, Math.round((span / 20) / period));
  var friendlyKs = [1,2,3,4,5,6,8,10,12,15,20,25,30,40,50,60,80,100,120,150,200,300,400,500,1000];
  var bestK = 1, bestDiff = Infinity;
  for (var fi = 0; fi < friendlyKs.length; fi++) { var diff = Math.abs(friendlyKs[fi] - k); if (diff < bestDiff) { bestDiff = diff; bestK = friendlyKs[fi]; } }
  return bestK * period;
}
function snapTime(t, e) {
  if (!document.getElementById("chkSnap").checked) return t;
  if (e && e.altKey) return t;
  var step = getSnapStep();
  return Math.round(t / step) * step;
}

function findKeyframeAt(x, y, tol) {
  if (tol === undefined) tol = Math.max(4, timeline.trackH * 0.125);
  var ti = yToTrack(y);
  if (ti < 0 || ti >= state.tracks.length) return null;
  var track = state.tracks[ti];
  if (!track || !track.keyframes) return null;
  var kfs = track.keyframes;
  for (var ki = 0; ki < kfs.length; ki++) {
    var kx = timeToX(kfs[ki].time);
    if (Math.abs(kx - x) <= tol) return { trackId: ti, kfIdx: ki };
  }
  return null;
}

function findNoteAt(x, y) {
  var ti = yToTrack(y);
  if (ti < 0) return null;
  var sc = timeline.trackH / 28;
  if (sc < 0.5) sc = 0.5;
  var ty = trackToY(ti);
  for (var i = state.notes.length - 1; i >= 0; i--) {
    var n = state.notes[i];
    if (n.track !== ti) continue;
    if (n.type === 3 && n.endTime !== null) {
      var ex = timeToX(n.endTime);
      if (Math.abs(ex - x) <= Math.max(5, 2.5 * sc) && Math.abs(y - ty) < timeline.trackH * 0.4) return { noteIdx: i, hit: "tail" };
    }
  }
  for (var j = state.notes.length - 1; j >= 0; j--) {
    var n2 = state.notes[j];
    if (n2.track !== ti) continue;
    var nx = timeToX(n2.time);
    if (Math.abs(nx - x) <= Math.max(7, 3.5 * sc) && Math.abs(y - ty) < timeline.trackH * 0.4) return { noteIdx: j, hit: "head" };
  }
  for (var k = state.notes.length - 1; k >= 0; k--) {
    var n3 = state.notes[k];
    if (n3.track !== ti || n3.type !== 3 || n3.endTime === null) continue;
    var nx2 = timeToX(n3.time), ex2 = timeToX(n3.endTime);
    if (x >= nx2 && x <= ex2 && Math.abs(y - ty) < timeline.trackH * 0.25) return { noteIdx: k, hit: "body" };
  }
  return null;
}

// === TIMELINE EVENTS ===
function onTimelineMouseDown(e) {
  var rect = timeline.canvas.getBoundingClientRect();
  var x = e.clientX - rect.left, y = e.clientY - rect.top;
  var ti = yToTrack(y);
  if (e.button === 2) {
    if (ti < 0) return;
    if (findNoteAt(x, y)) return;
    var t = snapTime(xToTime(x), e);
    timeline.rightDragging = { trackId: ti, startTime: t, startX: x, startY: y, moved: false };
    return;
  }
  if (e.button === 0) {
    var cx = timeToX(game.gameTime);
    if (y < timeline.rulerH || (cx >= 0 && cx <= timeline.W && Math.abs(x - cx) < 10)) {
      var t2 = Math.max(0, Math.min(state.duration, xToTime(x)));
      game.gameTime = t2; game.startGameTime = t2; game.startRealTime = performance.now();
      game.judgments = {}; game.autoHits = new Set(); game.combo = 0; game.score = 0;
      updateTimeDisplay();
      if (game.playing && state.audioBuffer) startAudioAt(t2);
      timeline.playheadDrag = true;
      return;
    }
    if (ti < 0) { timeline.panning = true; timeline.panStartX = x; timeline.panStartView = timeline.viewStart; return; }
    // Ctrl+左键拖关键帧，普通左键拖音符
    if (e.ctrlKey) {
      var kfHit = findKeyframeAt(x, y);
      if (kfHit && kfHit.kfIdx > 0 && kfHit.kfIdx < state.tracks[kfHit.trackId].keyframes.length - 1) {
        var kfs = state.tracks[kfHit.trackId].keyframes;
        timeline.draggingKF = { trackId: kfHit.trackId, kfIdx: kfHit.kfIdx, startX: x, origTime: kfs[kfHit.kfIdx].time };
        return;
      }
    }
    // Ctrl 按下时不触发音符拖拽
    if (e.ctrlKey) return;
    var noteHit = findNoteAt(x, y);
    if (noteHit) {
      var n = state.notes[noteHit.noteIdx];
      timeline.draggingNote = { noteIdx: noteHit.noteIdx, mode: noteHit.hit === "tail" ? "resize" : "move", startX: x, startY: y, origTime: n.time, origEnd: n.endTime, origTrack: n.track, moved: false };
      return;
    }
    var t3 = snapTime(xToTime(x), e);
    if (t3 < 0 || t3 > state.duration) return;
    addNote(ti, 1, t3);
  }
}

function onTimelineMouseMove(e) {
  var rect = timeline.canvas.getBoundingClientRect();
  var x = e.clientX - rect.left, y = e.clientY - rect.top;
  timeline.mouseTime = xToTime(x);
  timeline.hoveredTrack = yToTrack(y);
  if (timeline.panning) {
    var dt = (timeline.panStartX - x) * (timeline.viewEnd - timeline.viewStart) / timeline.W;
    var span = timeline.viewEnd - timeline.viewStart;
    timeline.viewStart = timeline.panStartView + dt; timeline.viewEnd = timeline.viewStart + span; clampTimelineView(); return;
  }
  if (timeline.draggingNote) {
    var dn = timeline.draggingNote, note = state.notes[dn.noteIdx];
    var dxPx = x - dn.startX;
    if (Math.abs(dxPx) > 2 || Math.abs(y - dn.startY) > 2) dn.moved = true;
    var dt2 = dxPx * (timeline.viewEnd - timeline.viewStart) / timeline.W;
    if (dn.mode === "resize") {
      var newEnd = snapTime(dn.origEnd + dt2, e); newEnd = Math.max(note.time + 0.01, Math.min(state.duration, newEnd));
      if (typeof hasHoldOverlap === "function" && hasHoldOverlap(note.track, note.time, newEnd, dn.noteIdx)) return;
      note.endTime = newEnd;
    }
    else {
      var newTime = snapTime(dn.origTime + dt2, e); newTime = Math.max(0, Math.min(state.duration, newTime));
      var newTrack = yToTrack(y);
      if (newTrack < 0) newTrack = note.track;
      var chkEnd = (note.type === 3 && dn.origEnd !== null) ? dn.origEnd + (newTime - dn.origTime) : null;
      if (chkEnd !== null) chkEnd = Math.min(state.duration, chkEnd);
      if (typeof hasHoldOverlap === "function" && hasHoldOverlap(newTrack, newTime, chkEnd, dn.noteIdx)) return;
      var delta = newTime - dn.origTime; note.time = newTime;
      if (note.type === 3 && dn.origEnd !== null) note.endTime = Math.min(state.duration, dn.origEnd + delta);
      if (newTrack >= 0 && newTrack < state.tracks.length) note.track = newTrack;
    }
    scheduleSizeEstimate(); return;
  }
  if (timeline.draggingKF) {
    var dkf = timeline.draggingKF;
    var dxPx = x - dkf.startX;
    var dt = dxPx * (timeline.viewEnd - timeline.viewStart) / timeline.W;
    var track = state.tracks[dkf.trackId];
    if (track) {
      var kfs = track.keyframes;
      var newTime = snapTime(dkf.origTime + dt, e);
      newTime = Math.max(0, Math.min(state.duration, newTime));
      if (dkf.kfIdx > 0) newTime = Math.max(newTime, kfs[dkf.kfIdx - 1].time + 0.001);
      if (dkf.kfIdx < kfs.length - 1) newTime = Math.min(newTime, kfs[dkf.kfIdx + 1].time - 0.001);
      kfs[dkf.kfIdx].time = newTime;
      scheduleSizeEstimate();
      if (typeof renderTrackPanels === "function") renderTrackPanels();
    }
    return;
  }
  if (timeline.playheadDrag) {
    var newT = Math.max(0, Math.min(state.duration, snapTime(xToTime(x), e)));
    // 循环模式下不允许拖出 AB 区间
    if (state.loopEnabled && state.loopA !== null && state.loopB !== null) {
      newT = Math.max(state.loopA, Math.min(state.loopB, newT));
    }
    game.gameTime = newT; game.startGameTime = newT; game.startRealTime = performance.now();
    game.judgments = {}; game.autoHits = new Set(); game.combo = 0; game.score = 0;
    updateTimeDisplay();
    return;
  }
  if (timeline.rightDragging && Math.abs(x - timeline.rightDragging.startX) > 5) timeline.rightDragging.moved = true;
}

function onTimelineMouseUp(e) {
  if (timeline.rightDragging) {
    var rd = timeline.rightDragging;
    var rect = timeline.canvas.getBoundingClientRect();
    var x = e.clientX !== undefined ? e.clientX - rect.left : rd.startX;
    if (rd.moved) {
      var t1 = snapTime(xToTime(x), e), start = Math.min(rd.startTime, t1), end = Math.max(rd.startTime, t1);
      if (end - start > 0.005) addNote(rd.trackId, 3, start, end);
      else addNote(rd.trackId, 2, rd.startTime);
    } else { addNote(rd.trackId, 2, rd.startTime); }
    timeline.rightDragging = null;
  }
  timeline.playheadDrag = false;
  if (timeline.draggingKF) timeline.draggingKF = null;
  if (timeline.draggingNote) timeline.draggingNote = null;
  timeline.panning = false;
}

function onTimelineWheel(e) {
  e.preventDefault();
  var rect = timeline.canvas.getBoundingClientRect();
  var x = e.clientX - rect.left;
  if (e.ctrlKey) {
    var t = xToTime(x), span = timeline.viewEnd - timeline.viewStart;
    var factor = e.deltaY < 0 ? 0.85 : 1.18;
    var newSpan = Math.max(0.05, Math.min(state.duration * 2, span * factor));
    timeline.viewStart = t - ((t - timeline.viewStart) / span) * newSpan; timeline.viewEnd = timeline.viewStart + newSpan; clampTimelineView();
  } else {
    var dx = (e.deltaY !== 0 ? e.deltaY : e.deltaX) * 0.5;
    var dt = dx * (timeline.viewEnd - timeline.viewStart) / timeline.W;
    timeline.viewStart += dt; timeline.viewEnd += dt; clampTimelineView();
  }
}

function clampTimelineView() {
  var span = timeline.viewEnd - timeline.viewStart;
  if (timeline.viewStart < -1) { timeline.viewStart = -1; timeline.viewEnd = timeline.viewStart + span; }
  if (timeline.viewEnd > state.duration + 1) { timeline.viewEnd = state.duration + 1; timeline.viewStart = timeline.viewEnd - span; }
}

function onTimelineDblClick(e) {
  var rect = timeline.canvas.getBoundingClientRect();
  var x = e.clientX - rect.left, y = e.clientY - rect.top;
  var noteHit = findNoteAt(x, y);
  if (noteHit) openNoteEditModal(noteHit.noteIdx);
}

// === TIMELINE RENDER ===
function renderTimeline() {
  if (!timeline.canvas) return;
  var ctx = timeline.ctx, W = timeline.W, H = timeline.H;
  ctx.clearRect(0, 0, W, H);
  var snapInfo = document.getElementById("snapInfo");
  var N = state.tracks.length;
  timeline.trackH = N > 0 ? (H - timeline.rulerH) / N : 28;
  if (timeline.trackH < 18) timeline.trackH = 18;
  if (snapInfo) { var step = getSnapStep(), k = Math.round(step * state.sampleRateReal); snapInfo.textContent = "步长: " + k + "周期 (" + step.toFixed(3) + "s)"; }
  var sc = timeline.trackH / 28;
  if (sc < 0.5) sc = 0.5;
  ctx.fillStyle = "#0d1b2a"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#1b2838"; ctx.fillRect(0, 0, W, timeline.rulerH);
  var span = timeline.viewEnd - timeline.viewStart, pxPerSec = W / span;
  // 能量波形（插值绘制，不跳变）
  if (typeof audioEnergy !== "undefined" && audioEnergy && audioEnergy.data && W > 0) {
    var ae = audioEnergy;
    var barH = H - timeline.rulerH;
    var lenData = ae.data.length;
    var bps = ae.binsPerSec;
    // 采样步长：吸附步长的 1/4，以像素位置为基准绘制
    var stepPx = Math.max(1, Math.round(W / 200));
    var barW = timeline.viewEnd - timeline.viewStart;
    
    function getValAt(arr, time) {
      var idx = time * bps;
      var fi = Math.floor(idx);
      if (fi < 0) return arr[0];
      if (fi >= lenData - 1) return arr[lenData - 1];
      var frac = idx - fi;
      return arr[fi] * (1 - frac) + arr[fi + 1] * frac;
    }
    
    function drawWave(arr, fillColor, strokeColor, fromBottom) {
      var edgeY = fromBottom ? H : timeline.rulerH;
      // 填充：从边缘到曲线再到边缘
      ctx.beginPath();
      ctx.moveTo(0, edgeY);
      var firstVal = getValAt(arr, timeline.viewStart);
      var firstH = Math.max(1, firstVal * barH * 0.85);
      ctx.lineTo(0, fromBottom ? H - firstH : timeline.rulerH + firstH);
      for (var px = stepPx; px < W; px += stepPx) {
        var t = timeline.viewStart + (px / W) * barW;
        var bh = Math.max(1, getValAt(arr, t) * barH * 0.85);
        ctx.lineTo(px, fromBottom ? H - bh : timeline.rulerH + bh);
      }
      ctx.lineTo(W, edgeY);
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();
      // 轮廓线
      ctx.beginPath();
      var fv = getValAt(arr, timeline.viewStart);
      ctx.moveTo(0, fromBottom ? H - Math.max(1, fv * barH * 0.85) : timeline.rulerH + Math.max(1, fv * barH * 0.85));
      for (var px2 = stepPx; px2 < W; px2 += stepPx) {
        var t2 = timeline.viewStart + (px2 / W) * barW;
        var bh2 = Math.max(1, getValAt(arr, t2) * barH * 0.85);
        ctx.lineTo(px2, fromBottom ? H - bh2 : timeline.rulerH + bh2);
      }
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    
    drawWave(ae.data, "rgba(233,69,96,0.12)", "rgba(233,69,96,0.25)", true);
    if (ae.low) drawWave(ae.low, "rgba(231,76,60,0.10)", "rgba(231,76,60,0.20)", true);
    if (ae.high) drawWave(ae.high, "rgba(52,152,219,0.08)", "rgba(52,152,219,0.18)", false);
  }
  var majorCandidates = [60,30,20,10,5,2,1,0.5,0.2,0.1,0.05,0.02,0.01,0.005,0.002,0.001];
  var majorStep = 0.001;
  for (var ci = 0; ci < majorCandidates.length; ci++) { var c = majorCandidates[ci]; if (c * pxPerSec <= 100 && c * pxPerSec >= 40) { majorStep = c; break; } }
  if (majorStep === 0.001) { var bestDiff = Infinity; for (var cj = 0; cj < majorCandidates.length; cj++) { var px = majorCandidates[cj] * pxPerSec; if (px < 20) continue; var diff = Math.abs(px - 80); if (diff < bestDiff) { bestDiff = diff; majorStep = majorCandidates[cj]; } } }
  var subDiv = 5; if (majorStep * pxPerSec / 5 < 8) subDiv = 4; if (majorStep * pxPerSec / subDiv < 8) subDiv = 2; if (majorStep * pxPerSec / subDiv < 6) subDiv = 1;
  var minorStep = majorStep / subDiv;
  ctx.strokeStyle = "rgba(255,255,255,0.1)"; ctx.lineWidth = 1;
  var firstMinor = Math.floor(timeline.viewStart / minorStep) * minorStep;
  for (var t = firstMinor; t <= timeline.viewEnd; t += minorStep) { var xm = timeToX(t); ctx.beginPath(); ctx.moveTo(xm, timeline.rulerH - 4); ctx.lineTo(xm, timeline.rulerH); ctx.stroke(); }
  ctx.fillStyle = "#e0e0e0"; ctx.font = "11px monospace";
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  var firstMajor = Math.floor(timeline.viewStart / majorStep) * majorStep;
  var lastLabelEnd = -100;
  for (var t2 = firstMajor; t2 <= timeline.viewEnd; t2 += majorStep) {
    var xM = timeToX(t2);
    if (xM < 0) continue;
    ctx.beginPath(); ctx.moveTo(xM, 0); ctx.lineTo(xM, timeline.rulerH); ctx.stroke();
    var label = t2.toFixed(majorStep < 1 ? 2 : 1) + "s";
    if (xM + 2 > lastLabelEnd) { ctx.fillText(label, xM + 2, 11); lastLabelEnd = xM + 2 + ctx.measureText(label).width + 6; }
  }
  if (document.getElementById("chkSnap").checked) {
    var snapStep = getSnapStep(), fs = Math.ceil(timeline.viewStart / snapStep) * snapStep;
    ctx.strokeStyle = "rgba(120,180,255,0.10)"; ctx.lineWidth = 1;
    for (var t3 = fs; t3 <= timeline.viewEnd; t3 += snapStep) { var xs = timeToX(t3); ctx.beginPath(); ctx.moveTo(xs, timeline.rulerH); ctx.lineTo(xs, H); ctx.stroke(); }
  }
  if (state.bpm > 0) {
    var beatDur = 60 / state.bpm, beatPx = beatDur * pxPerSec;
    var beatDivs = [1,2,3,4,6,8,12,16], activeDiv = 1;
    for (var di = 0; di < beatDivs.length; di++) { if (beatPx / beatDivs[di] >= 12) activeDiv = beatDivs[di]; }
    if (activeDiv > 1) { var subStep = beatDur / activeDiv; var fs2 = Math.ceil(timeline.viewStart / subStep) * subStep; ctx.strokeStyle = "rgba(233,69,96,0.08)"; ctx.lineWidth = 1; for (var t4 = fs2; t4 <= timeline.viewEnd; t4 += subStep) { var beatIdx = Math.round(t4 / subStep); if (beatIdx % activeDiv === 0) continue; var xb = timeToX(t4); ctx.beginPath(); ctx.moveTo(xb, timeline.rulerH); ctx.lineTo(xb, H); ctx.stroke(); } }
    var fb = Math.ceil(timeline.viewStart / beatDur) * beatDur; ctx.strokeStyle = "rgba(233,69,96,0.25)"; ctx.lineWidth = 1;
    for (var bt = fb; bt <= timeline.viewEnd; bt += beatDur) { var xB = timeToX(bt); ctx.beginPath(); ctx.moveTo(xB, timeline.rulerH); ctx.lineTo(xB, H); ctx.stroke(); }
  }
  for (var ti = 0; ti < N; ti++) {
    var y = trackToY(ti), hue = hueForTrack(ti, N);
    if (ti === timeline.hoveredTrack) { ctx.fillStyle = "rgba(255,255,255,0.03)"; ctx.fillRect(0, timeline.rulerH + ti * timeline.trackH, W, timeline.trackH); }
    ctx.strokeStyle = hslStr(hue, 100, 55, 0.7); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.fillStyle = hslStr(hue, 100, 65, 0.9); ctx.font = "bold " + Math.max(10, 5 * sc) + "px monospace"; ctx.fillText("T" + ti, 2, y - 4);
    var trackKF = state.tracks[ti];
    if (trackKF && trackKF.keyframes) {
      var kfs = trackKF.keyframes;
      for (var ki = 0; ki < kfs.length; ki++) {
        var kx = timeToX(kfs[ki].time);
        if (kx < -10 || kx > W + 10) continue;
        var ds = Math.max(3, 1.5 * sc);
        ctx.fillStyle = hslStr(hue, 100, 65, 0.9);
        ctx.strokeStyle = hslStr(hue, 100, 45, 0.6);
        ctx.lineWidth = 1.5;
        var isKF = timeline.draggingKF && timeline.draggingKF.trackId === ti && timeline.draggingKF.kfIdx === ki;
        if (isKF) { ctx.fillStyle = "#fff"; ctx.strokeStyle = "var(--accent)"; ctx.lineWidth = 2; }
        ctx.beginPath(); ctx.moveTo(kx, y - ds); ctx.lineTo(kx + ds, y); ctx.lineTo(kx, y + ds); ctx.lineTo(kx - ds, y); ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
    }
  }
  var tsGroups = {};
  for (var ni = 0; ni < state.notes.length; ni++) { var ts = secToTimestamp(state.notes[ni].time); if (!tsGroups[ts]) tsGroups[ts] = []; tsGroups[ts].push(ni); }
  for (var nj = 0; nj < state.notes.length; nj++) {
    var n = state.notes[nj];
    if (n.track >= N) continue;
    var x = timeToX(n.time), y2 = trackToY(n.track), hue2 = hueForTrack(n.track, N);
    var ts2 = secToTimestamp(n.time), isSimul = tsGroups[ts2] && tsGroups[ts2].length > 1;
    if (x < -20 || x > W + 20) { if (n.type === 3 && n.endTime !== null) { var ex = timeToX(n.endTime); if (ex < -20) continue; if (x > W + 20 && ex > W + 20) continue; } else continue; }
    if (n.type === 1) {
      var nr = Math.max(6, 3 * sc);
      ctx.beginPath(); ctx.arc(x, y2, nr, 0, Math.PI * 2); ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fill();
      ctx.strokeStyle = hslStr(hue2, 100, 65, 1); ctx.lineWidth = 2; ctx.stroke();
      if (isSimul) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y2, nr + 2, 0, Math.PI * 2); ctx.stroke(); }
    } else if (n.type === 2) {
      var kr = Math.max(5, 2.5 * sc);
      var grad = ctx.createRadialGradient(x, y2, 0, x, y2, kr);
      grad.addColorStop(0, hslStr(hue2, 100, 70, 1)); grad.addColorStop(0.6, hslStr(hue2, 100, 55, 0.5)); grad.addColorStop(1, hslStr(hue2, 100, 45, 0));
      ctx.beginPath(); ctx.arc(x, y2, kr, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
      if (isSimul) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y2, kr + 2, 0, Math.PI * 2); ctx.stroke(); }
    } else if (n.type === 3) {
      var hnr = Math.max(6, 3 * sc);
      var hbh = Math.max(4, 2 * sc);
      var ex2 = n.endTime !== null ? timeToX(n.endTime) : x;
      ctx.fillStyle = hslStr(hue2, 80, 50, 0.55); ctx.beginPath(); ctx.moveTo(x, y2 - hbh); ctx.lineTo(ex2, y2 - hbh); ctx.arc(ex2, y2, hbh, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x, y2 + hbh); ctx.arc(x, y2, hbh, Math.PI / 2, -Math.PI / 2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y2, hnr, 0, Math.PI * 2); ctx.fillStyle = hslStr(hue2, 100, 55, 1); ctx.fill(); ctx.strokeStyle = hslStr(hue2, 100, 75, 1); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = hslStr(hue2, 100, 75, 0.8); ctx.fillRect(ex2 - 1, y2 - hbh, 2, hbh * 2);
      if (isSimul) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y2, hnr + 2, 0, Math.PI * 2); ctx.stroke(); }
    }
  }
  // 拖拽中的关键帧置于音符上层
  if (timeline.draggingKF) {
    var dkf = timeline.draggingKF;
    var dkfTrack = state.tracks[dkf.trackId];
    if (dkfTrack && dkfTrack.keyframes[dkf.kfIdx]) {
      var dkfKF = dkfTrack.keyframes[dkf.kfIdx];
      var dkx = timeToX(dkfKF.time);
      var dky = trackToY(dkf.trackId);
      var dds = Math.max(3, 1.5 * sc);
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "var(--accent)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(dkx, dky - dds); ctx.lineTo(dkx + dds, dky); ctx.lineTo(dkx, dky + dds); ctx.lineTo(dkx - dds, dky); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
  }
  var cx = timeToX(game.gameTime);
  // AB 循环区域（完整区间或单点标记）
  var abActive = state.loopEnabled || game.playFromAFlag;
  if (state.loopA !== null || state.loopB !== null) {
    var ax = state.loopA !== null ? timeToX(state.loopA) : -100;
    var bx = state.loopB !== null ? timeToX(state.loopB) : -100;
    if (state.loopA !== null && state.loopB !== null && state.loopB > state.loopA) {
      if (bx > 0 && ax < W) {
        ctx.fillStyle = "rgba(46,204,113," + (abActive ? 0.08 : 0.03) + ")";
        ctx.fillRect(Math.max(0, ax), 0, Math.min(W, bx) - Math.max(0, ax), H);
      }
    }
    var lineAlpha = abActive ? 0.5 : 0.2;
    ctx.font = "10px monospace";
    if (ax >= 0 && ax <= W) {
      ctx.strokeStyle = "rgba(46,204,113," + lineAlpha + ")"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, H); ctx.stroke();
      ctx.fillStyle = "rgba(46,204,113,0.7)"; ctx.fillText("A", ax + 2, 11);
    }
    if (bx >= 0 && bx <= W && (state.loopB !== state.loopA || state.loopA === null)) {
      ctx.strokeStyle = "rgba(46,204,113," + lineAlpha + ")"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, H); ctx.stroke();
      ctx.fillStyle = "rgba(46,204,113,0.7)"; ctx.fillText("B", bx + 2, 11);
    }
  }
  if (cx >= 0 && cx <= W) {
    ctx.strokeStyle = "#e94560"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
    ctx.fillStyle = "#e94560"; ctx.beginPath(); ctx.moveTo(cx - 5, 0); ctx.lineTo(cx + 5, 0); ctx.lineTo(cx, 6); ctx.closePath(); ctx.fill();
  }
  if (timeline.hoveredTrack >= 0) { var hx = timeToX(snapTime(timeline.mouseTime)); ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx, timeline.rulerH); ctx.lineTo(hx, H); ctx.stroke(); }
}
