#!/usr/bin/env node
/* Point a stock-firmware MTTL / LG U+ strip at your own server.
 *
 * This is the step that replaces re-flashing. The strip keeps exactly ONE
 * server address in its flash; this rewrites it over the strip's own setup
 * access point. No case opened, no UART, no certification voided.
 *
 *   1. Hold the strip's main button ~10 s until the LED blinks fast.
 *   2. Join its Wi-Fi: TONLY_TAP_XXXXXXX, password LGU_XXXXXXX
 *      (the same 7 characters that follow TONLY_TAP_).
 *   3. node tools/provision-mttl.js --ip <YOUR-SERVER-IP> --ssid "WIFI" --password "PW"
 *   4. Rejoin your normal network. The strip dials <YOUR-SERVER-IP>:10086.
 *
 * Protocol credit: documented by the `powerk` project. Independent
 * implementation; see server/src/mttl.js.
 */

import { connect } from 'node:net';
import { networkInterfaces } from 'node:os';

const SETUP_HOST = process.env.PC_SETUP_HOST || '192.168.1.1';
const SETUP_PORT = Number(process.env.PC_SETUP_PORT || 30300);

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args.set(a.slice(2), process.argv[++i] ?? '');
}

const isIPv4 = (s) =>
  /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(s) &&
  s.split('.').every((o) => Number(o) >= 0 && Number(o) <= 255 && String(Number(o)) === o);

function localAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) out.push(n.address);
    }
  }
  return out;
}

function ask(command, expect, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const socket = connect(SETUP_PORT, SETUP_HOST);
    let buffer = '';
    const done = (fn, v) => { clearTimeout(timer); socket.destroy(); fn(v); };
    const timer = setTimeout(() => done(reject, new Error(`no reply within ${timeoutMs}ms`)), timeoutMs);

    socket.on('connect', () => socket.write(`${command}\r\n`));
    socket.on('data', (c) => {
      buffer += c.toString('latin1').replace(/\0/g, '');
      if (!/\r?\n/.test(buffer)) return;
      const reply = buffer.trim();
      if (expect && !reply.includes(expect)) {
        done(reject, new Error(`strip answered "${reply}", expected "${expect}"`));
      } else done(resolve, reply);
    });
    socket.on('error', (err) => done(reject, err));
    socket.on('close', () => {
      if (buffer.trim()) done(resolve, buffer.trim());
      else done(reject, new Error('connection closed with no reply'));
    });
  });
}

async function main() {
  const ip = args.get('ip');
  const ssid = args.get('ssid');
  const password = args.get('password') ?? '';

  if (!ip || !ssid) {
    console.log('Point a stock-firmware MTTL strip at your server.\n');
    console.log('  node tools/provision-mttl.js --ip <SERVER-IP> --ssid "WIFI" --password "PW"\n');
    console.log('This machine currently has:', localAddresses().join(', ') || '(no external address)');
    console.log('\nUse the address of the machine that will RUN the server — not this laptop,');
    console.log('if they are different. The strip stores one address and dials it forever.');
    process.exit(2);
  }

  // Never pass an unchecked string into the strip's command protocol.
  if (!isIPv4(ip)) {
    console.error(`--ip must be an IPv4 address (got "${ip}")`);
    process.exit(1);
  }
  // The protocol is colon-delimited and line-terminated, so these characters
  // cannot be carried. Refuse rather than truncate the user's Wi-Fi password
  // and leave them debugging a strip that silently never connects.
  for (const [label, value] of [['SSID', ssid], ['password', password]]) {
    if (/[:\r\n]/.test(value)) {
      console.error(`the strip's protocol cannot carry ':' or a newline in the ${label}`);
      process.exit(1);
    }
  }

  console.log(`Looking for the strip's setup service at ${SETUP_HOST}:${SETUP_PORT} ...`);
  try {
    console.log('  ' + await ask(`up:ip:${ip}`, 'ip_ok'));
    console.log('  ' + await ask(`up:connect:${ssid}:${password}`, 'connect_ok'));
  } catch (err) {
    console.error(`\nFailed: ${err.message}\n`);
    console.error('Check that:');
    console.error('  1. the strip is in setup mode (hold the main button ~10 s, LED blinks fast)');
    console.error('  2. this machine is joined to the strip\'s own Wi-Fi (TONLY_TAP_...)');
    console.error('  3. nothing else is holding the strip\'s setup session open');
    process.exit(1);
  }

  console.log(`\nDone. Rejoin your normal network and start the server with:`);
  console.log(`  PC_MTTL_ENABLED=1 npm start`);
  console.log(`The strip will dial ${ip}:10086 within a few seconds.`);
}

main();
