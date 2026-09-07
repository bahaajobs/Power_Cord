// A throwaway MQTT broker so the whole stack runs on one machine with nothing
// installed. Use Mosquitto in production — this has no authentication, no TLS
// and no persistence, and it binds to localhost for that reason.
// See docs/09-backend-manual.md for the real broker setup.

import { createServer } from 'node:net';
import Aedes from 'aedes';

const port = Number(process.env.PC_BROKER_PORT || 1883);
const host = process.env.PC_BROKER_HOST || '127.0.0.1';
const aedes = new Aedes();

aedes.on('client', (c) => console.log(`[broker] + ${c.id}`));
aedes.on('clientDisconnect', (c) => console.log(`[broker] - ${c.id}`));

createServer(aedes.handle).listen(port, host, () => {
  console.log(`[broker] listening on mqtt://${host}:${port}  (development only)`);
});
