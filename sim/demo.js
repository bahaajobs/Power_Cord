// One command that brings up the whole stack with no external services:
// a development broker, the server, and two virtual strips.
//
//   npm run demo        then open http://localhost:8080
//
// Everything lives in ./data/demo.db, which you can delete to start over.
// This is for development and evaluation. Production runs Mosquitto, real
// credentials and TLS — see docs/09-backend-manual.md.

import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const children = [];

const COLORS = { broker: '\x1b[35m', server: '\x1b[36m', sim: '\x1b[32m' };
const RESET = '\x1b[0m';

function run(label, args, env = {}) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tag = `${COLORS[label] || ''}${label.padEnd(6)}${RESET} │ `;
  const pipe = (stream) => {
    stream.setEncoding('utf8');
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) if (line.trim()) process.stdout.write(tag + line + '\n');
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) process.stdout.write(`${tag}exited with code ${code}\n`);
  });
  children.push(child);
  return child;
}

/** Resolve once the TCP port accepts a connection, so each stage starts in order. */
function waitForPort(port, host = '127.0.0.1', timeoutMs = 15_000) {
  return new Promise((resolvePromise, reject) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      const socket = connect(port, host);
      socket.once('connect', () => { socket.destroy(); resolvePromise(); });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) reject(new Error(`port ${port} never opened`));
        else setTimeout(attempt, 150);
      });
    };
    attempt();
  });
}
const env = {
  PC_DB: process.env.PC_DB || resolve(root, 'data/demo.db'),
  PC_ADMIN_PASSWORD: process.env.PC_ADMIN_PASSWORD || 'powercord',
  PC_PORT: process.env.PC_PORT || '8080',
  PC_MQTT_URL: 'mqtt://127.0.0.1:1883',
};

console.log('Starting the demo stack — broker, server, two virtual strips.\n');

run('broker', ['sim/broker.js']);

await waitForPort(1883);
run('server', ['--disable-warning=ExperimentalWarning', 'server/src/index.js'], env);

await waitForPort(Number(env.PC_PORT));
run('sim', ['sim/simulator.js'], { PC_SIM_COUNT: process.env.PC_SIM_COUNT || '2' });

console.log(`
┌────────────────────────────────────────────────────────────┐
│  Open  http://localhost:${String(env.PC_PORT).padEnd(4)}                              │
│  Sign in as  admin / ${env.PC_ADMIN_PASSWORD.padEnd(12)}                          │
│  Ctrl-C stops everything.                                  │
└────────────────────────────────────────────────────────────┘
`);

const shutdown = () => {
  console.log('\nstopping...');
  for (const c of children) c.kill('SIGTERM');
  setTimeout(() => process.exit(0), 600);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
