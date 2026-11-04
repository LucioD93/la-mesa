import os from 'node:os';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 3000;
const { server } = createApp();

server.listen(PORT, () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal);
  console.log(`La Mesa running on http://localhost:${PORT}`);
  if (lan) console.log(`On your phone (same Wi-Fi): http://${lan.address}:${PORT}`);
});
