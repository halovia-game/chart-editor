/* ============================================================
   notes.js - 音符管理 + 编辑弹窗
   依赖：state.js, ui.js
   ============================================================ */
"use strict";

var editingNoteIdx = -1;

function hasHoldOverlap(track, time, endTime, excludeIdx) {
  if (excludeIdx === undefined) excludeIdx = -1;
  // 本音符的时间区间 [ourStart, ourEnd]（非 Hold 则单点）
  var ourEnd = (endTime !== null && endTime !== undefined) ? endTime : time;
  for (var i = 0; i < state.notes.length; i++) {
    if (i === excludeIdx) continue;
    var other = state.notes[i];
    if (other.track !== track) continue;
    var otherEnd = (other.type === 3 && other.endTime !== null) ? other.endTime : other.time;
    // 任何两个音符在同一轨道且时间区间重叠即拒绝
    if (Math.max(time, other.time) <= Math.min(ourEnd, otherEnd)) return true;
  }
  return false;
}

function addNote(track, type, time, endTime) {
  if (endTime === undefined) endTime = null;
  if (endTime !== null && endTime > state.duration) endTime = state.duration;
  var ts = secToTimestamp(time);
  for (var i = 0; i < state.notes.length; i++) {
    var n = state.notes[i];
    if (n.track === track && secToTimestamp(n.time) === ts) {
      showToast("轨道 " + track + " 在该时间戳已有音符", "warn");
      return false;
    }
  }
  if (hasHoldOverlap(track, time, endTime)) {
    showToast("轨道 " + track + " 与其他 Hold 重叠", "warn");
    return false;
  }
  if (typeof pushUndo === "function") pushUndo();
  state.notes.push({ track: track, type: type, time: time, endTime: endTime });
  scheduleSizeEstimate();
  if (typeof renderTimeline === "function") renderTimeline();
  return true;
}

function removeNoteByIndex(i) {
  if (typeof pushUndo === "function") pushUndo();
  state.notes.splice(i, 1);
  scheduleSizeEstimate();
  if (typeof renderTimeline === "function") renderTimeline();
}

function openNoteEditModal(idx) {
  editingNoteIdx = idx;
  var n = state.notes[idx];
  // 轨道号防越界
  var maxTrack = state.tracks.length - 1;
  if (n.track > maxTrack) n.track = maxTrack;
  document.getElementById("editTrack").value = String(n.track);
  document.getElementById("editType").value = n.type;
  document.getElementById("editTime").value = n.time.toFixed(3);
  document.getElementById("editTimeUnit").value = "sec";
  document.getElementById("editDurationUnit").value = "sec";
  if (n.type === 3 && n.endTime !== null) {
    document.getElementById("editDuration").value = (n.endTime - n.time).toFixed(3);
  } else {
    document.getElementById("editDuration").value = "1";
  }
  ["editTrack","editTime","editDuration"].forEach(function(id) {
    bindExprInput(document.getElementById(id), null);
  });
  updateEditDurationVisibility();
  document.getElementById("noteEditModal").classList.add("active");
}

function updateEditDurationVisibility() {
  document.getElementById("editDurationRow").style.display =
    document.getElementById("editType").value === "3" ? "flex" : "none";
}

function saveEditingNote() {
  if (editingNoteIdx < 0) return;
  var n = state.notes[editingNoteIdx];
  var track = Math.round(evalNumericInput(document.getElementById("editTrack").value));
  var type = parseInt(document.getElementById("editType").value);
  var timeVal = evalNumericInput(document.getElementById("editTime").value);
  if (!isFinite(timeVal)) { showToast("时间无法解析", "error"); return; }
  var timeUnit = document.getElementById("editTimeUnit").value;
  var time = timeUnit === "beat" ? beatToSec(timeVal) : timeVal;
  if (track < 0 || track >= state.tracks.length) {
    showToast("轨道编号超出范围", "error"); return;
  }
  var ts = secToTimestamp(time);
  for (var i = 0; i < state.notes.length; i++) {
    if (i === editingNoteIdx) continue;
    var other = state.notes[i];
    if (other.track === track && secToTimestamp(other.time) === ts) {
      showToast("轨道 " + track + " 在该时间戳已有音符", "error"); return;
    }
  }
  // Hold 重叠检查
  var chkEndTime = null;
  if (type === 3) {
    var durVal = evalNumericInput(document.getElementById("editDuration").value);
    if (!isFinite(durVal)) { showToast("持续时长无法解析", "error"); return; }
    var durUnit = document.getElementById("editDurationUnit").value;
    var dur = durUnit === "beat" ? beatToSec(durVal) : durVal;
    if (dur <= 0) { showToast("持续时长必须 > 0", "error"); return; }
    chkEndTime = time + dur;
    if (chkEndTime > state.duration) { showToast("Hold 超出总时长", "error"); return; }
  }
  if (hasHoldOverlap(track, time, chkEndTime, editingNoteIdx)) {
    showToast("轨道 " + track + " 与其他 Hold 重叠", "error"); return;
  }
  if (typeof pushUndo === "function") pushUndo();
  n.track = track; n.type = type; n.time = time;
  if (type === 3) { n.endTime = chkEndTime; } else { n.endTime = null; }
  closeNoteEditModal();
  scheduleSizeEstimate();
  if (typeof renderTimeline === "function") renderTimeline();
}

function deleteEditingNote() {
  if (editingNoteIdx < 0) return;
  if (typeof pushUndo === "function") pushUndo();
  state.notes.splice(editingNoteIdx, 1);
  closeNoteEditModal();
  scheduleSizeEstimate();
  if (typeof renderTimeline === "function") renderTimeline();
}

function closeNoteEditModal() {
  document.getElementById("noteEditModal").classList.remove("active");
  editingNoteIdx = -1;
}
