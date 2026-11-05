/**
 * Backup HRIS POSI ke Google Spreadsheet (penerima data dari server).
 *
 * CARA PASANG (sekali saja, oleh pemilik spreadsheet):
 * 1. Atur Share spreadsheet ke "Restricted", karena berisi data pribadi & gaji dan editor bisa membaca TOKEN di skrip ini.
 * 2. Buka spreadsheet → Extensions → Apps Script. Hapus isi Code.gs, tempel seluruh file ini, isi TOKEN, lalu Save.
 * 3. Deploy → New deployment → ikon gerigi → Web app.
 *      Description    : Backup HRIS POSI
 *      Execute as     : Me (akun pemilik spreadsheet)
 *      Who has access : Anyone
 *    Klik Deploy → Authorize access → pilih akun → Advanced → Go to … (unsafe) → Allow.
 * 4. Salin "Web app URL" (berakhiran /exec) untuk diisi ke SHEET_BACKUP_URL di server.
 *
 * Catatan:
 * - Data hanya bisa ditulis oleh pengirim yang memegang TOKEN yang sama. "Anyone" hanya berarti server boleh memanggil skrip ini.
 * - Tiap backup mengganti isi sheet; versi lama tetap ada di File → Version history.
 * - Bila jumlah baris sebuah tabel turun lebih dari 50% (mis. database bermasalah), sheet itu TIDAK ditimpa (DITAHAN).
 */

const TOKEN = "ISI_TOKEN_DI_SINI";
const INFO_SHEET = "Info Backup";
const LOG_SHEET = "Riwayat Backup";
const CHUNK = 5000;

function doGet() {
  return json_({ ok: true, message: "Endpoint backup HRIS POSI aktif." });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return json_({ ok: false, error: "Backup lain sedang berjalan." });
  try {
    const body = JSON.parse(e.postData.contents);
    if (!TOKEN || TOKEN.indexOf("ISI_") === 0 || body.token !== TOKEN) return json_({ ok: false, error: "Token tidak cocok." });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (body.selesai === true) {
      writeInfo_(ss, body, body.result || []);
      return json_({ ok: true });
    }
    if (!Array.isArray(body.sheets) || !body.sheets.length) return json_({ ok: false, error: "Data kosong." });
    const result = body.sheets.map(function (s) {
      return writeSheet_(ss, s);
    });
    removeEmptyDefaultSheet_(ss);
    return json_({ ok: true, sheets: result });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

/** Tulis ke sheet sementara dulu, baru tukar dengan sheet lama → sheet lama tetap utuh bila penulisan gagal. */
function writeSheet_(ss, s) {
  const old = ss.getSheetByName(s.name);
  const oldRows = old ? Math.max(0, old.getLastRow() - 1) : 0;
  const newRows = s.rows.length;
  if (oldRows >= 20 && newRows < oldRows * 0.5) {
    return { name: s.name, rows: oldRows, status: "DITAHAN (" + newRows + " < " + oldRows + ")" };
  }

  const tmpName = s.name + " (baru)";
  const stale = ss.getSheetByName(tmpName);
  if (stale) ss.deleteSheet(stale);
  const tmp = ss.insertSheet(tmpName);
  const cols = Math.max(1, s.columns.length);
  const total = newRows + 1;
  if (tmp.getMaxColumns() < cols) tmp.insertColumnsAfter(tmp.getMaxColumns(), cols - tmp.getMaxColumns());
  if (tmp.getMaxRows() < total) tmp.insertRowsAfter(tmp.getMaxRows(), total - tmp.getMaxRows());

  // format teks: NIK, nomor HP, rekening, dan tanggal tetap utuh (tidak berubah jadi angka/tanggal)
  tmp.getRange(1, 1, total, cols).setNumberFormat("@");
  tmp.getRange(1, 1, 1, cols).setValues([s.columns]).setFontWeight("bold").setBackground("#dbeafe");
  for (let r = 0; r < newRows; r += CHUNK) {
    const chunk = s.rows.slice(r, r + CHUNK).map(function (row) {
      return row.map(safe_);
    });
    tmp.getRange(r + 2, 1, chunk.length, cols).setValues(chunk);
  }
  tmp.setFrozenRows(1);

  if (old) ss.deleteSheet(old);
  tmp.setName(s.name);
  ss.setActiveSheet(tmp);
  ss.moveActiveSheet(Math.min(s.index + 1, ss.getSheets().length));
  return { name: s.name, rows: newRows, status: "OK" };
}

/** Cegah teks diartikan sebagai rumus (mis. isian yang diawali "=") */
function safe_(v) {
  if (typeof v === "string" && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function removeEmptyDefaultSheet_(ss) {
  ["Sheet1", "Lembar1"].forEach(function (n) {
    const sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
}

function writeInfo_(ss, body, result) {
  let info = ss.getSheetByName(INFO_SHEET);
  if (!info) info = ss.insertSheet(INFO_SHEET);
  info.clear();
  const total = result.reduce(function (a, r) {
    return a + r.rows;
  }, 0);
  const rows = [
    ["Backup data HRIS POSI", ""],
    ["Backup terakhir", body.generatedAt || new Date().toString()],
    ["Pemicu", body.reason || "-"],
    ["Total baris", String(total)],
    ["", ""],
    ["Sheet", "Baris · Status"],
  ].concat(
    result.map(function (r) {
      return [r.name, r.rows + " · " + r.status];
    }),
  );
  info.getRange(1, 1, rows.length, 2).setNumberFormat("@").setValues(rows);
  info.getRange(1, 1).setFontWeight("bold").setFontSize(13);
  info.getRange(6, 1, 1, 2).setFontWeight("bold").setBackground("#dbeafe");
  info.setColumnWidth(1, 220);
  info.setColumnWidth(2, 260);
  ss.setActiveSheet(info);
  ss.moveActiveSheet(result.length + 1);

  let log = ss.getSheetByName(LOG_SHEET);
  if (!log) {
    log = ss.insertSheet(LOG_SHEET);
    log.getRange(1, 1, 1, 4).setValues([["Waktu", "Pemicu", "Total baris", "Sheet ditahan"]]).setFontWeight("bold");
    log.setFrozenRows(1);
  }
  const held = result.filter(function (r) {
    return r.status !== "OK";
  });
  log.appendRow([body.generatedAt || new Date().toString(), body.reason || "-", total, held.map(function (r) { return r.name; }).join(", ") || "-"]);
  if (log.getLastRow() > 1001) log.deleteRows(2, log.getLastRow() - 1001);
  ss.setActiveSheet(log);
  ss.moveActiveSheet(result.length + 2);
  ss.setActiveSheet(ss.getSheets()[0]);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
