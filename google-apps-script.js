/**
 * Google Apps Script - 排行榜後端
 *
 * 使用方式：
 * 1. 建立一個 Google 試算表
 * 2. 在第一列的 A1:C1 輸入標題：name, score, date
 * 3. 前往「擴充功能 > Apps Script」
 * 4. 貼上此程式碼，儲存
 * 5. 點選「部署 > 新增部署」
 * 6. 類型選「網頁應用程式」
 * 7. 執行身分：自己，存取權限：任何人
 * 8. 複製部署的 URL，貼到遊戲的管理後台 (#admin)
 */

const SHEET_NAME = 'Sheet1'; // 試算表分頁名稱

function doGet(e) {
  const action = e.parameter.action;

  if (action === 'getScores') {
    return getScores();
  }

  return ContentService.createTextOutput(JSON.stringify({ error: 'Unknown action' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.action === 'addScore') {
      return addScore(data.name, data.score);
    }

    return ContentService.createTextOutput(JSON.stringify({ error: 'Unknown action' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getScores() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  // Skip header row, keep only best score per player, top 10
  const all = data.slice(1)
    .map(row => ({ name: row[0], score: Number(row[1]), date: row[2] }))
    .filter(s => s.name && !isNaN(s.score));

  const byName = {};
  for (const s of all) {
    if (!byName[s.name] || s.score > byName[s.name].score) {
      byName[s.name] = s;
    }
  }
  const scores = Object.values(byName)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return ContentService.createTextOutput(JSON.stringify(scores))
    .setMimeType(ContentService.MimeType.JSON);
}

function addScore(name, score) {
  if (!name || typeof score !== 'number') {
    return ContentService.createTextOutput(JSON.stringify({ error: 'Invalid data' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Sanitize name (max 12 chars, no scripts)
  name = String(name).replace(/<[^>]*>/g, '').substring(0, 12);

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const date = new Date().toISOString().slice(0, 10);

  sheet.appendRow([name, score, date]);

  return ContentService.createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
