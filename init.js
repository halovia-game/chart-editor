/* ============================================================
   init.js - 初始化入口
   依赖：所有其他模块
   ============================================================ */
"use strict";

function init() {
  // 默认 4 轨（新 keyframe 模型）
  state.tracks = [];
  for (var i = 0; i < 4; i++) state.tracks.push(createDefaultTrack(i));
  state.openedTracks = [0];

  // 绑定全局参数（表达式）
  ["gBPM", "gSampleRate", "gOffset", "gDuration", "gFOV"].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    bindExprInput(el, function() { syncGlobals(); updateSizeEstimate(); });
  });

  // 音符大小滑块
  var nsEl = document.getElementById("gNoteScale");
  if (nsEl) {
    nsEl.addEventListener("input", function() {
      state.noteScale = parseInt(this.value) / 100;
      var nsv = document.getElementById("noteScaleVal");
      if (nsv) nsv.textContent = this.value + "%";
    });
  }

  // 倍速滑块
  var spEl = document.getElementById("gSpeed");
  if (spEl) {
    spEl.addEventListener("input", function() {
      var raw = parseInt(this.value);
      if (Math.abs(raw - 100) <= 3) raw = 100;
      this.value = raw;
      var newSpeed = raw / 100;
      // 播放中切换倍速时保持 gameTime 连续
      if (game.playing && !game.paused) {
        var now = performance.now();
        var elapsed = (now - game.startRealTime) / 1000;
        var currentTime = game.startGameTime + elapsed * (state.speed || 1.0);
        game.startGameTime = currentTime;
        game.startRealTime = now;
      }
      state.speed = newSpeed;
      var sv = document.getElementById("speedVal");
      if (sv) sv.textContent = state.speed.toFixed(2) + "x";
      // 更新当前播放的倍速
      if (state.audioSource && state.audioSource.playbackRate !== undefined) {
        try { state.audioSource.playbackRate.value = state.speed; } catch (e) {}
      }
    });
  }

  // 类型选择联动
  document.getElementById("editType").addEventListener("change", updateEditDurationVisibility);

  // 音符编辑弹窗单位切换自动换算
  var editTimeUnit = document.getElementById("editTimeUnit");
  var editDurUnit = document.getElementById("editDurationUnit");
  function addUnitConverter(unitEl, valEl, toSec, fromSec) {
    unitEl.addEventListener("change", function() {
      var v = parseFloat(valEl.value);
      if (isFinite(v)) {
        valEl.value = (this.value === "beat" ? toSec(v) : fromSec(v)).toFixed(3);
      }
    });
  }
  if (editTimeUnit) addUnitConverter(editTimeUnit, document.getElementById("editTime"), beatToSec, function(v) { return v; });
  if (editDurUnit) addUnitConverter(editDurUnit, document.getElementById("editDuration"), beatToSec, function(v) { return v; });

  // 时间轴初始化
  initTimeline();

  // UI 渲染
  applyStateToUI();
  resizePreview();
  resizeTimeline();

  // 时间轴初始视图
  timeline.viewStart = 0;
  timeline.viewEnd = state.duration;

  // 启动渲染循环
  requestAnimationFrame(renderLoop);

  // 音量滑块
  var volHit = document.getElementById("volHit");
  var volMusic = document.getElementById("volMusic");
  if (volHit) {
    var savedHit = localStorage.getItem("halovia_vol_hit");
    if (savedHit !== null) volHit.value = savedHit;
    sfx.hitVolume = parseInt(volHit.value) / 100;
    setHitVolume(sfx.hitVolume);
    document.getElementById("volHitVal").textContent = volHit.value;
    volHit.addEventListener("input", function() {
      sfx.hitVolume = parseInt(volHit.value) / 100;
      setHitVolume(sfx.hitVolume);
      document.getElementById("volHitVal").textContent = volHit.value;
      localStorage.setItem("halovia_vol_hit", volHit.value);
    });
  }
  if (volMusic) {
    var savedMusic = localStorage.getItem("halovia_vol_music");
    if (savedMusic !== null) volMusic.value = savedMusic;
    sfx.musicVolume = parseInt(volMusic.value) / 100;
    document.getElementById("volMusicVal").textContent = volMusic.value;
    volMusic.addEventListener("input", function() {
      sfx.musicVolume = parseInt(volMusic.value) / 100;
      if (state._musicGain) state._musicGain.gain.value = sfx.musicVolume;
      document.getElementById("volMusicVal").textContent = volMusic.value;
      localStorage.setItem("halovia_vol_music", volMusic.value);
    });
  }

  // 首次用户交互后加载 SFX（避开自动播放策略）
  document.body.addEventListener("click", function initSfxOnce() {
    document.body.removeEventListener("click", initSfxOnce);
    loadAllSfx().catch(function(err) { console.warn("SFX load error:", err); });
  }, { once: true });

  scheduleSizeEstimate();
  if (typeof updateLoopUI === "function") updateLoopUI();
}

// 等 DOM 就绪
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

