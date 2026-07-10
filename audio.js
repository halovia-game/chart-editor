/* ============================================================
   audio.js - 音频加载与播放
   依赖：state.js, sfx.js, ui.js
   ============================================================ */
"use strict";

var audioEnergy = null;  // 预计算 RMS + 频率能量数组，供时间轴使用

// Radix-2 快速傅里叶变换（in-place, 返回振幅谱）
function fftMagnitudes(real, imag) {
  var n = real.length, bits = Math.round(Math.log(n) / Math.LN2);
  // 位反转
  for (var i = 0; i < n; i++) {
    var j = 0, ti = i;
    for (var b = 0; b < bits; b++) { j = (j << 1) | (ti & 1); ti >>= 1; }
    if (j > i) { var tr = real[i]; real[i] = real[j]; real[j] = tr; var ti2 = imag[i]; imag[i] = imag[j]; imag[j] = ti2; }
  }
  for (var len = 2; len <= n; len <<= 1) {
    var half = len >> 1, wRe = Math.cos(-2 * Math.PI / len), wIm = Math.sin(-2 * Math.PI / len);
    for (var si = 0; si < n; si += len) {
      var r = 1, im = 0;
      for (var ji = 0; ji < half; ji++) {
        var uj = si + ji, vj = uj + half;
        var tRe = r * real[vj] - im * imag[vj], tIm = r * imag[vj] + im * real[vj];
        real[vj] = real[uj] - tRe; imag[vj] = imag[uj] - tIm;
        real[uj] += tRe; imag[uj] += tIm;
        var nr = r * wRe - im * wIm; im = r * wIm + im * wRe; r = nr;
      }
    }
  }
  var mag = new Float32Array(n / 2);
  for (var ki = 0; ki < n / 2; ki++) mag[ki] = Math.sqrt(real[ki] * real[ki] + imag[ki] * imag[ki]);
  return mag;
}

function computeAudioEnergy(buffer, binsPerSec) {
  if (binsPerSec === undefined) binsPerSec = 50;
  var sr = buffer.sampleRate;
  var nc = buffer.numberOfChannels;
  var binSamples = Math.floor(sr / binsPerSec);
  var totalBins = Math.ceil(buffer.length / binSamples);
  var energy = new Float32Array(totalBins);
  var low = new Float32Array(totalBins);
  var high = new Float32Array(totalBins);
  var maxE = 0, maxLow = 0, maxHigh = 0;
  // FFT 参数
  var fftSize = 2048;
  var halfFft = fftSize / 2;
  // 预计算 Hann 窗
  var hann = new Float32Array(fftSize);
  for (var hi = 0; hi < fftSize; hi++) hann[hi] = 0.5 * (1 - Math.cos(2 * Math.PI * hi / (fftSize - 1)));
  // 频率索引映射
  var hzPerBin = sr / fftSize;
  var lowEndBin = Math.min(halfFft, Math.ceil(250 / hzPerBin));      // 250Hz
  var highStartBin = Math.min(halfFft, Math.floor(2000 / hzPerBin)); // 2kHz

  var ch0 = buffer.getChannelData(0);

  for (var bi = 0; bi < totalBins; bi++) {
    var start = bi * binSamples;
    var end = Math.min(start + binSamples, buffer.length);
    // RMS
    var sum = 0, count = (end - start) * nc;
    for (var ci = 0; ci < nc; ci++) {
      var ch = buffer.getChannelData(ci);
      for (var si = start; si < end; si++) sum += ch[si] * ch[si];
    }
    var rms = Math.sqrt(sum / count);
    energy[bi] = rms;
    if (rms > maxE) maxE = rms;

    // FFT 频率分析
    var fftReal = new Float32Array(fftSize);
    var fftImag = new Float32Array(fftSize);
    var center = Math.round((start + end) / 2);
    var fftStart = center - halfFft;
    for (var fi = 0; fi < fftSize; fi++) {
      var srcIdx = fftStart + fi;
      if (srcIdx >= 0 && srcIdx < buffer.length) fftReal[fi] = ch0[srcIdx] * hann[fi];
      else fftReal[fi] = 0;
      fftImag[fi] = 0;
    }
    var mag = fftMagnitudes(fftReal, fftImag);
    var lSum = 0, hSum = 0;
    for (var mi = 1; mi < lowEndBin && mi < mag.length; mi++) lSum += mag[mi];
    for (var mj = highStartBin; mj < mag.length; mj++) hSum += mag[mj];
    low[bi] = lSum;
    high[bi] = hSum;
    if (lSum > maxLow) maxLow = lSum;
    if (hSum > maxHigh) maxHigh = hSum;
  }
  // 归一化
  if (maxE > 0) for (var ni = 0; ni < totalBins; ni++) energy[ni] /= maxE;
  if (maxLow > 0) for (var li = 0; li < totalBins; li++) low[li] /= maxLow;
  if (maxHigh > 0) for (var hi2 = 0; hi2 < totalBins; hi2++) high[hi2] /= maxHigh;
  return { data: energy, low: low, high: high, binsPerSec: binsPerSec, duration: buffer.duration };
}

document.addEventListener("DOMContentLoaded", function() {
  var audioFile = document.getElementById("audioFile");
  if (audioFile) audioFile.addEventListener("change", handleAudioUpload);
});

function handleAudioUpload(e) {
  var file = e.target.files[0];
  if (!file) return;
  state.audioPath = file.name;
  if (!state.audioCtx) state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  var reader = new FileReader();
  reader.onload = function(ev) {
    var arrayBuf = ev.target.result;
    tryReadBPMFromMP3(arrayBuf);
    state.audioCtx.decodeAudioData(arrayBuf.slice(0), function(buffer) {
      state.audioBuffer = buffer;
      var dur = buffer.duration;
      state.duration = dur;
      document.getElementById("gDuration").value = dur.toFixed(2);
      var fname = file.name;
      if (fname.length > 18) fname = fname.slice(0, 15) + "...";
      document.getElementById("audioInfo").textContent = fname + " (" + dur.toFixed(1) + "s)";
      document.getElementById("audioInfo").title = file.name + " (" + dur.toFixed(2) + "s)";
      showToast("音频已加载, 时长 " + dur.toFixed(2) + "s", "success");
      // 确保各轨道末尾有关键帧
      if (state.tracks) {
        for (var ti = 0; ti < state.tracks.length; ti++) {
          var kfs = state.tracks[ti].keyframes;
          if (!kfs || kfs.length === 0) continue;
          var lastKF = kfs[kfs.length - 1];
          if (Math.abs(lastKF.time - dur) > 0.001) {
            kfs.push({ time: dur, x: lastKF.x, y: lastKF.y, hidden: false });
            state.tracks[ti].segmentPresets.push(JSON.parse(JSON.stringify(state.tracks[ti].segmentPresets[state.tracks[ti].segmentPresets.length - 1])));
          }
        }
        if (typeof renderTrackPanels === "function") renderTrackPanels();
      }
      audioEnergy = computeAudioEnergy(buffer);
      scheduleSizeEstimate();
    }, function() { showToast("音频解码失败", "error"); });
  };
  reader.readAsArrayBuffer(file);
}

function tryReadBPMFromMP3(arrayBuf) {
  try {
    var bytes = new Uint8Array(arrayBuf);
    if (bytes.length < 10) return;
    if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return;
    var ver = bytes[3];
    var tagSize = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
    var p = 10, end = Math.min(10 + tagSize, bytes.length);
    while (p < end - 10) {
      var fid = String.fromCharCode(bytes[p], bytes[p+1], bytes[p+2], bytes[p+3]);
      if (fid === "\0\0\0\0" || !/^[A-Z0-9]{4}$/.test(fid)) break;
      var fsize = (ver === 4)
        ? (bytes[p+4]<<21)|(bytes[p+5]<<14)|(bytes[p+6]<<7)|bytes[p+7]
        : (bytes[p+4]<<24)|(bytes[p+5]<<16)|(bytes[p+6]<<8)|bytes[p+7];
      if (fid === "TBPM") {
        var frameStart = p + 10, encoding = bytes[frameStart];
        var textBytes = bytes.slice(frameStart + 1, frameStart + fsize);
        var text = (encoding === 0 || encoding === 3)
          ? new TextDecoder("utf-8").decode(textBytes)
          : new TextDecoder("utf-16").decode(textBytes);
        text = text.replace(/\0+/g,"").trim();
        var bpmVal = parseInt(parseFloat(text));
        if (bpmVal >= 1 && bpmVal <= 999) {
          state.bpm = bpmVal;
          document.getElementById("gBPM").value = bpmVal;
          showToast("从音频读到 BPM: " + bpmVal, "info");
          return;
        }
      }
      p += 10 + fsize;
    }
  } catch (e) {}
}

function startAudioAt(gameTime) {
  if (!state.audioBuffer || !state.audioCtx) return;
  try {
    stopAudio();
    state.audioSource = state.audioCtx.createBufferSource();
    state.audioSource.buffer = state.audioBuffer;
    state.audioSource.playbackRate.value = state.speed || 1.0;
    if (!state._musicGain) {
      state._musicGain = state.audioCtx.createGain();
      state._musicGain.gain.value = sfx.musicVolume;
      state._musicGain.connect(state.audioCtx.destination);
    }
    state.audioSource.connect(state._musicGain);
    var audioPos = gameTime + state.offsetSec;
    if (audioPos >= 0 && audioPos < state.audioBuffer.duration) {
      state.audioSource.start(0, audioPos);
      state.audioStartedAt = performance.now();
      state.audioStartOffset = audioPos;
    } else if (audioPos < 0) {
      state.audioSource.start(state.audioCtx.currentTime + (-audioPos), 0);
      state.audioStartedAt = performance.now() + (-audioPos) * 1000;
      state.audioStartOffset = 0;
    }
  } catch (e) { console.warn("startAudio error: " + e); }
}

function stopAudio() {
  if (state.audioSource) {
    try { state.audioSource.stop(); } catch (e) {}
    state.audioSource = null;
  }
}

function loadAudioFromPath(path) {
  if (!path || !state.audioCtx) return;
  showToast("尝试加载音频: " + path + "……", "info");
  fetch(path).then(function(resp) {
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    return resp.arrayBuffer();
  }).then(function(buf) {
    state.audioCtx.decodeAudioData(buf.slice(0), function(buffer) {
      state.audioBuffer = buffer;
      state.audioPath = path;
      var dur = buffer.duration;
      state.duration = dur;
      document.getElementById("gDuration").value = dur.toFixed(2);
      var fname = path.split("/").pop().split("\\").pop();
      if (fname.length > 18) fname = fname.slice(0, 15) + "...";
      document.getElementById("audioInfo").textContent = fname + " (" + dur.toFixed(1) + "s)";
      document.getElementById("audioInfo").title = path + " (" + dur.toFixed(2) + "s)";
      if (state.tracks) {
        for (var ti = 0; ti < state.tracks.length; ti++) {
          var kfs = state.tracks[ti].keyframes;
          if (!kfs || kfs.length === 0) continue;
          var lastKF = kfs[kfs.length - 1];
          if (Math.abs(lastKF.time - dur) > 0.001) {
            kfs.push({ time: dur, x: lastKF.x, y: lastKF.y, hidden: false });
            state.tracks[ti].segmentPresets.push(JSON.parse(JSON.stringify(state.tracks[ti].segmentPresets[state.tracks[ti].segmentPresets.length - 1])));
          }
        }
        if (typeof renderTrackPanels === "function") renderTrackPanels();
      }
      showToast("已自动加载音频: " + fname, "success");
      audioEnergy = computeAudioEnergy(buffer);
      scheduleSizeEstimate();
    }, function() { showToast("音频解码失败: " + path, "error"); });
  }).catch(function(err) {
    showToast("未能自动加载音频: " + path + "，请手动选择", "warn");
  });
}
