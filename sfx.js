/* ============================================================
   sfx.js - 打击音效系统
   依赖：state.js, ui.js
   ============================================================ */
"use strict";

var sfx = {
  pools: { 1: [], 2: [], 3: [] },
  poolSize: 8,
  hitVolume: 0.7,
  musicVolume: 0.7,
  loaded: { 1: false, 2: false, 3: false }
};
var sfxPoolIdx = { 1: 0, 2: 0, 3: 0 };

function tryLoadSfxAudio(baseName, type) {
  var variants = [
    "sound/" + baseName + ".ogg", "sound/" + baseName.toLowerCase() + ".ogg",
    "sound/" + baseName.toUpperCase() + ".ogg", "sound/" + baseName + ".mp3",
    "sound/" + baseName.toLowerCase() + ".mp3", "sound/" + baseName.toUpperCase() + ".mp3"
  ];
  return new Promise(function(resolve) {
    var idx = 0;
    function tryNext() {
      if (idx >= variants.length) { resolve(null); return; }
      var url = variants[idx++];
      var test = new Audio();
      test.preload = "auto";
      var onOk = function() { cleanup(); resolve(url); };
      var onErr = function() { cleanup(); tryNext(); };
      var cleanup = function() {
        test.removeEventListener("canplaythrough", onOk);
        test.removeEventListener("loadeddata", onOk);
        test.removeEventListener("error", onErr);
      };
      test.addEventListener("canplaythrough", onOk);
      test.addEventListener("loadeddata", onOk);
      test.addEventListener("error", onErr);
      test.src = url;
      test.load();
    }
    tryNext();
  });
}

async function loadAllSfx() {
  var specs = [{ type: 1, name: "Tap" }, { type: 2, name: "Keep" }, { type: 3, name: "Hold" }];
  var loaded = [];
  for (var si = 0; si < specs.length; si++) {
    var sp = specs[si];
    var url = await tryLoadSfxAudio(sp.name, sp.type);
    if (url) {
      for (var i = 0; i < sfx.poolSize; i++) {
        var a = new Audio(url);
        a.preload = "auto";
        a.volume = sfx.hitVolume;
        sfx.pools[sp.type].push(a);
      }
      sfx.loaded[sp.type] = true;
      loaded.push(sp.name);
    }
  }
  if (loaded.length > 0) showToast("音效已加载: " + loaded.join(", "), "info");
  else console.warn("未能加载任何打击音效");
}

function playSfx(type) {
  var pool = sfx.pools[type];
  if (!pool || pool.length === 0) return;
  var a = pool[sfxPoolIdx[type]];
  sfxPoolIdx[type] = (sfxPoolIdx[type] + 1) % pool.length;
  try { a.pause(); a.currentTime = 0; a.volume = sfx.hitVolume; a.play().catch(function() {}); } catch (e) {}
}

function setHitVolume(v) {
  sfx.hitVolume = v;
  for (var t = 1; t <= 3; t++)
    for (var i = 0; i < sfx.pools[t].length; i++)
      sfx.pools[t][i].volume = v;
}
