/* ============================================================
   tracks.js - 轨道管理 + 面板渲染 (v4R keyframe 模型)
   依赖：state.js, presets.js, validation.js, ui.js
   ============================================================ */
"use strict";

// === TRACK DIRECTORY & PANELS ===

function applyStateToUI() {
  document.getElementById("gBPM").value = state.bpm;
  document.getElementById("gSampleRate").value = state.sampleRateReal;
  document.getElementById("gOffset").value = state.offsetSec;
  document.getElementById("gDuration").value = state.duration;
  document.getElementById("gFOV").value = state.fov;
  var nsEl = document.getElementById("gNoteScale");
  if (nsEl) { nsEl.value = Math.round((state.noteScale || 1.0) * 100);
    var nsv = document.getElementById("noteScaleVal");
    if (nsv) nsv.textContent = Math.round((state.noteScale || 1.0) * 100) + "%"; }
  var spEl = document.getElementById("gSpeed");
  if (spEl) { spEl.value = Math.round((state.speed || 1.0) * 100);
    var sv = document.getElementById("speedVal");
    if (sv) sv.textContent = (state.speed || 1.0).toFixed(2) + "x"; }
  // 显示音频路径
  var aiEl = document.getElementById("audioInfo");
  if (aiEl && state.audioPath) { aiEl.textContent = state.audioPath + " (已关联)"; aiEl.title = state.audioPath; }
  renderTrackDirectory();
  renderTrackPanels();
  if (typeof resizePreview === "function") resizePreview();
  if (typeof resizeTimeline === "function") resizeTimeline();
  scheduleSizeEstimate();
}

function addNewTrack() {
  if (state.tracks.length >= 80) { showToast("已达到轨道数上限 (80)", "warn"); return; }
  if (typeof pushUndo === "function") pushUndo();
  var id = state.tracks.length;
  state.tracks.push(createDefaultTrack(id));
  state.openedTracks.push(id);
  renderTrackDirectory();
  renderTrackPanels();
  scheduleSizeEstimate();
}

function deleteTrack(id) {
  if (!confirm("确定删除轨道 " + id + " 吗？该轨道上的音符也会被删除。")) return;
  if (typeof pushUndo === "function") pushUndo();
  state.tracks.splice(id, 1);
  state.tracks.forEach(function(t, i) { t.id = i; });
  state.notes = state.notes.filter(function(n) { return n.track !== id; }).map(function(n) { return { track: n.track > id ? n.track - 1 : n.track, type: n.type, time: n.time, endTime: n.endTime }; });
  state.openedTracks = state.openedTracks.filter(function(t) { return t !== id; }).map(function(t) { return t > id ? t - 1 : t; });
  renderTrackDirectory();
  renderTrackPanels();
  scheduleSizeEstimate();
}

function toggleTrackOpen(id) {
  var idx = state.openedTracks.indexOf(id);
  if (idx >= 0) state.openedTracks.splice(idx, 1);
  else state.openedTracks.push(id);
  renderTrackDirectory();
  renderTrackPanels();
}

function renderTrackDirectory() {
  var dir = document.getElementById("trackDirList");
  dir.innerHTML = "";
  var total = state.tracks.length;
  for (var i = 0; i < state.tracks.length; i++) {
    var track = state.tracks[i];
    var hue = hueForTrack(i, total);
    var isOpen = state.openedTracks.indexOf(track.id) >= 0;
    var item = document.createElement("div");
    item.className = "dir-item" + (isOpen ? " active" : "");
    item.innerHTML = "<span class=\"color-dot\" style=\"background:" + hslStr(hue, 100, 55) + "\"></span>轨道" + i;
    item.onclick = (function(tid) { return function() { toggleTrackOpen(tid); }; })(track.id);
    item.oncontextmenu = (function(tid) { return function(e) { e.preventDefault(); deleteTrack(tid); }; })(track.id);
    dir.appendChild(item);
  }
}

// === KEYFRAME PANEL RENDERING ===
function renderTrackPanels() {
  var container = document.getElementById("trackPanels");
  container.innerHTML = "";
  var total = state.tracks.length;
  for (var oi = 0; oi < state.openedTracks.length; oi++) {
    var tid = state.openedTracks[oi];
    var track = null;
    for (var ti = 0; ti < state.tracks.length; ti++) { if (state.tracks[ti].id === tid) { track = state.tracks[ti]; break; } }
    if (!track) continue;
    var hue = hueForTrack(tid, total);
    var panel = document.createElement("div");
    panel.className = "track-panel";
    var body = "";
    if (track._sampledPath) {
      body = "<div class=\"segment-warn\">该轨道来自 .hvp 导入的采样数据，无法以函数形式编辑。</div>";
    } else {
      var kfs = track.keyframes || [];
      var sps = track.segmentPresets || [];
      body += renderKF(tid, 0, kfs[0]);
      for (var si = 0; si < sps.length; si++) {
        var kfNext = kfs[si + 1];
        if (!kfNext) break;
        body += renderSegmentPreset(tid, si, sps[si]);
        body += renderKF(tid, si + 1, kfNext);
      }
    }
    body += "<div style=\"padding:6px;\"><button class=\"small\" onclick=\"addKeyframe(" + tid + ")\">+ 关键帧</button></div>";
    panel.innerHTML = "<div class=\"track-panel-header\"><div class=\"track-panel-title\"><span class=\"color-dot\" style=\"display:inline-block;width:12px;height:12px;border-radius:50%;background:" + hslStr(hue, 100, 55) + "\"></span><span>轨道 " + tid + "</span></div></div>" + body;
    container.appendChild(panel);
  }
  var inputs = container.querySelectorAll("input.expr-input");
  for (var ii = 0; ii < inputs.length; ii++) {
    var el = inputs[ii];
    var role = el.dataset.role, tid2 = parseInt(el.dataset.tid), si = parseInt(el.dataset.si), pk = el.dataset.pk;
    bindExprInput(el, (function(t, s, p, r, elem) {
      return function(expr) {
        if (r === "kfTime") {
          for (var tk = 0; tk < state.tracks.length; tk++) {
            if (state.tracks[tk].id === t) {
              var kfs = state.tracks[tk].keyframes;
              var ok = true;
              if (s > 0 && expr.value <= kfs[s - 1].time) ok = false;
              if (s < kfs.length - 1 && expr.value >= kfs[s + 1].time) ok = false;
              if (ok) { elem.classList.remove("expr-invalid"); if (typeof pushUndo === "function") pushUndo(); updateKFProp(t, s, "time", expr); }
              else { elem.classList.add("expr-invalid"); }
              break;
            }
          }
        }
        else if (r === "kfPos") { if (typeof pushUndo === "function") pushUndo(); updateKFProp(t, s, p, expr); }
        else if (r === "segParam") updateSegParam(t, s, p, expr);
      };
    })(tid2, si, pk, role, el));
  }
}

function renderKF(tid, ki, kf) {
  if (!kf) return "";
  var hue = hueForTrack(tid, state.tracks.length);
  var hiddenChk = kf.hidden ? " checked" : "";
  return "<div class=\"segment-card\"><div class=\"segment-row\"><span class=\"color-dot\" style=\"display:inline-block;width:8px;height:8px;border-radius:50%;background:" + hslStr(hue, 100, 60) + "\"></span><strong style=\"font-size:0.85em;color:var(--fg2);\">#" + ki + "</strong><div class=\"field\"><label>时间</label><input type=\"text\" class=\"expr-input\" value=\"" + kf.time.toFixed(3) + "\" data-tid=\"" + tid + "\" data-si=\"" + ki + "\" data-role=\"kfTime\"></div><div class=\"field\"><label>X</label><input type=\"text\" class=\"expr-input\" value=\"" + kf.x.toFixed(3) + "\" data-tid=\"" + tid + "\" data-si=\"" + ki + "\" data-pk=\"x\" data-role=\"kfPos\"></div><div class=\"field\"><label>Y</label><input type=\"text\" class=\"expr-input\" value=\"" + kf.y.toFixed(3) + "\" data-tid=\"" + tid + "\" data-si=\"" + ki + "\" data-pk=\"y\" data-role=\"kfPos\"></div><div class=\"field\"><label>&nbsp;</label><label class=\"inline-chk\"><input type=\"checkbox\" onchange=\"toggleKFHidden(" + tid + "," + ki + ",this.checked)\"" + hiddenChk + ">隐藏</label></div>" + (ki > 0 ? "<div class=\"field delete\"><label>&nbsp;</label><button class=\"small danger\" onclick=\"removeKeyframe(" + tid + "," + ki + ")\">✕</button></div>" : "") + "</div></div>";
}

function renderSegmentPreset(tid, si, seg) {
  var preset = PRESETS[seg.preset];
  var presetOpts = "";
  for (var pk2 in PRESETS) {
    if (PRESETS.hasOwnProperty(pk2)) {
      presetOpts += "<option value=\"" + pk2 + "\"" + (seg.preset === pk2 ? " selected" : "") + ">" + PRESETS[pk2].name + "</option>";
    }
  }
  var label = (si === 0 ? "" : "&nbsp;") + "⟶ 段" + si;
  var paramsHTML = "";
  if (preset && preset.params) {
    for (var pi = 0; pi < preset.params.length; pi++) {
      var pk = preset.params[pi];
      if (pk === "k" || pk === "bzX1" || pk === "bzY1" || pk === "bzX2" || pk === "bzY2" ||
          pk === "cx" || pk === "cy" || pk === "ax" || pk === "ay" || pk === "omega" ||
          pk === "omegaX" || pk === "omegaY" || pk === "phiX" || pk === "phiY" ||
          pk === "funcX" || pk === "funcY" || pk === "xExpr" || pk === "yExpr") {
        var lbl = PARAM_LABELS[pk] || pk;
        var val = seg.params[pk] !== undefined ? seg.params[pk] : PARAM_DEFAULTS[pk];
        if (pk === "funcX" || pk === "funcY") {
          paramsHTML += "<div class=\"field\"><label>" + lbl + "</label><select onchange=\"updateSegParam(" + tid + "," + si + ",'" + pk + "',this.value)\"><option value=\"sin\"" + (val === "sin" ? " selected" : "") + ">sin</option><option value=\"cos\"" + (val === "cos" ? " selected" : "") + ">cos</option></select></div>";
        } else if (pk === "xExpr" || pk === "yExpr") {
          paramsHTML += "<div class=\"field expr\"><label>" + lbl + "</label><input type=\"text\" value=\"" + escapeHtmlAttr(String(val)) + "\" onchange=\"updateSegParam(" + tid + "," + si + ",'" + pk + "',this.value)\"></div>";
        } else {
          paramsHTML += "<div class=\"field\"><label>" + lbl + "</label><input type=\"text\" class=\"expr-input\" value=\"" + escapeHtmlAttr(exprRaw(val, 0)) + "\" data-tid=\"" + tid + "\" data-si=\"" + si + "\" data-pk=\"" + pk + "\" data-role=\"segParam\"></div>";
        }
      }
    }
  }
  var lissajousBtn = seg.preset === "lissajous" ? "<button class=\"small secondary\" onclick=\"apply8Preset(" + tid + "," + si + ")\">8字</button>" : "";
  return "<div class=\"segment-card\" style=\"border-left-color:var(--accent);margin:2px 0;\"><div class=\"segment-row\"><span style=\"font-size:0.85em;color:var(--accent);font-weight:bold;\">" + label + "</span><div class=\"field\"><label>预设</label><select onchange=\"changeSegPreset(" + tid + "," + si + ",this.value)\">" + presetOpts + "</select></div>" + paramsHTML + (lissajousBtn ? "<div class=\"field\"><label>&nbsp;</label>" + lissajousBtn + "</div>" : "") + "</div></div>";
}

// === KEYFRAME OPERATIONS ===
function addKeyframe(tid) {
  for (var i = 0; i < state.tracks.length; i++) {
    if (state.tracks[i].id === tid) {
      var track = state.tracks[i];
      if (track._sampledPath) { showToast("导入的采样轨道无法编辑", "warn"); return; }
      var kfs = track.keyframes;
      var newT = game.gameTime;
      for (var ck = 0; ck < kfs.length; ck++) { if (Math.abs(kfs[ck].time - newT) < 0.001) return; }
      var insIdx = kfs.length;
      for (var ki = 1; ki < kfs.length; ki++) {
        if (kfs[ki].time > newT) { insIdx = ki; break; }
      }
      var nx, ny;
      if (insIdx === 0) { nx = kfs[0].x; ny = kfs[0].y; }
      else if (insIdx >= kfs.length) { nx = kfs[kfs.length - 1].x; ny = kfs[kfs.length - 1].y; }
      else {
        var prevKF = kfs[insIdx - 1], nextKF = kfs[insIdx];
        var ratio = (newT - prevKF.time) / Math.max(0.001, nextKF.time - prevKF.time);
        nx = prevKF.x + (nextKF.x - prevKF.x) * ratio;
        ny = prevKF.y + (nextKF.y - prevKF.y) * ratio;
      }
      if (typeof pushUndo === "function") pushUndo();
      kfs.splice(insIdx, 0, { time: newT, x: nx, y: ny, hidden: false });
      var sps = track.segmentPresets;
      var oldPreset = sps[insIdx - 1] ? { preset: sps[insIdx - 1].preset, params: JSON.parse(JSON.stringify(sps[insIdx - 1].params || {})) } : { preset: "line", params: {} };
      sps.splice(insIdx, 0, oldPreset);
      renderTrackPanels();
      scheduleSizeEstimate();
      return;
    }
  }
}

function removeKeyframe(tid, ki) {
  for (var i = 0; i < state.tracks.length; i++) {
    if (state.tracks[i].id === tid) {
      var track = state.tracks[i];
      if (track._sampledPath) { showToast("导入的采样轨道无法编辑", "warn"); return; }
      if (track.keyframes.length <= 2) { showToast("至少需要 2 个关键帧", "warn"); return; }
      if (typeof pushUndo === "function") pushUndo();
      track.keyframes.splice(ki, 1);
      if (ki < track.segmentPresets.length) track.segmentPresets.splice(ki, 1);
      renderTrackPanels();
      scheduleSizeEstimate();
      return;
    }
  }
}

function toggleKFHidden(tid, ki, val) {
  for (var i = 0; i < state.tracks.length; i++) {
    if (state.tracks[i].id === tid) {
      state.tracks[i].keyframes[ki].hidden = !!val;
      return;
    }
  }
}

function updateKFProp(tid, ki, prop, expr) {
  for (var i = 0; i < state.tracks.length; i++) {
    if (state.tracks[i].id === tid) {
      var kfs = state.tracks[i].keyframes;
      var kf = kfs[ki];
      if (!kf) return;
      if (prop === "time") {
        var t = expr.value;
        if (ki > 0 && t <= kfs[ki - 1].time) return;
        if (ki < kfs.length - 1 && t >= kfs[ki + 1].time) return;
        kf.time = t;
      } else {
        kf[prop] = expr.value;
      }
      scheduleSizeEstimate();
      return;
    }
  }
}

// === SEGMENT PRESET OPERATIONS ===
function updateSegParam(tid, si, pk, val) {
  for (var i = 0; i < state.tracks.length; i++) {
    if (state.tracks[i].id === tid) {
      var seg = state.tracks[i].segmentPresets[si];
      if (!seg) return;
      if (typeof pushUndo === "function") pushUndo();
      if (pk === "funcX" || pk === "funcY" || pk === "xExpr" || pk === "yExpr") seg.params[pk] = val;
      else seg.params[pk] = (val && typeof val === "object" && "raw" in val && "value" in val) ? val : toExpr(val, 0);
      break;
    }
  }
  scheduleSizeEstimate();
}

function changeSegPreset(tid, si, preset) {
  for (var i = 0; i < state.tracks.length; i++) {
    if (state.tracks[i].id === tid) {
      var seg = state.tracks[i].segmentPresets[si];
      if (!seg) return;
      if (typeof pushUndo === "function") pushUndo();
      seg.preset = preset;
      var p = PRESETS[preset];
      if (p && p.params) {
        for (var pi = 0; pi < p.params.length; pi++) {
          var pk = p.params[pi];
          if (seg.params[pk] === undefined) { var def = PARAM_DEFAULTS[pk]; seg.params[pk] = typeof def === "number" ? { raw: String(def), value: def } : def; }
        }
      }
      break;
    }
  }
  renderTrackPanels();
}

function apply8Preset(tid, si) {
  for (var i = 0; i < state.tracks.length; i++) {
    if (state.tracks[i].id === tid) {
      var seg = state.tracks[i].segmentPresets[si];
      if (!seg) return;
      if (typeof pushUndo === "function") pushUndo();
      seg.params.omegaX = { raw: "2*pi", value: 2 * Math.PI };
      seg.params.omegaY = { raw: "4*pi", value: 4 * Math.PI };
      seg.params.funcX = "sin"; seg.params.funcY = "sin";
      seg.params.phiX = { raw: "0", value: 0 }; seg.params.phiY = { raw: "0", value: 0 };
      break;
    }
  }
  renderTrackPanels();
}
