/**
 * Pure folds for durable provider-reported token usage and context occupancy.
 */

import { z } from 'zod'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { ContextPressureProjection, TokenUsageProjection } from './projection.ts'
import { foldSurfaceProjection } from './surface-projection.ts'

const zeroBuckets = (): TokenUsageProjection => ({
  uncachedInputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
})

const bucketsFrom = (usage: TokenUsage): TokenUsageProjection => ({
  uncachedInputTokens: usage.inputTokens,
  outputTokens: usage.outputTokens,
  cacheReadTokens: usage.cacheReadTokens ?? 0,
  cacheWriteTokens: usage.cacheWriteTokens ?? 0,
})

const bucketsEqual = (left: TokenUsageProjection, right: TokenUsageProjection): boolean =>
  left.uncachedInputTokens === right.uncachedInputTokens
  && left.outputTokens === right.outputTokens
  && left.cacheReadTokens === right.cacheReadTokens
  && left.cacheWriteTokens === right.cacheWriteTokens

const addReplacing = (
  totals: TokenUsageProjection,
  previous: TokenUsageProjection | undefined,
  next: TokenUsageProjection,
): TokenUsageProjection => ({
  uncachedInputTokens: totals.uncachedInputTokens - (previous?.uncachedInputTokens ?? 0) + next.uncachedInputTokens,
  outputTokens: totals.outputTokens - (previous?.outputTokens ?? 0) + next.outputTokens,
  cacheReadTokens: totals.cacheReadTokens - (previous?.cacheReadTokens ?? 0) + next.cacheReadTokens,
  cacheWriteTokens: totals.cacheWriteTokens - (previous?.cacheWriteTokens ?? 0) + next.cacheWriteTokens,
})

const projectionSchema = z.object({
  uncachedInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
}).strict()

/** DeepSeek official peak-hour CNY price per 1M tokens by model (off-peak = half). */
const DEEPSEEK_RATES: Record<string, { inputCacheHit: number; inputCacheMiss: number; output: number }> = {
  'deepseek-v4-flash': { inputCacheHit: 0.1, inputCacheMiss: 3, output: 9 },
  'deepseek-v4-flash-vision-exp': { inputCacheHit: 0.1, inputCacheMiss: 3, output: 9 },
  'deepseek-v4-pro': { inputCacheHit: 0.3, inputCacheMiss: 9, output: 27 },
}

/** Fallback rate when the model has no exact entry (Flash's table). */
const DEEPSEEK_DEFAULT_RATE = { inputCacheHit: 0.1, inputCacheMiss: 3, output: 9 }

/**
 * Whether `timeMs` falls in a DeepSeek peak window in Beijing time (UTC+8):
 * 09:00–12:00, 14:00–18:00. Since 2026-08-23 weekends (Saturday/Sunday) are
 * all-day off-peak — the weekday-only split no longer applies to them.
 * @param timeMs - Unix epoch milliseconds.
 * @returns true only inside a weekday peak window.
 */
export function isDeepSeekPeakAt(timeMs: number): boolean {
  const beijing = new Date(timeMs + 8 * 3_600_000)
  const day = beijing.getUTCDay()
  if (day === 0 || day === 6) return false
  const h = beijing.getUTCHours()
  return (h >= 9 && h < 12) || (h >= 14 && h < 18)
}

/**
 * Estimated CNY cost of one usage sample at `timeMs` for the route's model:
 * each bucket times its per-1M rate, scaled by the peak/off-peak factor at
 * the moment the billing was incurred (an estimate, not DeepSeek's ledger).
 * @param buckets - the sample's disjoint token buckets.
 * @param timeMs - when the sample was reported.
 * @param model - the route's model id.
 * @returns the cost in CNY.
 */
export function deepseekUsageCost(buckets: TokenUsageProjection, timeMs: number, model: string): number {
  const base = DEEPSEEK_RATES[model] ?? DEEPSEEK_DEFAULT_RATE
  const factor = isDeepSeekPeakAt(timeMs) ? 1 : 0.5
  return (
    buckets.cacheReadTokens / 1_000_000 * base.inputCacheHit
    + (buckets.uncachedInputTokens + buckets.cacheWriteTokens) / 1_000_000 * base.inputCacheMiss
    + buckets.outputTokens / 1_000_000 * base.output
  ) * factor
}

/**
 * The token-usage unit's state schema — the one definition of the state
 * shape; the state type is inferred from it.
 */
const tokenUsageStateSchema = z.object({
  totals: projectionSchema,
  /** Accumulated DeepSeek-official estimate (CNY), priced per sample at its report time. */
  cost: z.number().nonnegative(),
  /** Route of the most recent request; the pricing table applies only to `deepseek-official`. */
  route: z.object({
    provider: z.string(),
    model: z.string(),
  }).nullable(),
  last: z.object({
    turn: z.number().int().nonnegative(),
    step: z.number().int().nonnegative(),
    buckets: projectionSchema,
    /** Cost of the last sample, so a same-step replacement reprices rather than double-counts. */
    cost: z.number().nonnegative(),
  }).nullable(),
}).strict()

/** Wire view: the four totals plus the cost when any deepseek-priced usage accumulated. */
const tokenUsageViewSchema = projectionSchema.extend({
  cost: z.number().nonnegative().optional(),
}).strict().transform(({ cost, ...totals }) => (
  cost === undefined ? totals : { ...totals, cost }
))

type TokenUsageState = z.infer<typeof tokenUsageStateSchema>

const pressureSchema: z.ZodType<ContextPressureProjection> = z.object({
  pressureTokens: z.number().int().nonnegative().optional(),
  projectedTokens: z.number().int().nonnegative().optional(),
  contextWindow: z.number().int().positive().optional(),
}).strict().transform(({ pressureTokens, projectedTokens, contextWindow }) => ({
  ...pressureTokens === undefined ? {} : { pressureTokens },
  ...projectedTokens === undefined ? {} : { projectedTokens },
  ...contextWindow === undefined ? {} : { contextWindow },
}))

/** Prompt-side pressure of one request: input plus cache traffic, no output. */
const pressureFrom = (usage: TokenUsage): number =>
  usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0)

/** The usage a chunk or finalized message reports for its step, if any. */
const usageOf = (event: SessionEvent): TokenUsage | undefined =>
  event.type === 'assistant/chunk' && event.data.chunk.type === 'usage'
    ? event.data.chunk.usage
    : event.type === 'assistant/message'
      ? event.data.usage
      : undefined

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    tokenUsage: TokenUsageState
    contextPressure: ContextPressureState
  }
}

/** The context-pressure state schema and source of its inferred type. */
const contextPressureStateSchema = z.object({
  contextWindow: z.number().int().positive().optional(),
  pressureTokens: z.number().int().nonnegative().optional(),
  surfaceTokens: z.number().int().nonnegative(),
  sampledSurfaceTokens: z.number().int().nonnegative().optional(),
  claim: z.object({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    tokens: z.number().int().nonnegative(),
  }).optional(),
}).strict()

type ContextPressureState = z.infer<typeof contextPressureStateSchema>

/**
 * Token-meter's session projection unit.
 *
 * Usage chunks provide an early sample that survives a later request failure;
 * an assistant message provides the final sample for the same turn/step. A
 * repeated sample replaces that step's earlier value instead of double
 * counting it. The single `last` slot relies on the session-log invariant
 * that usage reports for one turn/step are adjacent: once a later step begins,
 * a legal log never reports usage for an earlier step again.
 */
export const tokenUsageProjectionDefinition = {
  key: 'tokenUsage',
  stateVersion: 2,
  stateSchema: tokenUsageStateSchema,
  init: () => ({ totals: zeroBuckets(), cost: 0, route: null, last: null }),
  apply: (state, event) => {
    // The pricing table applies only to the DeepSeek-official route, so the
    // fold tracks the route each request logged before pricing its usage.
    if (event.type === 'request/context') {
      const provider = event.data.provider
      const model = event.data.model
      if (state.route !== null && state.route.provider === provider && state.route.model === model) return state
      return { ...state, route: { provider, model } }
    }

    let turn: number
    let step: number
    let usage: TokenUsage
    if (event.type === 'assistant/chunk' && event.data.chunk.type === 'usage') {
      ;({ turn, step } = event.data)
      usage = event.data.chunk.usage
    } else if (event.type === 'assistant/message' && event.data.usage !== undefined) {
      ;({ turn, step, usage } = event.data)
    } else {
      return state
    }

    const buckets = bucketsFrom(usage)
    const previous = state.last !== null
      && state.last.turn === turn
      && state.last.step === step
      ? state.last
      : undefined
    if (previous !== undefined && bucketsEqual(previous.buckets, buckets)) return state

    // Price at the report time with the route active for that request: a
    // peak-hour request keeps its peak price even when the session runs on
    // into valley hours (and vice versa). Non-DeepSeek routes cost 0 and the
    // view then omits the estimate entirely rather than guessing a currency.
    const priced = state.route !== null && state.route.provider === 'deepseek-official'
      ? deepseekUsageCost(buckets, event.time, state.route.model)
      : 0

    return {
      totals: addReplacing(state.totals, previous?.buckets, buckets),
      cost: state.cost - (previous?.cost ?? 0) + priced,
      route: state.route,
      last: { turn, step, buckets, cost: priced },
    }
  },
  wire: {
    viewSchema: tokenUsageViewSchema,
    view: state => state.cost > 0 ? { ...state.totals, cost: state.cost } : state.totals,
  },
} satisfies ProjectionDefinition<'tokenUsage', TokenUsageState>

/**
 * Token-meter's context-occupancy projection unit.
 *
 * Independent last-wins slots: the newest usage sample supplies the provider
 * numerator, the newest `request/context` record the denominator. Both are
 * whole values, so replay order alone decides the result and no cross-field
 * consistency is claimed — the pair is explicitly not one atomic request
 * observation (see {@link ContextPressureProjection}).
 *
 * `pressureTokens` is prompt-side only, so it holds still while a turn streams
 * and steps forward once the next request reports its usage. Because nothing
 * but a request reports usage, it also cannot see a compaction: the fold
 * therefore carries a running surface total alongside it and publishes
 * `projectedTokens` — the sample plus the surface's signed movement since it
 * was taken — so occupancy answers for the next request rather than the last
 * one. The total rides {@link foldSurfaceProjection}, so the state stays O(1)
 * and a replacement shrinks it by its logged shadow price. A replacement
 * without a claim preserves the previous total. A usage sample is stamped
 * BEFORE the same event joins the surface, so an `assistant/message` anchors
 * against the surface its own request saw.
 */
export const contextPressureProjectionDefinition = {
  key: 'contextPressure',
  stateVersion: 4,
  stateSchema: contextPressureStateSchema,
  init: () => ({ surfaceTokens: 0 }),
  apply: (state, event) => {
    const fold = foldSurfaceProjection(state.claim, event)
    let next = state
    if (event.type === 'request/context') {
      const contextWindow = event.data.contextWindow
      if (contextWindow !== state.contextWindow) {
        if (contextWindow !== undefined) {
          next = { ...next, contextWindow }
        } else {
          const { contextWindow: _removed, ...withoutContextWindow } = next
          next = withoutContextWindow
        }
      }
    }
    const usage = usageOf(event)
    if (usage !== undefined) {
      const pressureTokens = pressureFrom(usage)
      if (pressureTokens !== next.pressureTokens || next.sampledSurfaceTokens !== next.surfaceTokens) {
        next = { ...next, pressureTokens, sampledSurfaceTokens: next.surfaceTokens }
      }
    }
    if (fold.deltaTokens !== 0) {
      next = { ...next, surfaceTokens: next.surfaceTokens + fold.deltaTokens }
    }
    // A defined fold.claim is always freshly built, so presence decides claim
    // bookkeeping: no claim before or after this event leaves `next` as is.
    if (state.claim === undefined && fold.claim === undefined) return next
    const { claim: _expired, ...withoutClaim } = next
    return fold.claim === undefined ? withoutClaim : { ...withoutClaim, claim: fold.claim }
  },
  wire: {
    viewSchema: pressureSchema,
    view: ({ contextWindow, pressureTokens, surfaceTokens, sampledSurfaceTokens }) => ({
      ...contextWindow === undefined ? {} : { contextWindow },
      ...pressureTokens === undefined ? {} : { pressureTokens },
      ...pressureTokens === undefined || sampledSurfaceTokens === undefined
        ? {}
        : { projectedTokens: Math.max(0, pressureTokens + surfaceTokens - sampledSurfaceTokens) },
    }),
  },
} satisfies ProjectionDefinition<'contextPressure', ContextPressureState>
