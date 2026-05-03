# COSTS.md — Per-Unit Costs and Margin Projections

> Living doc. Update when prices change, when usage data lands, or when we add a new provider. The point of this file is to answer "if we add 1000 users tomorrow, what does that cost?" without redoing the math from scratch each time.

---

## Today's stack (v0.4.1)

| Component | Provider | Tier | Cost |
|---|---|---|---|
| Desktop binary distribution | GitHub Releases | Free | ₹0 |
| Auto-updater manifest | GitHub redirect | Free | ₹0 |
| Code signing | None (unsigned) | Free | ₹0 — defer to 200+ users |
| Worker (HTTP API) | Cloudflare Workers | Free (100K req/day) | ₹0 |
| KV (license + cache) | Cloudflare KV | Free (100K reads/day, 1K writes/day) | ₹0 |
| Cache API (60s TTL) | Cloudflare | Free | ₹0 |
| ASR (voice transcription) | Workers AI `whisper-large-v3-turbo` | Free (10K neurons/day) | ₹0 |
| Polish (voice) | Gemini Flash 2.5 (primary) → Workers AI Llama 3.3 70B (fallback) | Free | ₹0 |
| Rewrite | Gemini Flash 2.5 (primary) → Workers AI Llama 3.3 70B (fallback) | Free | ₹0 |
| Transactional email | Resend | Free (3K/mo) | ₹0 |
| Marketing site hosting | Vercel | Free (100GB egress/mo) | ₹0 |
| Payment processing | Razorpay | 2.36% per txn | Variable |
| Domain (when bought) | TBD | ~₹1,000/yr | ₹0 today |

**Total fixed monthly cost today: ₹0.** Variable cost is just Razorpay txn fees (paid out of revenue, never out of pocket).

---

## Per-action cost projection (paid path, when keys are wired)

| Action | Free path (today) | Paid path (when scale demands) | Notes |
|---|---|---|---|
| `/rewrite` cache hit | ₹0 (1 KV read) | ₹0 | After v0.4.1 cache; ~30-50% of /rewrite calls expected |
| `/rewrite` cache miss | ₹0 (Gemini free tier) | ~₹0.05 (Gemini paid: $0.075 / 1M input + $0.30 / 1M output, ~500 tokens total) | First time + cache-expired |
| `/voice` clean English (skip-polish) | ₹0 (Whisper free tier) | ~₹0.42 (Whisper-1: $0.006/min × ~5s avg) | Whisper only, polish skipped |
| `/voice` Hindi/Hinglish (with polish) | ₹0 (free tier) | ~₹0.92 (Whisper $0.42 + Claude Haiku $0.50 for 200-token polish) | Whisper + Claude; ~50% of voice calls |
| Razorpay charge (Pro ₹299) | — | ₹7.06 | 2.36% txn fee |
| Razorpay charge (Pro+ ₹499) | — | ₹11.78 | 2.36% txn fee |
| Razorpay charge (founding ₹4,900) | — | ₹115.64 | 2.36% txn fee |

---

## Per-user monthly cost projection (paid path, scale)

Assumptions:
- **Active free user**: 5 rewrites/lifetime (capped) + 0 voice → ~5 cache-miss /rewrites total. Cost: ₹0.25 lifetime.
- **Pro user (₹299/mo)**: 50 rewrites/day, 0 voice. With 50% cache hit rate: 25 cache hits + 25 misses per day. Daily cost: 25 × ₹0.05 = ₹1.25. Monthly: ₹37.50.
- **Pro+ user (₹499/mo)**: 50 rewrites/day + 5 voice clips/day (mix of English/Hindi). Rewrites: ₹37.50/mo. Voice: 2.5 skip-polish clips × ₹0.42 + 2.5 full-polish clips × ₹0.92 = ₹3.35/day = ₹100/mo. Total: ₹137.50/mo.
- **Founding member**: same usage profile as Pro+, paid once ₹4,900. Cost-to-serve: ₹137.50/mo. Break-even at 36 months (3 years).

| Tier | Revenue/mo | AI cost/mo | Razorpay fee | **Margin/mo** | **Margin %** |
|---|---|---|---|---|---|
| Free (today, all-free stack) | ₹0 | ₹0 | — | ₹0 | n/a |
| Pro (₹299) | ₹299 | ₹37.50 | ₹7.06 | **₹254.44** | 85% |
| Pro+ (₹499) | ₹499 | ₹137.50 | ₹11.78 | **₹349.72** | 70% |
| Founding (₹4,900 lifetime) | ₹4,900 (one-time) | ₹137.50/mo | ₹115.64 (one-time) | Break-even at month 35 | After yr 3 = pure cost |

**Conclusion:** Pro+ at 70% margin is the healthiest paid tier. Pro at 85% is the highest-margin but lowest-revenue. Founding members are an early-adopter loss-leader that pays off only after year 3 — keep the cap at 50 to bound total exposure.

---

## Break-even and scale milestones

| Milestone | Users | Monthly cost (paid stack) | Monthly revenue | Run-rate |
|---|---|---|---|---|
| Today (all-free) | <100 | ₹0 | ₹0 | — |
| First paying customers | 30 founding + 0 Pro | ₹4,125 (founding × ₹137.50/mo) | ₹0 monthly recurring | 30 × ₹4,900 paid in once = ₹1.47L cash |
| 100 Pro subscribers | 100 Pro | ₹3,750 | ₹29,900 | ₹26,150/mo profit |
| 500 Pro + 100 Pro+ | 600 paid | ₹32,500 | ₹199,400 | ₹1.67L/mo profit (~₹20L/yr) |
| 1000 Pro + 500 Pro+ + 50 founding | 1550 paid | ₹113,500 | ₹548,500 | ₹4.35L/mo profit (~₹52L/yr) |
| Free-tier exhaustion warning | ~200 daily-active free users | Workers AI free tier (10K neurons) starts to bind | — | Add OPENAI_API_KEY at this point |

**Practical takeaway:** All-free stack handles the first ~200 daily-active users comfortably. Past that, set `OPENAI_API_KEY` (Whisper) and `GEMINI_API_KEY` is already set. ANTHROPIC_API_KEY is optional — Workers AI Llama is good enough for polish at scale.

---

## Cost defenses already in place (v0.4.1)

1. **Rewrite cache (24h TTL)** — saves ~30-50% of `/rewrite` calls.
2. **Skip-polish heuristic** — saves ~50% of `/voice` polish calls.
3. **Edge-cached /founding/count (60s)** — saves ~99% of KV reads on this endpoint.
4. **Per-IP rewrite cap (100/day)** — bounds per-IP abuse.
5. **Per-email voice cap (100/day)** — bounds per-email abuse.
6. **Body size limits** — 100KB on `/rewrite`, 8MB on `/voice`. Blocks denial-of-wallet attacks.
7. **Provider fallback** — `/rewrite` falls through to Workers AI when Gemini quota is hit. Avoids paying for Anthropic when free is enough.
8. **Cron pre-warm** — keeps isolate warm. Free, but improves perceived latency without scaling spend.

## Cost defenses planned for v0.5.0+

1. **Audio downsampling** (cpal-side, 16kHz mono before encode) — cuts `/voice` upload bandwidth ~80%, lowers Worker CPU-ms.
2. **Per-user analytics dashboard** — see which users are heavy hitters; tighten caps for outliers if needed.
3. **Tiered Whisper model** — for clips <5s, use a smaller faster Whisper. Cuts neuron count.
4. **Opt-in "premium quality" path** for Pro+ users that uses Anthropic Claude over Llama for the polish step. Charge a slight premium or just include in Pro+. Currently Workers AI is the default for everyone.

---

## When to switch from free to paid providers

| Provider | Free ceiling | Switch trigger | Action |
|---|---|---|---|
| Workers AI Whisper | 10K neurons/day | ~200 daily-active voice users | `wrangler secret put OPENAI_API_KEY` |
| Workers AI Llama (polish) | 10K neurons/day shared | ~500 daily-active rewrite users | Optional — Workers AI usually sufficient |
| Gemini Flash 2.5 | ~50-100 RPD on AI Studio | Already happens during testing! | Use a paid Gemini key OR rely on Workers AI fallback |
| Cloudflare KV | 100K reads/day, 1K writes/day | ~10K daily users | $0.50 per 1M reads beyond. Cheap. |
| Cloudflare Workers | 100K requests/day | ~5K daily users | $5/mo for Workers Paid plan, includes 10M req/day |
| Resend | 3K emails/mo | ~600 paying customers (5 emails/customer/mo) | $20/mo for 50K emails |
| Vercel | 100GB egress/mo | Massive landing traffic | $20/mo Pro plan |
| Razorpay | n/a (% fee) | At scale, switch to PayU or Cashfree (1.99% vs 2.36%) | Saves ~₹2L/yr per ₹1Cr revenue |

---

## Anti-patterns to avoid

1. **Don't enable `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` early.** Workers AI is genuinely sufficient for the first few hundred daily users. Adding paid providers prematurely burns cash on quality differences users won't notice.

2. **Don't shrink the rewrite cache TTL.** 24h is aggressive enough — most repeat patterns happen within a week (sales follow-ups, weekly reports). Shrinking to 1h would 10× our AI calls for marginal cache freshness gain.

3. **Don't add Anthropic Claude as the default.** It's clearly better than Llama 3.3 on edge cases, but the price gap (~₹0.50/clip vs ₹0) is too steep for default use. Reserve Claude for an opt-in "premium quality" Pro+ flag.

4. **Don't pay for code signing until 200+ users.** SmartScreen warning is a friction tax, but marketing copy already explains the workaround. Sales reps and founders will click through; mainstream users won't until you're past launch validation phase.

5. **Don't cache landing-page demo rewrites.** They're rate-limited to 3/IP/day already; caching wouldn't help and could leak one user's input to another's preview.
