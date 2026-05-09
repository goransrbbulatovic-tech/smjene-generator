const { app, BrowserWindow, ipcMain, dialog, Menu, shell, Notification } = require('electron');
const path = require('path');
const fs   = require('fs');

let mainWindow;
const DATA_DIR  = app.getPath('userData');
const DATA_FILE = path.join(DATA_DIR, 'raspored-data.json');

function ensureDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }

function loadData() {
  try { if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch(e) { console.error('Load error:', e); }
  return { projects: [], currentProject: null, settings: {} };
}

function saveData(data) {
  try { ensureDir(); fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8'); return true; }
  catch(e) { console.error('Save error:', e); return false; }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700,
    frame: false, titleBarStyle: 'hidden', backgroundColor: '#080d1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, spellcheck: false
    }, show: false
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('app-version', app.getVersion());
    mainWindow.webContents.send('load-persisted-data', loadData());
  });
  Menu.setApplicationMenu(null);
  // Check notifications every minute
  setInterval(() => {
    const data = loadData();
    if (!data.projects) return;
    const now   = new Date();
    const today = now.toISOString().slice(0,10);
    const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0,10);
    data.projects.forEach(proj => {
      if (!proj.shifts) return;
      proj.shifts.forEach(s => {
        if (!s.person || !s.date || !s.startTime) return;
        const settings = data.settings || {};
        const notif24On = settings.notif24 !== false;
        const notif1On  = settings.notif1  !== false;
        // 24h before
        if (notif24On && s.date === tomorrow && !s._notif24sent) {
          new Notification({ title: '⏰ Smjena sutra!', body: `${s.person}: ${s.startTime}–${s.endTime} (${s.shiftType})` }).show();
          s._notif24sent = true;
        }
        // 1h before (same day, check time)
        if (notif1On && s.date === today) {
          const [sh, sm] = s.startTime.split(':').map(Number);
          const shiftMins = sh * 60 + sm;
          const nowMins   = now.getHours() * 60 + now.getMinutes();
          if (shiftMins - nowMins <= 60 && shiftMins - nowMins > 58 && !s._notif1sent) {
            new Notification({ title: '🔔 Smjena za 1 sat!', body: `${s.person}: ${s.startTime}–${s.endTime}` }).show();
            s._notif1sent = true;
          }
        }
      });
    });
    if (data.projects.some(p => p.shifts && p.shifts.some(s => s._notif24sent || s._notif1sent))) {
      saveData(data);
    }
  }, 60000);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// Window controls
ipcMain.on('win-minimize', () => mainWindow.minimize());
ipcMain.on('win-maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('win-close',    () => mainWindow.close());

// Persist / Load
ipcMain.handle('persist-data',       async (_, data) => saveData(data));
ipcMain.handle('get-persisted-data', async ()        => loadData());

// Open Excel
ipcMain.handle('open-excel', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Učitaj Excel raspored', properties: ['openFile'],
    filters: [{ name: 'Excel/CSV', extensions: ['xlsx','xls','xlsm','csv'] }]
  });
  if (r.canceled || !r.filePaths.length) return null;
  const fp = r.filePaths[0];
  return { path: fp, name: path.basename(fp), data: fs.readFileSync(fp).toString('base64') };
});

// Auto-refresh Excel (re-read same file)
ipcMain.handle('refresh-excel', async (_, filePath) => {
  try {
    if (!fs.existsSync(filePath)) return { error: 'Fajl nije pronađen: ' + filePath };
    return { name: path.basename(filePath), data: fs.readFileSync(filePath).toString('base64') };
  } catch(e) { return { error: e.message }; }
});

// Save Excel
ipcMain.handle('save-excel', async (_, { defaultName, base64 }) => {
  const r = await dialog.showSaveDialog(mainWindow, {
    title: 'Sačuvaj Excel', defaultPath: defaultName || 'raspored.xlsx',
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  });
  if (r.canceled || !r.filePath) return false;
  fs.writeFileSync(r.filePath, Buffer.from(base64, 'base64'));
  shell.openPath(path.dirname(r.filePath));
  return true;
});

// Open image
ipcMain.handle('open-image', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Odaberi pozadinu', properties: ['openFile'],
    filters: [{ name: 'Slike', extensions: ['jpg','jpeg','png','webp','gif'] }]
  });
  if (r.canceled || !r.filePaths.length) return null;
  const fp = r.filePaths[0];
  const ext = path.extname(fp).toLowerCase().slice(1);
  const mime = ext==='png'?'image/png':ext==='webp'?'image/webp':ext==='gif'?'image/gif':'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(fp).toString('base64')}`;
});

// Export PDF
ipcMain.handle('export-pdf', async (_, { defaultName }) => {
  const r = await dialog.showSaveDialog(mainWindow, {
    title: 'Sačuvaj PDF', defaultPath: defaultName || 'raspored.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (r.canceled || !r.filePath) return false;
  mainWindow.webContents.send('prepare-print');
  await new Promise(res => setTimeout(res, 400));
  const pdf = await mainWindow.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    landscape: false,
    marginsType: 1,
    preferCSSPageSize: true
  });
  fs.writeFileSync(r.filePath, pdf);
  mainWindow.webContents.send('print-done');
  shell.openPath(r.filePath);
  return true;
});

// Backup: save JSON to user-chosen location
ipcMain.handle('backup-export', async () => {
  const r = await dialog.showSaveDialog(mainWindow, {
    title: 'Backup — Sačuvaj podatke', defaultPath: `raspored_backup_${new Date().toISOString().slice(0,10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (r.canceled || !r.filePath) return false;
  fs.writeFileSync(r.filePath, JSON.stringify(loadData(), null, 2), 'utf8');
  shell.openPath(path.dirname(r.filePath));
  return true;
});

// Backup: import JSON
ipcMain.handle('backup-import', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Restore — Učitaj backup', properties: ['openFile'],
    filters: [{ name: 'JSON Backup', extensions: ['json'] }]
  });
  if (r.canceled || !r.filePaths.length) return null;
  try {
    const data = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
    saveData(data);
    return data;
  } catch(e) { return { error: e.message }; }
});

// Send notification manually
ipcMain.handle('send-notification', async (_, { title, body }) => {
  if (Notification.isSupported()) new Notification({ title, body }).show();
});
