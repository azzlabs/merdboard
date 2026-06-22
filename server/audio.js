const { spawn } = require('child_process');

function isMacOS() {
  return process.platform === 'darwin';
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

  const ffplay = spawn('ffplay', ['-nodisp', '-autoexit', '-loglevel', 'error', filePath], {
    stdio: ['ignore', 'ignore', 'pipe']
  });

  return { ffmpeg: ffplay, output: null };
}

module.exports = {
  createPlaybackSession,
  listOutputDevices
};
