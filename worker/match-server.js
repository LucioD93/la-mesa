// One match as a Durable Object: a PartyServer whose room (server/room.js) holds the
// match in memory, saves it to the object's SQLite storage, and runs its timers on the
// object's alarm. It hibernates: between messages it sleeps with its sockets open, so
// an idle table costs no duration, and it wakes from the saved record.
import { Server } from 'partyserver';
import { createRoom } from '../server/room.js';
import { COUNTRY_HEADER, countryOf } from '../server/analytics.js';

const SWEEP_MS = 60_000; // how often to look for sockets that went quiet
const QUIET_MS = 75_000; // no ping or message for this long: the phone is gone (the client pings every 10 s)
const OVERDUE_MS = 2_000; // an alarm this far past its time without running was dropped
const PING = JSON.stringify({ t: 'ping' });
const PONG = JSON.stringify({ t: 'pong' });

export class MatchServer extends Server {
  static options = { hibernate: true };

  #alarm = undefined; // the alarm set in storage, as far as this object knows; undefined after a wake from sleep
  #want = null; // the alarm the room and the sweep need
  #inAlarm = false;
  #sweepAt = null;

  constructor(ctx, env) {
    super(ctx, env);
    // The client's keep-alive is answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  onStart() {
    const { ctx, env } = this;
    this.room = createRoom(this.name, {
      load: () => ctx.storage.kv.get('room'),
      save: (record) => ctx.storage.kv.put('room', record),
      forget: () => ctx.storage.deleteAll(),
      connections: () => this.getConnections(),
      wakeAt: (at) => this.#wakeAt(at),
      // A stub made in one event and called from another can hang that call, and with it
      // the alarm that made it, so each report gets its own. Nothing waits for the answer.
      report: (id, live, usage) => {
        env.STATS.getByName('global')
          .report(id, live, usage)
          .catch((err) => console.error('[stats]', err));
      },
    });
  }

  onConnect(conn, { request }) {
    this.room.connect(conn, countryOf(request.headers.get(COUNTRY_HEADER)));
    conn.setState({ ...conn.state, seen: Date.now() });
  }

  onMessage(conn, message) {
    if (conn.state) conn.setState({ ...conn.state, seen: Date.now() });
    this.room.message(conn, message);
  }

  onClose(conn) {
    this.room.close(conn);
  }

  onError(conn) {
    this.room.close(conn);
  }

  onAlarm() {
    this.#alarm = null; // the one that ran is gone
    this.#inAlarm = true;
    try {
      const now = Date.now();
      if (!this.#sweepAt || this.#sweepAt <= now) this.#sweep(now);
      this.room.wake();
    } finally {
      this.#inAlarm = false;
    }
    // Only the handler moves the alarm later or clears it, once per run (see #wakeAt).
    const next = this.#want;
    if (next === this.#alarm) return;
    this.#alarm = next;
    if (next == null) this.ctx.storage.deleteAlarm();
    else this.ctx.storage.setAlarm(next);
  }

  /** Close sockets that stopped answering, as the Node server's pings do. */
  #sweep(now) {
    this.#sweepAt = null;
    for (const conn of this.getConnections()) {
      const pinged = this.ctx.getWebSocketAutoResponseTimestamp(conn)?.getTime() ?? 0;
      if (Math.max(conn.state?.seen ?? 0, pinged) > now - QUIET_MS) continue;
      this.room.close(conn); // its close may never arrive
      try {
        conn.close(1001, 'quiet');
      } catch {}
    }
  }

  /**
   * One alarm for the room's earliest timer and the next sweep. Outside the alarm handler
   * it only ever moves earlier: an alarm moved later while the handler's own change is in
   * flight can end up scheduled for the wrong time (workerd#7330). An alarm earlier than
   * needed just runs the handler early, and the handler then sets the right one.
   */
  #wakeAt(at) {
    let next = at;
    if (this.getConnections()[Symbol.iterator]().next().done) this.#sweepAt = null;
    else {
      this.#sweepAt ??= Date.now() + SWEEP_MS;
      next = next == null ? this.#sweepAt : Math.min(next, this.#sweepAt);
    }
    this.#want = next;
    if (this.#inAlarm || next == null) return;
    const now = Date.now();
    // An alarm that should have run by now was dropped: setting it again re-syncs it.
    if (this.#alarm != null && this.#alarm < now - OVERDUE_MS) next = now + 1;
    else if (this.#alarm != null && this.#alarm <= next) return; // undefined (not known) sets it
    this.#alarm = next;
    this.ctx.storage.setAlarm(next);
  }
}
