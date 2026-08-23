/** `${provider}.balance` service: the DeepSeek `/user/balance` read behind the host.balance RPC. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as LlmDeepSeek from '@deepseek-ai/dsh-llm-deepseek'

let testHome: string

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), 'dsh-llm-deepseek-balance-'))
  vi.stubEnv('DSH_HOME', testHome)
  vi.stubEnv('DEEPSEEK_API_KEY', 'test-key')
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  rmSync(testHome, { recursive: true, force: true })
})

interface BalanceReading {
  available: boolean
  currency?: string
  totalBalance: number
}

/** Mount the real plugin and return its balance service (credentials come from the stubbed env). */
async function balanceServiceOf(baseURL: string): Promise<{ getBalance(signal?: AbortSignal): Promise<BalanceReading> }> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(LlmDeepSeek, { baseURL })
  return ctx.get('deepseek-official.balance')
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('deepseek-official.balance', () => {
  it('serves the balance from /user/balance with the resolved API key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      is_available: true,
      balance_infos: [{ currency: 'CNY', granted_balance: '5.00', topped_up_balance: '40.00', total_balance: '45.00' }],
    }))
    vi.stubGlobal('fetch', fetchMock)
    const balance = await balanceServiceOf('http://api.test/v1')
    await expect(balance.getBalance()).resolves.toEqual({ available: true, currency: 'CNY', totalBalance: 45 })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/user/balance',
      expect.objectContaining({ headers: { authorization: 'Bearer test-key' } }),
    )
  })

  it('derives the total from granted plus topped-up amounts when total_balance is absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      is_available: false,
      balance_infos: [{ currency: 'CNY', granted_balance: 12, topped_up_balance: 3.5 }],
    })))
    const balance = await balanceServiceOf('http://api.test/')
    await expect(balance.getBalance()).resolves.toEqual({ available: false, currency: 'CNY', totalBalance: 15.5 })
  })

  it('passes the caller signal through to the wire request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      is_available: true,
      balance_infos: [{ currency: 'CNY', total_balance: '1.00' }],
    }))
    vi.stubGlobal('fetch', fetchMock)
    const balance = await balanceServiceOf('http://api.test/')
    const signal = new AbortController().signal
    await balance.getBalance(signal)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal })
  })

  it('throws a TRANSPORT LlmError for a non-ok response and surfaces its detail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(
      { message: 'Authentication Fails' },
      401,
    )))
    const balance = await balanceServiceOf('http://api.test/')
    await expect(balance.getBalance()).rejects.toMatchObject({
      code: 'TRANSPORT',
      message: 'DeepSeek balance request failed (HTTP 401)',
      cause: expect.objectContaining({ message: 'Authentication Fails' }),
    })
  })

  it('throws an INVALID_RESPONSE LlmError when no total can be derived', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      is_available: true,
      balance_infos: [{ currency: 'CNY', granted_balance: '' }],
    })))
    const balance = await balanceServiceOf('http://api.test/')
    await expect(balance.getBalance()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('omits the currency when the provider sends a non-string value', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      is_available: true,
      balance_infos: [{ currency: 42, total_balance: '3.00' }],
    })))
    const balance = await balanceServiceOf('http://api.test/')
    await expect(balance.getBalance()).resolves.toEqual({ available: true, currency: undefined, totalBalance: 3 })
  })
})
