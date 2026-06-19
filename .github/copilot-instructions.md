# merdboard Workspace Notes

- Project: full-stack JavaScript soundboard with Node.js backend and React + Tailwind frontend.
- Storage: uploaded MP3 files and playback metadata live on the server under `server/uploads` and `server/data/library.json`.
- Transport: WebSocket sync is used for playback state, device selection, and library updates.
- Playback: server-side playback uses macOS `afplay`; audio device selection uses `SwitchAudioSource` when available.
- Build flow: run `npm run install:all`, then `npm run build` for the frontend, and `npm start` for the server.
