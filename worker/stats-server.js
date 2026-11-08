// The usage counters and who's online across matches (server/stats.js), as one Durable
// Object named "global". Rooms call `report`; the admin page reads the rest. Cloudflare's
// own numbers are fetched here too: reading them takes more CPU than a free-plan Worker
// gets for a request (10 ms), an object has 30 s, and all the Worker's copies share one cache.
import { DurableObject } from 'cloudflare:workers';
import { createCloudflareUsage } from '../server/cloudflare.js';
import { Stats } from '../server/stats.js';

export class StatsServer extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.stats = new Stats(ctx.storage.kv);
    this.cloudflare = createCloudflareUsage();
  }

  cloudflareUsage(now) {
    return this.cloudflare.usage(now);
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
