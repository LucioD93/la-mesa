// Product analytics and feature flags, from PostHog. Off unless POSTHOG_KEY is set, so
// local dev, tests and sims send nothing and have every flag on. Only match-level facts
// leave the server: no names, photos, tokens or addresses, and never a single move.
import { publicId } from './match.js';

const DEFAULT_HOST = 'https://us.i.posthog.com';

/** The slice of a match that decides which events a change produced. */
export function glance(match) {
  const humans = match.seats.filter((s) => s && !s.bot).length;
  return {
    id: match.id,
    v: match.v,
    game: match.game,
    phase: match.phase,
    roundNo: match.roundNo,
    scores: [...match.scores],
    target: match.target,
    variant: match.variant,
    theme: match.theme,
    humans,
    bots: match.seats.filter((s) => s?.bot).length,
    takeovers: match.seats.filter((s) => s?.replaced).length, // bots standing in for players who left
    teamNamed: match.teamNames.some(Boolean),
    startedAt: match.startedAt ?? null,
  };
}

/** Events for a match going from `before` to `after` (both from `glance`). */
export function transitions(before, after) {
  const events = [];
  const base = { game: after.game, humans: after.humans, bots: after.bots };
  if (before.v === 0) events.push(['match_created', { game: after.game }]);
  if (before.phase === 'lobby' && after.game !== before.game) {
    events.push(['game_switched', { from: before.game, to: after.game }]);
  }
  if (before.phase !== 'playing' && after.phase === 'playing' && after.roundNo === 1) {
    events.push([
      'match_started',
      { ...base, target: after.target, variant: after.variant, theme: after.theme, team_named: after.teamNamed },
    ]);
  }
  if (before.phase === 'playing' && (after.phase === 'roundEnd' || after.phase === 'matchEnd')) {
    events.push(['round_finished', { ...base, round: after.roundNo, scores: after.scores }]);
  }
  if (before.phase !== 'matchEnd' && after.phase === 'matchEnd') {
    const top = Math.max(...after.scores);
    events.push([
      'match_finished',
      {
        ...base,
        rounds: after.roundNo,
        scores: after.scores,
        winner_team: after.scores.filter((s) => s === top).length === 1 ? after.scores.indexOf(top) : null,
        duration_s: after.startedAt ? Math.round((Date.now() - after.startedAt) / 1000) : null,
      },
    ]);
  }
  if ((before.phase === 'playing' || before.phase === 'roundEnd') && after.phase === 'lobby') {
    events.push(['match_abandoned', { ...base, round: before.roundNo, scores: before.scores }]);
  }
  if (after.takeovers > before.takeovers) events.push(['bot_takeover', { ...base, phase: after.phase }]);
  return events;
}

/**
 * The header the Worker passes a socket's country to its match in, from what Cloudflare
 * saw (`request.cf.country`). The Worker always sets it, so a client can't.
 */
export const COUNTRY_HEADER = 'x-la-mesa-country';

/** A two-letter country code, or null. Cloudflare says `XX` when it doesn't know, and `T1` for Tor. */
export function countryOf(value) {
  const country = String(value || '').toUpperCase();
  return /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : null;
}

/**
 * @param {{ key?: string, host?: string, fetch?: typeof fetch }} [options]
 * Events are sent one at a time without waiting: they are few (a handful per match).
 */
export function createAnalytics({
  key = process.env.POSTHOG_KEY,
  host = process.env.POSTHOG_HOST || DEFAULT_HOST,
  fetch: send = globalThis.fetch,
} = {}) {
  const enabled = !!key;

  /** `distinctId` is a match id or a public player id. `country` is a two-letter code. */
  function capture(event, distinctId, properties = {}, country = null) {
    if (!enabled) return;
    const props = {
      app: 'la-mesa',
      // Events about a match or a player, not a person: no profiles to pay for.
      $process_person_profile: false,
      // The country is all we keep of where a player is, so PostHog must not look up the address.
      $geoip_disable: true,
      ...(country && { $geoip_country_code: country, country }),
      ...properties,
    };
    send(`${host}/i/v0/e/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: key, event, distinct_id: String(distinctId), properties: props, timestamp: new Date().toISOString() }),
    })
      .then((res) => res.ok || console.error('[analytics]', event, res.status))
      .catch((err) => console.error('[analytics]', event, err.message));
  }

  /** Report what a committed change to a match did. `countries` are those of the players connected here. */
  function changed(before, after, country = null, countries = []) {
    for (const [event, props] of transitions(before, glance(after))) {
      capture(event, after.id, { match: after.id, ...props, ...(countries.length && { countries }) }, country);
    }
  }

  const player = (token) => publicId(token);

  /**
   * The feature flags PostHog has on for `distinctId` (a match id), as { key: true }. There
   * are no person profiles, so `properties` stand in for a person's: a flag can target them.
   */
  async function flags(distinctId, properties = {}) {
    const res = await send(`${host}/flags?v=2`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: key, distinct_id: String(distinctId), person_properties: properties }),
    });
    if (!res.ok) throw new Error(`flags: ${res.status}`);
    const body = await res.json();
    return Object.fromEntries(Object.entries(body.flags ?? {}).map(([name, flag]) => [name, flag?.enabled === true]));
  }

  return { enabled, capture, changed, player, flags };
}
