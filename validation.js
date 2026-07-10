/* ============================================================
   validation.js - 校验系统 (v4R keyframe 模型)
   依赖：state.js, presets.js
   ============================================================ */
"use strict";

function validateKeyframes(tid) {
  var track = null;
  for (var i = 0; i < state.tracks.length; i++) { if (state.tracks[i].id === tid) { track = state.tracks[i]; break; } }
  if (!track || !track.keyframes) return [];
  var out = [];
  var kfs = track.keyframes;
  for (var ki = 1; ki < kfs.length; ki++) {
    if (kfs[ki].time <= kfs[ki - 1].time) {
      out.push({ level: "err", msg: "关键帧 " + ki + " 时间必须大于前一帧" });
    }
  }
  for (var ni = 0; ni < state.notes.length; ni++) {
    var n = state.notes[ni];
    if (n.track !== tid) continue;
    // 检查音符所在帧是否隐藏
    for (var sj = 0; sj < track.segmentPresets.length; sj++) {
      if (n.time >= kfs[sj].time && n.time <= kfs[sj + 1].time) {
        if (kfs[sj].hidden && kfs[sj + 1].hidden) {
          out.push({ level: "err", msg: "音符在隐藏段内 (t=" + n.time.toFixed(3) + "s)" });
        }
        break;
      }
    }
  }
  return out;
}
