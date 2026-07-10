/* ============================================================
   io.js - 导入/导出 (.hvp / .hvf)
   依赖：state.js, presets.js, ui.js, notes.js
   ============================================================ */
"use strict";

function pad(num, len) {
  var s = Math.round(num).toString();
  while (s.length < len) s = "0" + s;
  if (s.length > len) s = s.slice(s.length - len);
  return s;
}

function sampleAllTracks() {
  var frames = totalFrames();
  var hz = state.sampleRateReal;
  var N = state.tracks.length;
  var data = [];
  for (var f = 0; f < frames; f++) {
    var t = f / hz;
    var row = [];
    for (var ti = 0; ti < N; ti++) {
      var pos = evalTrackAt(state.tracks[ti], t);
      row.push({ x: Math.max(-2, Math.min(2, pos.x)), y: Math.max(-2, Math.min(2, pos.y)), hidden: !!pos.hidden });
    }
    data.push(row);
  }
  return data;
}

function encodeHVP(silent) {
  if (silent === undefined) silent = false;
  syncGlobals();
  var errs = [];
  var N = state.tracks.length;
  var frames = totalFrames();
  var Fs = sampleRateStored();
  var off = offsetStored();
  if (state.bpm < 1 || state.bpm > 999) errs.push("BPM超出范围(1-999)");
  if (Fs < 1 || Fs > 999) errs.push("采样频率超出范围(0.1-99.9)");
  if (off < 0 || off > 999) errs.push("偏移超出可表示范围");
  if (N < 1 || N > 99) errs.push("轨道数超出范围");
  if (frames < 1 || frames > 99999) errs.push("采样帧数超出5位范围");
  for (var i = 0; i < state.notes.length; i++) {
    var n = state.notes[i];
    if (n.track < 0 || n.track >= N) errs.push("音符" + i + "轨道超出范围");
    var ts = secToTimestamp(n.time);
    if (ts < 0 || ts > 99999) errs.push("音符" + i + "时间戳超出5位范围");
    if (n.type === 3) { var ets = secToTimestamp((n.endTime !== null ? n.endTime : n.time)); if (ets < 0 || ets > 99999) errs.push("音符" + i + "Hold结束时间戳超出5位范围"); }
  }
  if (state.notes.length > 99999999) errs.push("音符数超出8位范围");
  if (errs.length > 0) { if (!silent) showToast("导出错误: " + errs[0], "error"); return null; }

  var sampled = sampleAllTracks();
  for (var j = 0; j < state.notes.length; j++) {
    var n2 = state.notes[j];
    var ts2 = secToTimestamp(n2.time);
    var f = Math.min(ts2, frames - 1);
    if (sampled[f] && sampled[f][n2.track] && sampled[f][n2.track].hidden) {
      if (!silent) showToast("音符" + j + "命中帧轨道处于隐藏状态", "error"); return null;
    }
  }

  var sortedNotes = state.notes.slice().sort(function(a, b) {
    var ta = secToTimestamp(a.time), tb = secToTimestamp(b.time);
    if (ta !== tb) return ta - tb;
    return a.track - b.track;
  });

  var s = "";
  s += pad(state.bpm, 3); s += pad(Fs, 3); s += pad(off, 3);
  s += pad(N, 2); s += pad(frames, 5);
  var prevCoord = new Array(N).fill(null);
  for (var fi = 0; fi < frames; fi++) {
    for (var ti = 0; ti < N; ti++) {
      var cell = sampled[fi][ti];
      var prev = prevCoord[ti];
      if (cell.hidden) {
        if (prev && prev.hidden) { s += "0"; } else { s += "9"; prevCoord[ti] = { hidden: true }; }
        continue;
      }
      var sx = coordToStored(cell.x), sy = coordToStored(cell.y);
      if (prev && !prev.hidden && prev.sx === sx && prev.sy === sy) { s += "0"; }
      else { s += pad(sx, 4) + pad(sy, 4); prevCoord[ti] = { sx: sx, sy: sy, hidden: false }; }
    }
  }
  s += pad(sortedNotes.length, 8);
  for (var ni = 0; ni < sortedNotes.length; ni++) {
    var note = sortedNotes[ni];
    s += pad(note.track, 2); s += pad(note.type, 1); s += pad(secToTimestamp(note.time), 5);
    if (note.type === 3) { var et = (note.endTime !== null && note.endTime !== undefined) ? note.endTime : note.time; s += pad(secToTimestamp(et), 5); }
  }
  return s;
}

function decodeHVP(str) {
  str = str.replace(/\s/g, "");
  if (!/^\d+$/.test(str)) throw new Error("HVP必须全为数字");
  var pos = 0;
  function readDigits(n) { if (pos + n > str.length) throw new Error("数据不足: 需要" + n + "位在位置" + pos); var v = str.substr(pos, n); pos += n; return parseInt(v, 10); }
  function peek() { return str[pos]; }
  var bpm = readDigits(3), sampleRate = readDigits(3), offset = readDigits(3);
  var trackCount = readDigits(2), frameCount = readDigits(5);
  var pathData = [], prevState = new Array(trackCount).fill(null);
  for (var fi = 0; fi < frameCount; fi++) {
    var row = [];
    for (var ti = 0; ti < trackCount; ti++) {
      if (pos >= str.length) throw new Error("路径数据不足: 帧" + fi + "轨道" + ti);
      var c = peek();
      if (c === "0") { pos++; if (prevState[ti] === null) throw new Error("轨道" + ti + "首帧不能为0"); row.push({ x: prevState[ti].x, y: prevState[ti].y, hidden: prevState[ti].hidden }); }
      else if (c === "9") { pos++; row.push({ x: 0, y: 0, hidden: true }); prevState[ti] = { x: 0, y: 0, hidden: true }; }
      else { var sx = readDigits(4), sy = readDigits(4); var cell = { x: storedToCoord(sx), y: storedToCoord(sy), hidden: false }; row.push(cell); prevState[ti] = cell; }
    }
    pathData.push(row);
  }
  var noteCount = readDigits(8), hz = sampleRate / 10, notes = [];
  for (var ni = 0; ni < noteCount; ni++) {
    var track = readDigits(2), type = readDigits(1), ts = readDigits(5), time = ts / hz, endTime = null;
    if (type === 3) endTime = readDigits(5) / hz;
    notes.push({ track: track, type: type, time: time, endTime: endTime });
  }
  return { bpm: bpm, sampleRate: sampleRate, offset: offset, trackCount: trackCount, frameCount: frameCount, pathData: pathData, notes: notes };
}

function exportHVP() {
  try { var hvp = encodeHVP(); if (!hvp) return; downloadFile("chart.hvp", hvp); showToast("已导出 .hvp (" + hvp.length + " 字符)", "success"); }
  catch (e) { showToast("导出错误: " + e.message, "error"); }
}

function copyHVP() {
  try { var hvp = encodeHVP(); if (!hvp) return; navigator.clipboard.writeText(hvp).then(function() { showToast("已复制 (" + hvp.length + " 字符)", "success"); }).catch(function(err) { showToast("复制失败", "error"); }); }
  catch (e) { showToast("复制错误: " + e.message, "error"); }
}

function exportHVF() {
  syncGlobals();
  var hvf = { version: "2.0", meta: { bpm: state.bpm, sampleRateReal: state.sampleRateReal, offsetSec: state.offsetSec, duration: state.duration, fov: state.fov, audioPath: state.audioPath || undefined }, tracks: state.tracks.map(function(t) { return { id: t.id, keyframes: t.keyframes ? t.keyframes.map(function(k) { return { time: k.time, x: k.x, y: k.y, hidden: !!k.hidden }; }) : [], segmentPresets: t.segmentPresets ? t.segmentPresets.map(function(s) { return { preset: s.preset, params: Object.assign({}, s.params) }; }) : [] }; }), notes: state.notes.map(function(n) { return { track: n.track, type: n.type, time: n.time, endTime: n.endTime }; }) };
  downloadFile("chart.hvf", JSON.stringify(hvf, null, 2));
  showToast("已导出 .hvf", "success");
}

function downloadFile(name, content) {
  var blob = new Blob([content], { type: "text/plain" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function doImport() {
  var format = document.getElementById("importFormat").value;
  var file = document.getElementById("importFile").files[0];
  var text = document.getElementById("importText").value.trim();
  if (file) {
    // 根据文件扩展名自动匹配格式
    var ext = file.name.split(".").pop().toLowerCase();
    if (ext === "hvp") document.getElementById("importFormat").value = "hvp";
    else if (ext === "hvf" || ext === "json") document.getElementById("importFormat").value = "hvf";
    format = document.getElementById("importFormat").value;
    var reader = new FileReader(); reader.onload = function(e) { processImport(format, e.target.result); }; reader.readAsText(file);
  }
  else if (text) { processImport(format, text); }
  else { showToast("请粘贴内容或上传文件", "error"); }
}

function processImport(format, content) {
  try { if (format === "hvf") importHVF(content); else importHVP(content); closeImportModal(); showToast("导入成功", "success"); }
  catch (e) { showToast("导入失败: " + e.message, "error"); }
}

function importHVF(content) {
  var hvf = JSON.parse(content);
  if (!hvf.meta || !hvf.tracks) throw new Error("无效HVF格式");
  if (typeof pushUndo === "function") pushUndo();
  state.bpm = hvf.meta.bpm || 120; state.sampleRateReal = hvf.meta.sampleRateReal || 10.0;
  state.offsetSec = hvf.meta.offsetSec || 0; state.duration = hvf.meta.duration || 30; state.fov = hvf.meta.fov || 55;
  state.tracks = hvf.tracks.map(function(t, i) {
    return { id: i, keyframes: (t.keyframes || []).map(function(k) { return { time: k.time, x: k.x, y: k.y, hidden: !!k.hidden }; }), segmentPresets: (t.segmentPresets || []).map(function(s) { var params = {}; var preset = PRESETS[s.preset]; if (preset && preset.params) { preset.params.forEach(function(pk) { var raw = (s.params && s.params[pk] !== undefined) ? s.params[pk] : PARAM_DEFAULTS[pk]; params[pk] = (pk === "funcX" || pk === "funcY" || pk === "xExpr" || pk === "yExpr") ? raw : toExpr(raw, PARAM_DEFAULTS[pk]); }); } return { preset: s.preset, params: params }; }) };
  });
  state.notes = (hvf.notes || []).map(function(n) { return { track: n.track, type: n.type, time: n.time, endTime: n.endTime || null }; });
  state.audioPath = hvf.meta.audioPath || "";
  if (state.audioPath) { showToast("关联音频: " + state.audioPath + "，尝试自动加载……", "info"); setTimeout(function() { if (typeof loadAudioFromPath === "function") loadAudioFromPath(state.audioPath); }, 100); }
  state.openedTracks = state.tracks.length > 0 ? [state.tracks[0].id] : [];
  if (typeof applyStateToUI === "function") applyStateToUI();
}

function importHVP(content) {
  var d = decodeHVP(content);
  if (typeof pushUndo === "function") pushUndo();
  state.bpm = d.bpm; state.sampleRateReal = d.sampleRate / 10; state.offsetSec = (d.offset - 500) / state.sampleRateReal;
  state.duration = (d.frameCount - 1) / state.sampleRateReal;
  state.tracks = [];
  for (var ti = 0; ti < d.trackCount; ti++) state.tracks.push({ id: ti, keyframes: [], segmentPresets: [], _sampledPath: d.pathData.map(function(row) { return { x: row[ti].x, y: row[ti].y, hidden: row[ti].hidden }; }) });
  state.notes = d.notes;
  state.openedTracks = state.tracks.length > 0 ? [state.tracks[0].id] : [];
  if (typeof applyStateToUI === "function") applyStateToUI();
  showToast("HVP导入: 路径为采样数据，无法还原原函数", "warn");
}
