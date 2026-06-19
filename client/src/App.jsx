import { useEffect, useMemo, useRef, useState } from 'react';

const emptySnapshot = {
  tracks: [],
  devices: [],
  playback: {
    status: 'idle',
    trackId: null,
    trackName: null,
    startedAt: null,
    selectedDeviceId: 'default',
    selectedDeviceName: 'Default output',
    lastError: null
  }
};

function formatBytes(bytes) {
  if (!bytes) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`;
}

export default function App() {
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [connectionState, setConnectionState] = useState('connecting');
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState('default');
  const wsRef = useRef(null);

  const playback = snapshot.playback;
  const tracks = snapshot.tracks;
  const devices = useMemo(
    () => (snapshot.devices.length ? snapshot.devices : [{ id: 'default', name: 'Default output' }]),
    [snapshot.devices]
  );

  const currentTrack = useMemo(
    () => tracks.find((track) => track.id === playback.trackId) || null,
    [tracks, playback.trackId]
  );

  function getWebSocketUrl() {
    if (import.meta.env.DEV) {
      return 'ws://localhost:3001/ws';
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }

  useEffect(() => {
    let active = true;
    let reconnectTimer = null;

    const connect = () => {
      if (!active) {
        return;
      }

      const socket = new WebSocket(getWebSocketUrl());
      wsRef.current = socket;

      socket.onopen = () => {
        setConnectionState('online');
        socket.send(JSON.stringify({ type: 'refresh' }));
      };

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data);

        if (payload.type === 'snapshot') {
          setSnapshot(payload.data);
          setSelectedDevice(payload.data.playback?.selectedDeviceId || 'default');
          return;
        }

        if (payload.type === 'playback') {
          setSnapshot((current) => ({ ...current, playback: payload.data }));
          return;
        }

        if (payload.type === 'devices') {
          setSnapshot((current) => ({ ...current, devices: payload.data }));
          return;
        }

        if (payload.type === 'error') {
          setUploadMessage(payload.error || payload.message || 'Errore WebSocket');
        }
      };

      socket.onerror = () => setConnectionState('degraded');
      socket.onclose = () => {
        if (!active) {
          return;
        }

        setConnectionState('reconnecting');
        reconnectTimer = window.setTimeout(connect, 1500);
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  async function uploadTrack(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploading(true);
    setUploadMessage('');

    try {
      const formData = new FormData();
      formData.append('audio', file);

      const response = await fetch('/api/tracks', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Upload fallito');
      }

      const createdTrack = await response.json();
      setUploadMessage(`Caricato: ${createdTrack.originalName}`);
    } catch (error) {
      setUploadMessage(error.message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  function sendSocketMessage(message) {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  function playTrack(trackId) {
    setUploadMessage('');
    sendSocketMessage({ type: 'play', trackId });
  }

  function stopTrack() {
    sendSocketMessage({ type: 'stop' });
  }

  function changeDevice(event) {
    const nextDeviceId = event.target.value;
    setSelectedDevice(nextDeviceId);
    sendSocketMessage({ type: 'select-device', deviceId: nextDeviceId });
  }

  const statusLabel = playback.status === 'playing' ? 'In riproduzione' : 'In attesa';

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(241,185,143,0.16),_transparent_28%),linear-gradient(180deg,_#120d0a_0%,_#1c140f_55%,_#120d0a_100%)] text-board-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="grid gap-4 rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-soft backdrop-blur md:grid-cols-[1.5fr_1fr] md:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-board-300/20 ring-1 ring-board-300/30">
              <img src="/poop.svg" alt="merdboard" className="h-11 w-11" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-board-300/80">Server-side soundboard</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight text-white sm:text-5xl">merdboard</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-board-100/80 sm:text-base">
                Carica MP3, scegli l&apos;uscita audio del server e governa la riproduzione in tempo reale.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Stato" value={statusLabel} />
            <Stat label="Connessione" value={connectionState === 'online' ? 'WebSocket attivo' : connectionState} />
            <Stat label="Track" value={tracks.length.toString()} />
          </div>
        </header>

        <main className="flex-1 flex flex-col gap-6">
          <section>
            <Panel title="Soundboard" subtitle="Tutti i file salvati sul server">
              <div className="space-y-4">
                {uploadMessage ? (
                  <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {uploadMessage}
                  </div>
                ) : null}

                {tracks.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-8 text-center text-sm text-board-100/70">
                    Nessun MP3 presente. Carica il primo file per popolare la board.
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {tracks.map((track) => {
                      const active = track.id === playback.trackId;

                      return (
                        <article
                          key={track.id}
                          className={`rounded-[1.5rem] border p-4 shadow-lg transition ${active ? 'border-board-300/70 bg-board-300/10' : 'border-white/10 bg-black/20 hover:border-board-300/30'}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.35em] text-board-300/70">
                                {active ? 'In riproduzione' : 'Pronto'}
                              </p>
                              <h3 className="mt-2 line-clamp-2 text-lg font-bold text-white">{track.originalName}</h3>
                            </div>
                            <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-board-100/80">
                              {formatBytes(track.size)}
                            </span>
                          </div>
                          <p className="mt-4 text-xs text-board-100/55">
                            Caricato {new Date(track.createdAt).toLocaleDateString()}
                          </p>
                          <div className="mt-4 flex gap-2">
                            <button
                              type="button"
                              onClick={() => playTrack(track.id)}
                              className="flex-1 rounded-2xl bg-board-300 px-4 py-3 text-sm font-semibold text-board-950 transition hover:bg-board-100"
                            >
                              Play
                            </button>
                            <button
                              type="button"
                              onClick={stopTrack}
                              className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:border-board-300/40 hover:bg-white/5"
                            >
                              Stop
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </Panel>
          </section>

          <section className="space-y-6">
            <Panel title="Carica MP3" subtitle={uploading ? 'Upload in corso' : 'Trascina o seleziona un file'}>
              <label className="group flex cursor-pointer flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-board-300/30 bg-black/20 px-6 py-10 text-center transition hover:border-board-300/60 hover:bg-black/30">
                <span className="text-lg font-semibold text-white">Scegli un MP3</span>
                <span className="mt-2 text-sm text-board-100/65">Il file viene salvato sul server insieme ai metadati.</span>
                <input accept="audio/mpeg,.mp3" type="file" className="hidden" onChange={uploadTrack} />
              </label>
            </Panel>

            <Panel title="Scheda audio" subtitle="Selezione dell’uscita del server">
              <div className="space-y-3">
                <select
                  value={selectedDevice}
                  onChange={changeDevice}
                  className="w-full rounded-2xl border border-white/10 bg-board-900 px-4 py-3 text-sm text-white outline-none ring-0 transition focus:border-board-300/50"
                >
                  <option value="">Uscita predefinita</option>
                  {devices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.name}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-board-100/65">
                  La riproduzione viene instradata lato server sul dispositivo selezionato.
                </p>
              </div>
            </Panel>

            <Panel title="Now playing" subtitle="Stato corrente del playback">
              {currentTrack ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-board-300/70">Track attiva</p>
                    <h2 className="mt-2 text-2xl font-bold text-white">{currentTrack.originalName}</h2>
                  </div>
                  <div className="grid gap-3 text-sm text-board-100/75 sm:grid-cols-2">
                    <InfoRow label="File" value={currentTrack.originalName} />
                    <InfoRow label="Peso" value={formatBytes(currentTrack.size)} />
                    <InfoRow label="Caricata" value={new Date(currentTrack.createdAt).toLocaleString()} />
                    <InfoRow label="Uscita" value={playback.selectedDeviceName || 'Predefinita'} />
                  </div>
                  <button
                    type="button"
                    onClick={stopTrack}
                    className="inline-flex items-center justify-center rounded-2xl bg-board-300 px-4 py-3 text-sm font-semibold text-board-950 transition hover:bg-board-100"
                  >
                    Stop playback
                  </button>
                </div>
              ) : (
                <p className="text-sm text-board-100/70">Nessun audio in riproduzione.</p>
              )}
            </Panel>
          </section>
        </main>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children }) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-soft backdrop-blur">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-white">{title}</h2>
        <p className="mt-1 text-sm text-board-100/65">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
      <p className="text-[11px] uppercase tracking-[0.35em] text-board-300/70">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.25em] text-board-300/60">{label}</p>
      <p className="mt-1 truncate text-sm text-white">{value}</p>
    </div>
  );
}
