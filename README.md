# merdboard

Soundboard full-stack in JavaScript con backend Node.js, frontend React + Tailwind, upload di MP3 su server, storage locale su JSON e sincronizzazione dello stato di riproduzione via WebSocket.

**Warning: highly vibecoded!**

## Requisiti

- Node.js 20 o superiore
- Playback server-side portabile: `afplay` su macOS, `ffplay` di sistema su Linux e Windows
- Il selettore del device usa il fallback `Default output` su tutte le piattaforme

## Avvio

1. Installa le dipendenze con `npm run install:all`.
2. Avvia in sviluppo con `npm run dev`.
3. Apri il client su `http://localhost:5173`.

## Produzione

1. Crea il build del frontend con `npm run build`.
2. Avvia il server con `npm start`.

## Funzionalità

- Upload di file MP3 dal browser.
- Archivio locale su disco con metadati in JSON.
- Riproduzione lato server portabile con fallback su output predefinito.
- Stato di playback sincronizzato in tempo reale via WebSocket.
