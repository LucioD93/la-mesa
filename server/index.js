import os from 'node:os';
import { createApp } from './app.js';
import { devTools, seed, timeScale } from './dev/config.js';

const PORT = Number(process.env.PORT) || 3000;
const { server } = createApp();

server.listen(PORT, () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal);
  console.log(`La Mesa running on http://localhost:${PORT}`);
  if (lan) console.log(`On your phone (same Wi-Fi): http://${lan.address}:${PORT}`);
  if (devTools()) console.log(`Dev tools on: http://localhost:${PORT}/api/dev (anyone who can reach this server can read every hand)`);
  if (timeScale() !== 1) console.log(`TIME_SCALE=${timeScale()}: bots, forced passes and the slow-player mocking run at that scale`);
  if (seed()) console.log(`SEED=${seed()}: deals, dice and bots repeat for the same moves`);
});
