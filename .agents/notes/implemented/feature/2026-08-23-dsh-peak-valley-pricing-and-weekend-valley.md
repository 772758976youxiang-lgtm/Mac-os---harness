# Agent Note: DeepSeek peak/valley pricing display and weekend all-day valley

Status: implemented

## Problem

DeepSeek bills API usage at peak and valley rates on a fixed daily schedule (peak: Beijing time 09:00–12:00 and 14:00–18:00; off-peak: half price), and from 2026-08-23 weekends are all-day valley. The web UI shows no indication of the active tide anywhere, so a user cannot tell whether the session cost figure is being estimated at peak or valley rates.

## Decision

Port the peak/valley feature into the public tree, end to end, with the weekend rule baked in:

- **Provider service** — `dsh-llm-deepseek` provides `deepseek-official.balance`, reading `GET {baseURL}/user/balance` under the same resolved connection and API key chat requests use. Non-ok responses throw `TRANSPORT`; a response with no derivable total throws `INVALID_RESPONSE`.
- **Host RPC** — `host.balance` on `HostApi`; the gateway answers through `${provider}.balance` of the default model selection. A provider without the service answers `available: false` plus `message`; provider failure under a cancelled caller signal returns `cancelled`, otherwise `internal`. Client faces (fetch carrier, `IApiClient`), zod request/value schemas, and the RPC map gain the row.
- **Runtime** — `IWorkspaces.balance()` (and the test double) forward to the wire; the contract widening is the sanctioned route for host capability reads.
- **Web UI** — the composer stats line leads with the tide: green 谷 (valley) or red 峰 (peak), computed by `isDeepSeekPeak` in Beijing time with weekends returning false (the 2026-08-23 change). The context-meter panel adds 账户余额 (balance row) and 本会话已用 (session cost + billed tokens) rows; the cost uses the same tide factor via `tokenMoneyRates` / `sessionCost`, so estimates track the actual billing rule.

**Accurate per-request pricing (host fold).** The `tokenUsage` session projection now also accumulates `cost` (CNY, optional on the wire view) in its O(1) state: each usage sample is priced under the `request/context` route logged for that request (provider + model) at the sample's own `event.time`, using DeepSeek's official per-model rates and peak windows — so a peak-hour request keeps its peak price when the session later runs into valley hours, and vice versa. Same-step usage replacement reprices instead of double-counting (the `last` slot carries the priced cost, stateVersion bumped 1→2 so stale cache rows fold from the log). Non-deepseek routes contribute 0 and the view omits `cost`, so the UI falls back to its current-rate heuristic rather than guessing a currency. The client prefers the durable `cost`; the price table duplicated in the UI is only the fallback for logs the host has not repriced yet (and the stats-line badge).

The price table lives client-side (`PROVIDER_MODEL_PRICES` in StatsLine) with per-1M CNY rates keyed by provider then model; unknown entries fall back to the Flash rates with no off-peak factor, and only the `deepseek-official` provider applies the tide factor.

### Notes

Output copy is Chinese (峰/谷, 账户余额, 本会话已用) with English translations alongside, per the repo's product-copy convention. The badge colors are literal `rgb(229,72,77)` (peak) / `rgb(48,164,108)` (valley), mirroring the deployed build.

## Consequences

- The stats row text is no longer the one string a snapshot or UI assertion compares; specs pin the wall clock (`vi.setSystemTime`) so the tide is deterministic in tests.
- `IWorkspaces` widened, so `TestWorkspaces` gained `balance()` with a "not queryable" default; feature tests stub it for richer flows.
- Session-cost figures are estimates (client-side rates, peak-hour dynamic); actual billing is DeepSeek's own.
