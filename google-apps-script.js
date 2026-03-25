/**
 * Google Apps Script — OpenClaw 多遊戲統一後端
 *
 * 支援多個遊戲共用同一份試算表，透過 game 參數分流到不同分頁。
 *
 * 自動建立的分頁：
 *   - "Rhythm"        — 節奏遊戲排行榜 (name, score, date)
 *   - "Rhythm_Config"  — 節奏遊戲設定 (key, value)
 *   - "PacMan"        — 小精靈排行榜 (name, score, date)
 *   - "PacMan_Config"  — 小精靈設定 (key, value)
 *
 * API 用法：
 *   GET  ?action=getScores&game=pacman
 *   GET  ?action=getConfig&game=rhythm
 *   POST { action: "addScore", game: "pacman", name: "玩家", score: 1500 }
 *   POST { action: "setConfig", game: "rhythm", key: "secretMessage", value: "hello" }
 *
 * 部署：擴充功能 > Apps Script > 貼上 > 部署 > 網頁應用程式
 *       執行身分：自己，存取權限：任何人
 */

// === Game name → Sheet tab mapping ===
var GAME_SHEETS = {
  rhythm:  { scores: 'Rhythm',       config: 'Rhythm_Config' },
  pacman:  { scores: 'PacMan',       config: 'PacMan_Config' },
};

var DEFAULT_CONFIGS = {
  rhythm: [
    ['key', 'value'],
    ['secretMessage', 'openthedoor'],
    ['passThreshold', '3000'],
  ],
  pacman: [
    ['key', 'value'],
    ['secretMessage', 'openthedoor'],
    ['passThreshold', '3000'],
  ],
};

// === HTTP Handlers ===
function doGet(e) {
  var action = e.parameter.action;
  var game = (e.parameter.game || 'pacman').toLowerCase();
  if (action === 'getScores') return getScores(game);
  if (action === 'getConfig') return getConfig(game);
  return jsonResponse({ error: 'Unknown action. Use action=getScores or action=getConfig' });
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var game = (data.game || 'pacman').toLowerCase();
    if (data.action === 'addScore') return addScore(game, data.name, data.score);
    if (data.action === 'setConfig') return setConfig(game, data.key, data.value);
    return jsonResponse({ error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// === Sheet Helpers ===
function getOrCreateSheet(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length > 0) {
      for (var i = 0; i < headers.length; i++) {
        sheet.appendRow(headers[i]);
      }
    }
  }
  return sheet;
}

function getScoreSheet(game) {
  var mapping = GAME_SHEETS[game] || GAME_SHEETS['pacman'];
  return getOrCreateSheet(mapping.scores, [['name', 'score', 'date']]);
}

function getConfigSheet(game) {
  var mapping = GAME_SHEETS[game] || GAME_SHEETS['pacman'];
  var defaults = DEFAULT_CONFIGS[game] || DEFAULT_CONFIGS['pacman'];
  return getOrCreateSheet(mapping.config, defaults);
}

// === Leaderboard ===
function getScores(game) {
  var sheet = getScoreSheet(game);
  var data = sheet.getDataRange().getValues();
  var all = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (row[0] && !isNaN(Number(row[1]))) {
      all.push({ name: row[0], score: Number(row[1]), date: row[2] });
    }
  }

  // 同名玩家只保留最高分
  var byName = {};
  for (var j = 0; j < all.length; j++) {
    var s = all[j];
    if (!byName[s.name] || s.score > byName[s.name].score) {
      byName[s.name] = s;
    }
  }

  var scores = Object.keys(byName).map(function(k) { return byName[k]; });
  scores.sort(function(a, b) { return b.score - a.score; });
  return jsonResponse(scores.slice(0, 10));
}

function addScore(game, name, score) {
  if (!name || typeof score !== 'number') {
    return jsonResponse({ error: 'Invalid data' });
  }
  name = String(name).replace(/<[^>]*>/g, '').substring(0, 12);
  var sheet = getScoreSheet(game);
  var date = new Date().toISOString().slice(0, 10);
  sheet.appendRow([name, score, date]);
  return jsonResponse({ success: true, game: game });
}

// === Config ===
function getConfig(game) {
  var sheet = getConfigSheet(game);
  var data = sheet.getDataRange().getValues();
  var config = {};
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) {
      config[data[i][0]] = data[i][1];
    }
  }
  return jsonResponse(config);
}

function setConfig(game, key, value) {
  if (!key) return jsonResponse({ error: 'Missing key' });
  var sheet = getConfigSheet(game);
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return jsonResponse({ success: true, game: game, key: key, value: value });
    }
  }

  sheet.appendRow([key, value]);
  return jsonResponse({ success: true, game: game, key: key, value: value });
}
