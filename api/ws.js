// Vercel Function: WebSocket endpoint at /api/ws?match=<id>.
// Needs REDIS_URL so every instance sees the same matches.
import { createApp } from '../server/app.js';

export default createApp().server;
