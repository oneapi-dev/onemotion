/**
 * How long one model step may take, measured here on the server: the whole
 * answer, the wait for the first byte and the stream that follows, must arrive
 * within it. A reasoning model writing a long concept, or a provider that only
 * answers once it is done, can take minutes; a 45-second film's concept is the
 * longest single reply the studio asks for. The browser's own retry sits above
 * this. ONEMOTION_STEP_TIMEOUT_MS overrides it; a hosted deployment is also
 * capped by the route's own `maxDuration`, so keep this below it.
 */
export const STEP_TIMEOUT_MS = Math.max(60_000, Math.round(Number(process.env.ONEMOTION_STEP_TIMEOUT_MS)) || 570_000);

/**
 * How long the connection to a provider may sit idle before it is given up on.
 * Kept above the step budget so the step's own abort (which carries a message
 * the person can read) always fires first, not the socket's own timeout.
 */
export const CONNECTION_TIMEOUT_MS = STEP_TIMEOUT_MS + 30_000;
