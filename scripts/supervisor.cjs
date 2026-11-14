const { spawn } = require('child_process');
const path = require('path');

const serverDist = path.resolve(__dirname, '../server/dist/index.js');
const rootDir = path.resolve(__dirname, '..');

console.log('[Supervisor] Starting SRouter server daemon...');

function runServer() {
  const child = spawn(process.execPath, [serverDist], {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    console.log(`[Supervisor] Child exited with code ${code}, signal ${signal}. Respawning in 1s...`);
    setTimeout(runServer, 1000);
  });

  child.on('error', (err) => {
    console.error('[Supervisor] Failed to spawn child process:', err);
    setTimeout(runServer, 2000);
  });
}

runServer();
