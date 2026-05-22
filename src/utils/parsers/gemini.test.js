import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// pdfjs-dist requiert des APIs DOM non disponibles en env node
vi.mock('./pdf-extract.js', () => ({
  extractGenericPdfText: vi.fn().mockResolvedValue('mock pdf text'),
  extractPdfText:        vi.fn().mockResolvedValue('mock pdf text'),
  extractPeaText:        vi.fn().mockResolvedValue('mock pea text'),
}))

import { callGemini } from './gemini.js'

// ─── IE2 — Tests gemini.js (mock fetch) ──────────────────────────────────────

const VALID_RESPONSE = [
  { date: '2025-01-15', label: 'Carrefour', amount: -45.20, confidence: 'high' },
  { date: '2025-01-16', label: 'Salaire', amount: 2500, confidence: 'high' },
]

function mockFetch(status, body) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 429 ? 'Too Many Requests' : 'Error',
    json: () => Promise.resolve(body),
  })
}

function mockFetchAbort() {
  return vi.fn().mockRejectedValue(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
}

afterEach(() => { vi.restoreAllMocks() })

describe('callGemini', () => {
  it('parse une réponse valide et retourne le tableau JSON', async () => {
    global.fetch = mockFetch(200, {
      candidates: [{ content: { parts: [{ text: JSON.stringify(VALID_RESPONSE) }] } }]
    })
    const result = await callGemini('texte relevé', 'fake-key')
    expect(result).toHaveLength(2)
    expect(result[0].label).toBe('Carrefour')
    expect(result[1].amount).toBe(2500)
  })

  it('extrait le JSON même entouré de fences markdown', async () => {
    const wrapped = '```json\n' + JSON.stringify(VALID_RESPONSE) + '\n```'
    global.fetch = mockFetch(200, {
      candidates: [{ content: { parts: [{ text: wrapped }] } }]
    })
    const result = await callGemini('texte', 'fake-key')
    expect(result).toHaveLength(2)
  })

  it('quota dépassé (429) → erreur GEMINI_QUOTA', async () => {
    global.fetch = mockFetch(429, { error: { message: 'quota exceeded' } })
    await expect(callGemini('texte', 'fake-key')).rejects.toMatchObject({ code: 'GEMINI_QUOTA' })
  })

  it('clé invalide (403) → erreur GEMINI_AUTH', async () => {
    global.fetch = mockFetch(403, { error: { message: 'invalid key' } })
    await expect(callGemini('texte', 'fake-key')).rejects.toMatchObject({ code: 'GEMINI_AUTH' })
  })

  it('clé invalide (400) → erreur GEMINI_AUTH', async () => {
    global.fetch = mockFetch(400, { error: { message: 'bad request' } })
    await expect(callGemini('texte', 'fake-key')).rejects.toMatchObject({ code: 'GEMINI_AUTH' })
  })

  it('erreur serveur (500) → erreur GEMINI_ERROR', async () => {
    global.fetch = mockFetch(500, { error: { message: 'internal error' } })
    await expect(callGemini('texte', 'fake-key')).rejects.toMatchObject({ code: 'GEMINI_ERROR' })
  })

  it('réponse sans JSON valide → erreur GEMINI_PARSE', async () => {
    global.fetch = mockFetch(200, {
      candidates: [{ content: { parts: [{ text: 'Aucun JSON ici, juste du texte.' }] } }]
    })
    await expect(callGemini('texte', 'fake-key')).rejects.toMatchObject({ code: 'GEMINI_PARSE' })
  })

  it('JSON malformé dans la réponse → erreur GEMINI_PARSE', async () => {
    global.fetch = mockFetch(200, {
      candidates: [{ content: { parts: [{ text: '[{date: "2025", broken json' }] } }]
    })
    await expect(callGemini('texte', 'fake-key')).rejects.toMatchObject({ code: 'GEMINI_PARSE' })
  })

  it('timeout AbortError → erreur GEMINI_TIMEOUT', async () => {
    global.fetch = mockFetchAbort()
    await expect(callGemini('texte', 'fake-key')).rejects.toMatchObject({ code: 'GEMINI_TIMEOUT' })
  })
})
