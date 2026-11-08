// The usage counters and who's online across matches (server/stats.js), as one Durable
// Object named "global". Rooms call `report`; the admin page reads the rest.
import { DurableObject } from 'cloudflare:workers';
import { Stats } from '../server/stats.js';

export class StatsServer extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.stats = new Stats(ctx.storage.kv);
  }

  report(id, live, usage) {
    this.stats.report(id, live, usage);
  }

  overview(now) {
    return this.stats.overview(now);
  }

  readUsage(days) {
    return this.stats.readUsage(days);
  }

  failedLogins(address) {
    return this.stats.failedLogins(address);
  }

  addFailedLogin(address, ttlS) {
    this.stats.addFailedLogin(address, ttlS);
  }
}
