'use strict';
/**
 * Anonymous playthrough analytics for qilu-huakai (v1).
 *
 * What is sent: only enum values and numbers — difficulty, birth year,
 * region, turn number, commitment card/choice ids, venture archetype ids,
 * outcome enums. NEVER free text: the player's venture idea text and any
 * other input are never uploaded.
 *
 * Who is tracked: nobody identifiable. client_id is a random string kept
 * in localStorage, unrelated to any account; session_id is random per run.
 * The server stores no IP and writes no access log.
 *
 * When nothing is sent: the endpoint is empty (not deployed yet), the
 * player opted out (footer toggle, localStorage qilu_analytics_off=1),
 * or the request fails. Failure is silent and never blocks the game;
 * the game stays fully playable offline.
 *
 * Transport: navigator.sendBeacon, falling back to fetch keepalive.
 * No retries: a failed send is dropped, never queued across sessions.
 */
let ANALYTICS_ENDPOINT = ''; // filled in after the tunnel is up, e.g. 'https://<random>.trycloudflare.com'

const ANALYTICS_EVENTS = new Set([
  'session_start', 'turn_start', 'commitment', 'venture_start',
  'venture_year', 'year_end', 'slice', 'settlement',
]);

const Analytics = (() => {
  let clientId = null;
  let sessionId = null;

  function randId() {
    try {
      const b = new Uint8Array(16);
      (window.crypto || {}).getRandomValues
        ? window.crypto.getRandomValues(b)
        : b.forEach((_, i) => { b[i] = Math.floor(Math.random() * 256); });
      return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      return 'fallback-' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
    }
  }

  function optedOut() {
    try { return localStorage.getItem('qilu_analytics_off') === '1'; } catch (e) { return false; }
  }

  function init() {
    try {
      clientId = localStorage.getItem('qilu_analytics_client');
      if (!clientId) {
        clientId = randId();
        localStorage.setItem('qilu_analytics_client', clientId);
      }
    } catch (e) { clientId = randId(); }
    sessionId = randId();
  }

  function setOptOut(off) {
    try { localStorage.setItem('qilu_analytics_off', off ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  function track(event, data) {
    if (!ANALYTICS_EVENTS.has(event)) return false;
    if (!ANALYTICS_ENDPOINT || optedOut() || !clientId || !sessionId) return false;
    const payload = JSON.stringify({
      v: 1, client_id: clientId, session_id: sessionId,
      event, turn: (data && typeof data.turn === 'number') ? data.turn : undefined,
      data: data || {},
    });
    try {
      if (navigator.sendBeacon) return navigator.sendBeacon(ANALYTICS_ENDPOINT + '/v1/event', payload);
      fetch(ANALYTICS_ENDPOINT + '/v1/event', {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json' }, body: payload,
      }).catch(() => {});
      return true;
    } catch (e) { return false; }
  }

  return { init, track, setOptOut, optedOut };
})();

if (typeof module !== 'undefined') module.exports = { Analytics, ANALYTICS_EVENTS };
