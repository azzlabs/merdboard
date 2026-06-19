const { spawn } = require('child_process');

function isMacOS() {
  return process.platform === 'darwin';
}

function getFfplayPath() {
  try {
    return require('ffplay-static');
  } catch {
    return null;
  }
}

function listOutputDevices() {
  return [{ id: 'default', name: 'Default output' }];
}

function createPlaybackSession(filePath) {
  if (isMacOS()) {
    const afplay = spawn('afplay', [filePath], {
      stdio: ['ignore', 'ignore', 'pipe']
    });

    return { ffmpeg: afplay, output: null };
  }

  const ffplayPath = getFfplayPath();
  if (!ffplayPath) {
    throw new Error('ffplay-static non disponibile: reinstallare le dipendenze');
  }

  const ffplay = spawn(ffplayPath, ['-nodisp', '-autoexit', '-loglevel', 'error', filePath], {
    stdio: ['ignore', 'ignore', 'pipe']
  });

  return { ffmpeg: ffplay, output: null };
}

module.exports = {
  createPlaybackSession,
  listOutputDevices
};
