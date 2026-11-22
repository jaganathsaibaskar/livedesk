/**
 * LiveDesk backend – Google Apps Script
 * Stores all LiveDesk data as one JSON file in your own Google Drive.
 *
 * Setup:
 * 1. Signed in with your PERSONAL Gmail, open script.google.com > New project.
 * 2. Name it "LiveDesk Backend", delete the sample code and paste this whole file.
 * 3. Change SECRET_KEY below to your own private word (no spaces). Save.
 * 4. Deploy > New deployment > type "Web app"
 *      Execute as: Me    |    Who has access: Anyone
 *    Deploy, allow the permissions, and copy the Web app URL.
 * 5. In LiveDesk > Settings paste the URL and the same SECRET_KEY, then tap "Save & sync".
 */

const SECRET_KEY = 'livedesk2026';  // must match the key in LiveDesk Settings
const FILE_NAME = 'LiveDesk Data.json';
const FOLDER_NAME = 'LiveDesk';

function doGet(e) {
  try { return read_(e); }
  catch (err) { console.error(err); return out_({ ok: false, error: String(err && err.message || err) }); }
}

function read_(e) {
  if (!checkKey_(e.parameter.key)) return out_({ ok: false, error: 'Wrong key' });
  const f = getFile_(false);
  const data = f ? JSON.parse(f.getBlob().getDataAsString() || 'null') : null;
  return out_({ ok: true, data: data });
}

function doPost(e) {
  try { return save_(e); }
  catch (err) { console.error(err); return out_({ ok: false, error: String(err && err.message || err) }); }
}

function save_(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'Bad request' }); }
  if (!checkKey_(body.key)) return out_({ ok: false, error: 'Wrong key' });
  if (!body.data || !body.data.projects) return out_({ ok: false, error: 'No data' });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return out_({ ok: false, error: 'Busy, try again' });
  try {
    const f = getFile_(true);
    const current = JSON.parse(f.getBlob().getDataAsString() || 'null');
    // keep the newer copy – never overwrite newer data with older
    if (current && current.updatedAt > body.data.updatedAt) return out_({ ok: true, kept: 'server', data: current });
    if (current) backup_(current);
    f.setContent(JSON.stringify(body.data));
    return out_({ ok: true, savedAt: Date.now() });
  } finally {
    lock.releaseLock();
  }
}

function checkKey_(k) { return String(k || '') === SECRET_KEY; }

function folder_() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function getFile_(create) {
  const fo = folder_();
  const it = fo.getFilesByName(FILE_NAME);
  if (it.hasNext()) return it.next();
  return create ? fo.createFile(FILE_NAME, 'null', MimeType.PLAIN_TEXT) : null;
}

// one backup per day, last 14 days kept
function backup_(data) {
  const fo = folder_();
  const name = 'Backup ' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd') + '.json';
  const it = fo.getFilesByName(name);
  if (it.hasNext()) it.next().setContent(JSON.stringify(data));
  else fo.createFile(name, JSON.stringify(data), MimeType.PLAIN_TEXT);
  const all = [];
  const files = fo.getFiles();
  while (files.hasNext()) { const f = files.next(); if (f.getName().indexOf('Backup ') === 0) all.push(f); }
  all.sort((a, b) => b.getName().localeCompare(a.getName()));
  all.slice(14).forEach(f => f.setTrashed(true));
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
