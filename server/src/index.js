const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const http = require('http');
const { WebSocketServer } = require('ws');
const { createPlaybackSession, listOutputDevices } = require('../audio');

const port = Number(process.env.PORT || 3001);
const rootDir = path.resolve(__dirname, '..');
const clientDistDir = path.resolve(rootDir, '..', 'client', 'dist');
const dataDir = path.join(rootDir, 'data');
const uploadsDir = path.join(rootDir, 'uploads');
const dbFile = path.join(dataDir, 'library.json');
const clientBuildExists = fs.existsSync(clientDistDir);

function ensureStorage() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });

  if (!fs.existsSync(dbFile)) {
    fs.writeFileSync(
      dbFile,
      JSON.stringify({ tracks: [], settings: { selectedDeviceId: 'default' } }, null, 2)
    );
  }
}

function readDb() {
  ensureStorage();
  return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
}

function writeDb(nextDb) {
  ensureStorage();
  const tempFile = `${dbFile}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(nextDb, null, 2));
  fs.renameSync(tempFile, dbFile);
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeBaseName(name) {
  return (
    String(name)
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'track'
  );
}

function createTrackFileName(originalName) {
  return `${createId()}-${sanitizeBaseName(originalName)}.mp3`;
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, createTrackFileName(file.originalname))
  }),
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = ['audio/mpeg', 'audio/mp3', 'audio/x-mpeg'];
    if (allowedMimeTypes.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.mp3')) {
      cb(null, true);
      return;
    }

    cb(new Error('Solo file MP3 supportati'));
  }
});

app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

if (clientBuildExists) {
  app.use(express.static(clientDistDir));
}

const db = readDb();
let devices = listOutputDevices();
let currentProcess = null;
let playbackState = {
  status: 'idle',
  trackId: null,
  trackName: null,
  startedAt: null,
  selectedDeviceId: db.settings?.selectedDeviceId || 'default',
  selectedDeviceName: null,
  lastError: null
};

function resolveDeviceName(deviceId) {
  const device = devices.find((item) => item.id === deviceId);
  return device ? device.name : 'Default output';
}

playbackState.selectedDeviceName = resolveDeviceName(playbackState.selectedDeviceId);

function getSnapshot() {
  return {
    tracks: db.tracks,
    devices,
    playback: playbackState
  };
}

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === 1 && client._socket && !client._socket.destroyed) {
      try {
        client.send(payload);
      } catch {
        // Ignore sockets that were torn down between the readyState check and send.
      }
    }
  }
}

function emitSnapshot() {
  broadcast({ type: 'snapshot', data: getSnapshot() });
}

function persistSettings() {
  writeDb({ ...db, settings: { selectedDeviceId: playbackState.selectedDeviceId } });
}

function setPlaybackState(nextState) {
  playbackState = { ...playbackState, ...nextState };
  broadcast({ type: 'playback', data: playbackState });
}

function refreshDevices() {
  devices = listOutputDevices();
  setPlaybackState({ selectedDeviceName: resolveDeviceName(playbackState.selectedDeviceId) });
  broadcast({ type: 'devices', data: devices });
}

function selectDevice(deviceId) {
  const normalizedDeviceId = deviceId || 'default';
  const selectedDevice = devices.find((item) => item.id === normalizedDeviceId);

  if (!selectedDevice && normalizedDeviceId !== 'default') {
    throw new Error('Device audio non trovato');
  }

  playbackState.selectedDeviceId = normalizedDeviceId;
  playbackState.selectedDeviceName = resolveDeviceName(normalizedDeviceId);
  persistSettings();
  setPlaybackState({
    selectedDeviceId: playbackState.selectedDeviceId,
    selectedDeviceName: playbackState.selectedDeviceName,
    lastError: null
  });
}

function stopPlayback() {
  if (currentProcess) {
    try {
      currentProcess.kill('SIGKILL');
    } catch {
      // Ignore shutdown errors.
    }
    currentProcess = null;
  }

  setPlaybackState({
    status: 'idle',
    trackId: null,
    trackName: null,
    startedAt: null,
    lastError: null
  });
}

function playTrack(trackId) {
  const track = db.tracks.find((item) => item.id === trackId);

  if (!track) {
    throw new Error('Track non trovato');
  }

  stopPlayback();

  const filePath = path.join(uploadsDir, track.fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error('File audio assente sul server');
  }

  const session = createPlaybackSession(filePath, playbackState.selectedDeviceId);
  currentProcess = session.ffmpeg;

  setPlaybackState({
    status: 'playing',
    trackId: track.id,
    trackName: track.originalName,
    startedAt: new Date().toISOString(),
    lastError: null
  });

  const sessionProcess = currentProcess;

  sessionProcess.on('exit', () => {
    if (currentProcess !== sessionProcess) {
      return;
    }

    currentProcess = null;

    setPlaybackState({
      status: 'idle',
      trackId: null,
      trackName: null,
      startedAt: null
    });
  });

  sessionProcess.on('error', (error) => {
    if (currentProcess !== sessionProcess) {
      return;
    }

    currentProcess = null;
    setPlaybackState({
      status: 'error',
      lastError: error.message
    });
  });
}

app.get('/api/bootstrap', (_req, res) => {
  res.json(getSnapshot());
});

app.get('/api/tracks', (_req, res) => {
  res.json(db.tracks);
});

app.get('/api/devices', (_req, res) => {
  res.json(devices);
});

app.post('/api/devices/select', (req, res) => {
  try {
    selectDevice(req.body?.deviceId);
    emitSnapshot();
    res.json({ ok: true, playback: playbackState });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/api/tracks/:id/play', (_req, res) => {
  try {
    playTrack(req.params.id);
    emitSnapshot();
    res.json({ ok: true, playback: playbackState });
  } catch (error) {
    setPlaybackState({ status: 'error', lastError: error.message });
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/api/stop', (_req, res) => {
  stopPlayback();
  emitSnapshot();
  res.json({ ok: true, playback: playbackState });
});

app.post('/api/refresh-devices', (_req, res) => {
  refreshDevices();
  emitSnapshot();
  res.json({ ok: true, devices });
});

app.post('/api/tracks', upload.single('audio'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ ok: false, error: 'Nessun file caricato' });
    return;
  }

  const track = {
    id: createId(),
    originalName: req.file.originalname,
    fileName: req.file.filename,
    mimeType: req.file.mimetype,
    size: req.file.size,
    createdAt: new Date().toISOString(),
    url: `/uploads/${req.file.filename}`
  };

  db.tracks.unshift(track);
  writeDb(db);
  emitSnapshot();
  res.status(201).json(track);
});

wss.on('connection', (socket) => {
  try {
    socket.send(JSON.stringify({ type: 'snapshot', data: getSnapshot() }));
  } catch {
    socket.close();
    return;
  }

  socket.on('message', (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString());

      if (message.type === 'play') {
        playTrack(message.trackId);
        emitSnapshot();
        return;
      }

      if (message.type === 'stop') {
        stopPlayback();
        emitSnapshot();
        return;
      }

      if (message.type === 'select-device') {
        selectDevice(message.deviceId);
        emitSnapshot();
        return;
      }

      if (message.type === 'refresh-devices') {
        refreshDevices();
        emitSnapshot();
      }
    } catch (error) {
      if (socket.readyState === 1 && socket._socket && !socket._socket.destroyed) {
        try {
          socket.send(JSON.stringify({ type: 'error', error: error.message }));
        } catch {
          // Ignore send failures on closing sockets.
        }
      }
    }
  });
});

if (clientBuildExists) {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDistDir, 'index.html'));
  });
}

server.listen(port, () => {
  console.log(`merdboard server running on http://localhost:${port}`);
});
