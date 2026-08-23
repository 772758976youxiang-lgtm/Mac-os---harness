/** host.balance RPC: default-selection provider balance read and its failure arms. */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { RpcRequest } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { createApiProxy } from '../src/api-proxy.ts'

let nextRpc = 1

function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: RpcId(`balance-${String(nextRpc++)}`), payload }
}

/** Minimal gateway over the default model selection; the balance service is provided per test. */
function gateway(provider: string, model: string) {
  const ctx = new Context()
  // Only the question-provider registration seam is touched at construction;
  // this suite never drives approvals or questions, so the inert provider face
  // satisfies it without mounting the full service stack.
  ctx.provide('userQuestions', { registerProvider: () => () => {} } as never)
  const api = createApiProxy(ctx, {
    defaultModelSelection: () => ({ provider, model }),
    cwd: '/tmp',
  })
  return { api, ctx }
}

describe('host.balance', () => {
  it("returns the provider balance with the selection's provider and model", async () => {
    const { api, ctx } = gateway('deepseek-official', 'deepseek-v4-flash')
    const getBalance = vi.fn().mockResolvedValue({ available: true, currency: 'CNY', totalBalance: 45 })
    ctx.provide('deepseek-official.balance', { getBalance })
    const response = await api.host.balance(request({}), new AbortController().signal)
    expect(response.result).toEqual({
      ok: true,
      value: {
        available: true,
        provider: 'deepseek-official',
        model: 'deepseek-v4-flash',
        currency: 'CNY',
        totalBalance: 45,
      },
    })
    expect(getBalance).toHaveBeenCalledWith(expect.any(AbortSignal))
  })

  it('reports unavailable when the selected provider offers no balance service', async () => {
    const { api } = gateway('other-provider', 'model-x')
    const response = await api.host.balance(request({}), new AbortController().signal)
    expect(response.result).toEqual({
      ok: true,
      value: { available: false, provider: 'other-provider', message: '当前平台不提供余额查询' },
    })
  })

  it('returns cancelled for a provider failure under an aborted caller signal', async () => {
    const { api, ctx } = gateway('deepseek-official', 'deepseek-v4-flash')
    ctx.provide('deepseek-official.balance', {
      getBalance: () => Promise.reject(new Error('boom')),
    })
    const controller = new AbortController()
    controller.abort()
    const response = await api.host.balance(request({}), controller.signal)
    expect(response.result).toEqual({ ok: false, error: { code: 'cancelled', message: '余额查询已取消', details: {} } })
  })

  it('returns internal for a provider failure on a live signal', async () => {
    const { api, ctx } = gateway('deepseek-official', 'deepseek-v4-flash')
    ctx.provide('deepseek-official.balance', {
      getBalance: () => Promise.reject(new Error('network down')),
    })
    const response = await api.host.balance(request({}), new AbortController().signal)
    expect(response.result).toEqual({
      ok: false,
      error: { code: 'internal', message: '余额查询失败: network down', details: {} },
    })
  })
})
