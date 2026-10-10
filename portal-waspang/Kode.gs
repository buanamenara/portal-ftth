var CONFIG = {
  WASPANG_SPREADSHEET_ID: "1ZlSlITeC9zi-m894gQYUUn4YMfP6_8B_Jtep5a33OjA",
  DOKUMENTASI_FOLDER_ID: "1xY7LSgaZDiD4YvCGd2FW164IFVdtYGqZ", // folder "DOKUMENTASI FTTH" di Google Drive
  TELEGRAM_BOT_TOKEN: "8865250499:AAG-NYecilVkaP9dQsE2qgEqKQ-EO6YxfQU",
  TELEGRAM_CHAT_ID: "@ReportBMI"
};

function doGet(e) {
  if (e && e.parameter && e.parameter.api === 'json') {
    return ContentService.createTextOutput(JSON.stringify({
      status: "online",
      message: "Portal Waspang & Daily Report EMR aktif.",
      targetDriveFolder: "DOKUMENTASI FTTH",
      targetTelegramGroup: CONFIG.TELEGRAM_CHAT_ID
    })).setMimeType(ContentService.MimeType.JSON);
  }
  return HtmlService.createHtmlOutputFromFile('Form')
    .setTitle('Portal Waspang & Daily Report EMR')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  var result;
  try {
    var payload = JSON.parse(e.postData.contents);
    switch (payload.action) {
      case 'UPLOAD_PHOTOS':
        result = uploadWaspangPhotos_(payload);
        break;
      case 'CREATE_SITE_FOLDERS':
        result = createSiteFoldersInDrive_(payload);
        break;
      case 'DAILY_REPORT':
        result = sendDailyReportEMR_(payload);
        break;
      case 'SYNC_BOQ_EXCEL':
        result = syncMasterBoqToSheet_(payload.clusters);
        break;
      default:
        result = { status: 'error', message: 'Action tidak dikenali: ' + payload.action };
    }
  } catch (err) {
    result = { status: 'error', message: err.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function getWaspangSpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.WASPANG_SPREADSHEET_ID);
}

function getOrCreateFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function getOrCreateFolderPath_(rootFolder, pathStr) {
  var parts = String(pathStr || '').split('/').map(function (s) { return s.trim(); }).filter(Boolean);
  if (parts.length && /^dokumentasi ftth$/i.test(parts[0])) {
    parts = parts.slice(1);
  }
  var folder = rootFolder;
  for (var i = 0; i < parts.length; i++) {
    folder = getOrCreateFolder_(folder, parts[i]);
  }
  return folder;
}

// ===================== CREATE_SITE_FOLDERS =====================

function createSiteFoldersInDrive_(payload) {
  var siteName = payload.siteName;
  var lines = payload.lines && payload.lines.length ? payload.lines : ["Line A", "Line B", "Line C", "Line D"];
  var fatCounts = payload.fatCounts || {};

  var docRoot = DriveApp.getFolderById(CONFIG.DOKUMENTASI_FOLDER_ID);
  var siteFolder = getOrCreateFolder_(docRoot, siteName);

  var lineFolder = getOrCreateFolder_(siteFolder, 'Line');
  lines.forEach(function (ln) {
    getOrCreateFolder_(lineFolder, ln);
  });

  var elektrikFolder = getOrCreateFolder_(siteFolder, 'Elektrik');
  var elTypes = ['Terbuka & Tertutup', 'OPM 1:8'];
  elTypes.forEach(function (elType) {
    var elTypeFolder = getOrCreateFolder_(elektrikFolder, elType);
    ['A', 'B', 'C', 'D'].forEach(function (lineLetter) {
      var count = parseInt(fatCounts[lineLetter], 10) || 0;
      for (var n = 1; n <= count; n++) {
        var fatId = lineLetter + (n < 10 ? '0' + n : String(n));
        getOrCreateFolder_(elTypeFolder, fatId);
      }
    });
  });

  getOrCreateFolder_(siteFolder, 'Pole view');
  getOrCreateFolder_(siteFolder, 'Implementasi');
  getOrCreateFolder_(siteFolder, 'Opname Lapangan');

  return {
    status: 'success',
    siteFolderUrl: siteFolder.getUrl(),
    sowFolderUrl: siteFolder.getUrl()
  };
}

// ===================== UPLOAD_PHOTOS =====================

function uploadWaspangPhotos_(payload) {
  var files = payload.files || [];
  if (!files.length) {
    return { status: 'error', message: 'Tidak ada file untuk diupload.' };
  }

  var docRoot = DriveApp.getFolderById(CONFIG.DOKUMENTASI_FOLDER_ID);
  var targetFolder = getOrCreateFolderPath_(docRoot, payload.subPath);

  var blobs = [];
  files.forEach(function (f) {
    var raw = f.imageBase64 || '';
    var m = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
    var mime = m ? m[1] : 'image/jpeg';
    var b64 = m ? m[2] : raw;
    var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, f.fileName || 'foto.jpg');
    targetFolder.createFile(blob);
    blobs.push(blob);
  });

  logWaspangPhotoToSheet_(payload, targetFolder.getUrl());
  sendWaspangPhotosToTelegram_(blobs, buildWaspangPhotoCaption_(payload));

  return { status: 'success', folderUrl: targetFolder.getUrl() };
}

function buildWaspangPhotoCaption_(payload) {
  var caption = "📌 *LAPORAN WASPANG - PT. BUANA MENARA INDONESIA*\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "🏷️ *Site Name* : `" + (payload.siteName || '') + "`\n" +
    "📋 *SOW*       : `" + (payload.sow || '') + "`\n" +
    "🚧 *Progress*  : `" + (payload.progressText || '') + "`\n" +
    "👤 *Waspang*   : " + (payload.waspang || '');
  if (payload.notes) {
    caption += "\n📝 *Catatan*:\n" + payload.notes;
  }
  return caption;
}

function sendWaspangPhotosToTelegram_(blobs, caption) {
  try {
    if (blobs.length === 1) {
      UrlFetchApp.fetch('https://api.telegram.org/bot' + CONFIG.TELEGRAM_BOT_TOKEN + '/sendPhoto', {
        method: 'post',
        payload: {
          chat_id: CONFIG.TELEGRAM_CHAT_ID,
          caption: caption,
          parse_mode: 'Markdown',
          photo: blobs[0]
        },
        muteHttpExceptions: true
      });
      return;
    }

    // Telegram sendMediaGroup menerima maksimal 10 item per panggilan — dipecah per 10 jika lebih.
    for (var start = 0; start < blobs.length; start += 10) {
      var chunk = blobs.slice(start, start + 10);
      var media = [];
      var formPayload = { chat_id: CONFIG.TELEGRAM_CHAT_ID };
      chunk.forEach(function (blob, idx) {
        var key = 'p_' + idx;
        media.push({
          type: 'photo',
          media: 'attach://' + key,
          caption: (start === 0 && idx === 0) ? caption : '',
          parse_mode: 'Markdown'
        });
        formPayload[key] = blob;
      });
      formPayload.media = JSON.stringify(media);
      UrlFetchApp.fetch('https://api.telegram.org/bot' + CONFIG.TELEGRAM_BOT_TOKEN + '/sendMediaGroup', {
        method: 'post',
        payload: formPayload,
        muteHttpExceptions: true
      });
    }
  } catch (err) {
    console.error('Telegram send error: ' + err);
  }
}

function logWaspangPhotoToSheet_(payload, folderUrl) {
  try {
    var ss = getWaspangSpreadsheet_();
    var sheet = ss.getSheetByName('LOG FOTO WASPANG');
    if (!sheet) {
      sheet = ss.insertSheet('LOG FOTO WASPANG');
      sheet.appendRow(['Timestamp', 'Site', 'SOW', 'Kategori', 'Line', 'FAT ID', 'Progress', 'Waspang', 'Catatan', 'Jumlah Foto', 'Folder URL']);
    }
    sheet.appendRow([
      new Date(),
      payload.siteName || '',
      payload.sow || '',
      payload.mainCategory || '',
      payload.lineName || '',
      payload.fatId || '',
      payload.progressText || '',
      payload.waspang || '',
      payload.notes || '',
      (payload.files || []).length,
      folderUrl
    ]);
  } catch (err) {
    console.error('Log photo to sheet error: ' + err);
  }
}

// ===================== DAILY_REPORT =====================

function sendDailyReportEMR_(payload) {
  var text = payload.text || '';
  var chatId = payload.chatId || CONFIG.TELEGRAM_CHAT_ID;
  if (!text) {
    return { status: 'error', message: 'Teks Daily Report kosong.' };
  }
  try {
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + CONFIG.TELEGRAM_BOT_TOKEN + '/sendMessage', {
      method: 'post',
      payload: {
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
      },
      muteHttpExceptions: true
    });
    var json = JSON.parse(res.getContentText());
    if (!json.ok) {
      return { status: 'error', message: json.description || 'Gagal mengirim ke Telegram.' };
    }
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }

  logDailyReportToSheet_(text);
  return { status: 'success' };
}

function logDailyReportToSheet_(text) {
  try {
    var ss = getWaspangSpreadsheet_();
    var sheet = ss.getSheetByName('LOG DAILY REPORT');
    if (!sheet) {
      sheet = ss.insertSheet('LOG DAILY REPORT');
      sheet.appendRow(['Timestamp', 'Isi Laporan']);
    }
    sheet.appendRow([new Date(), text]);
  } catch (err) {
    console.error('Log daily report error: ' + err);
  }
}

// ===================== SYNC_BOQ_EXCEL =====================

function cleanClusterNameForSync_(raw) {
  return String(raw || '').replace(/[​-‍﻿⁠]/g, '').trim();
}

function syncMasterBoqToSheet_(clusters) {
  if (!clusters || !clusters.length) {
    return { status: 'error', message: 'Tidak ada data cluster untuk disinkronkan.' };
  }
  try {
    var ss = getWaspangSpreadsheet_();
    var sheet = ss.getSheetByName('MASTER BOQ CLUSTER');
    if (!sheet) {
      sheet = ss.insertSheet('MASTER BOQ CLUSTER');
      sheet.appendRow(['Cluster', 'SOW', 'Item', 'Key', 'Volume Plan', 'Last Updated']);
    }
    var data = sheet.getDataRange().getValues();
    var CLUSTER_COL = 0, KEY_COL = 3;

    clusters.forEach(function (cl) {
      var clusterName = cleanClusterNameForSync_(cl.fullName || cl.name);
      (cl.items || []).forEach(function (item) {
        var rowIdx = -1;
        for (var i = 1; i < data.length; i++) {
          if (String(data[i][CLUSTER_COL]).trim() === clusterName &&
              String(data[i][KEY_COL]).trim() === String(item.key).trim()) {
            rowIdx = i;
            break;
          }
        }
        var rowValues = [clusterName, cl.sow || '', item.name || '', item.key || '', item.volume || 0, new Date()];
        if (rowIdx === -1) {
          sheet.appendRow(rowValues);
          data.push(rowValues);
        } else {
          sheet.getRange(rowIdx + 1, 1, 1, rowValues.length).setValues([rowValues]);
          data[rowIdx] = rowValues;
        }
      });
    });

    return { status: 'success' };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}
