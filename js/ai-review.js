'use strict';
/**
 * AI review for the venture line (v0.3).
 *
 * The player writes a money-making idea in their own words and may add a
 * short explanation of why it is reasonable. On request, the idea is sent
 * to a free, keyless AI endpoint (Pollinations text API — no login, no key,
 * no payment) which returns a verdict: is the idea reasonable, which
 * archetype it really is, and a sensible startup cost. The verdict is the
 * FINAL result: it overrides the keyword guess.
 *
 * Opt-in only: nothing is sent unless the player taps 请 AI 审核. If the
 * call fails, times out, or the endpoint drops the connection (it does so
 * occasionally — verified 2026-11-16), the game falls back to the keyword
 * result and says so. The game stays playable offline.
 *
 * v0.7.1: the verdict can now say the idea is not a venture at all
 * (archetype "none", only with reasonable=false) — e.g. asking family for
 * money to buy a house. The keyword classifier has no "not a venture"
 * answer (it falls through to generic), so the local non-venture guard in
 * engine.js catches those first; the AI is the player's appeal route, and
 * its reasonable=true verdict re-opens the normal archetype panel.
 */
const AI_REVIEW_ENDPOINT = 'https://text.pollinations.ai/';
const AI_REVIEW_TIMEOUT_MS = 60000;
const AI_REVIEW_MAX_COST = 15;

function buildVentureReviewPrompt(text, explanation, guessName) {
  const lines = [
    '你是一个人生模拟游戏的创业审核员。玩家想凭一个赚钱点子开一条创业线。',
    '玩家点子：' + String(text || '').trim().slice(0, 150),
  ];
  if (explanation && String(explanation).trim()) {
    lines.push('玩家补充说明（他认为这个点子合理的原因）：' + String(explanation).trim().slice(0, 150));
  }
  lines.push('关键词分类初步判断为：' + (guessName || '未知') + '。请你独立审核，不要只顺着初步判断。');
  lines.push('只返回 JSON，不要其他文字：{"reasonable": true/false, "archetype": "ai-tool/content/opensrc/ecommerce/service/knowledge/local/generic/none 其中一个（根本不是创业点子时写 none）", "cost": 启动成本（万元，0到15的数字）, "reason": "一句话理由，不超过60字"}');
  lines.push('判断标准：点子是否说得清卖什么、卖给谁、怎么收费；启动成本是否符合该类型（轻资产 0–3 万，实体 1–15 万）；明显空想、违法或完全没商业逻辑的判 reasonable=false。');
  lines.push('如果这根本不是一个创业点子（比如向家里要钱买房、买车，找工作，考公务员），直接判 reasonable=false，archetype 写 none，并一句话说清为什么它不是创业线。');
  return lines.join('\n');
}

function parseVentureVerdict(raw, archetypes, fallback) {
  try {
    const s = String(raw || '');
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start < 0 || end <= start) return { ok: false, error: 'AI 没有返回可读的结论。' };
    const obj = JSON.parse(s.slice(start, end + 1));
    const ids = (archetypes || []).map((a) => a.id);
    // v0.7.1: "none" is a legal answer only with reasonable=false — the AI
    // saying the idea is not a venture at all. A reasonable=true verdict
    // must name a real line, so "none" there falls back to the guess.
    let archetypeId = null;
    if (obj.archetype === 'none') {
      archetypeId = (obj.reasonable === true) ? (fallback && fallback.id) : null;
    } else if (ids.includes(obj.archetype)) {
      archetypeId = obj.archetype;
    } else {
      archetypeId = fallback && fallback.id;
    }
    if (!archetypeId && obj.reasonable === true) return { ok: false, error: 'AI 返回的类型不在可选范围内。' };
    let cost = Number(obj.cost);
    if (!isFinite(cost)) cost = (archetypes.find((a) => a.id === archetypeId) || {}).cost ?? 2;
    cost = Math.max(0, Math.min(AI_REVIEW_MAX_COST, Math.round(cost * 10) / 10));
    return {
      ok: true,
      verdict: {
        reasonable: obj.reasonable === true,
        archetypeId,
        cost,
        reason: String(obj.reason || '').slice(0, 120) || '（AI 没有给理由）',
      },
    };
  } catch (e) {
    return { ok: false, error: 'AI 的结论解析失败。' };
  }
}

async function reviewVentureWithAI(text, explanation, archetypes, guess, fetchImpl, timeoutMs) {
  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!doFetch) return { ok: false, error: '当前环境发不出网络请求。' };
  const url = AI_REVIEW_ENDPOINT + encodeURIComponent(buildVentureReviewPrompt(text, explanation, guess && guess.name)) + '?model=openai';
  const limit = timeoutMs || AI_REVIEW_TIMEOUT_MS;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), limit) : null;
    try {
      const res = await doFetch(url, ctrl ? { signal: ctrl.signal } : {});
      if (!res.ok) return { ok: false, error: `AI 接口返回 ${res.status}。` };
      const raw = await res.text();
      return parseVentureVerdict(raw, archetypes, guess);
    } catch (e) {
      if (attempt === 2) {
        return { ok: false, error: (e && e.name === 'AbortError') ? 'AI 审核超时（60 秒）。' : 'AI 没连上。' };
      }
      // Transient drop (verified 2026-11-16: one long prompt disconnected
      // once, then succeeded in 0.9s on retry). One retry, then give up.
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return { ok: false, error: 'AI 没连上。' };
}

if (typeof module !== 'undefined') {
  module.exports = { AI_REVIEW_ENDPOINT, AI_REVIEW_TIMEOUT_MS, AI_REVIEW_MAX_COST, buildVentureReviewPrompt, parseVentureVerdict, reviewVentureWithAI };
}
