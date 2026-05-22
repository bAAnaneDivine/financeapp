import { describe, it, expect } from 'vitest'
import { deriveKey, encrypt, decrypt, newSalt } from './crypto.js'

// ─── IE1 — Tests crypto.js ────────────────────────────────────────────────────

describe('newSalt', () => {
  it('retourne une chaîne base64 non vide', () => {
    const salt = newSalt()
    expect(typeof salt).toBe('string')
    expect(salt.length).toBeGreaterThan(0)
  })

  it('génère des sels différents à chaque appel', () => {
    const s1 = newSalt()
    const s2 = newSalt()
    expect(s1).not.toBe(s2)
  })

  it('représente exactement 16 bytes en base64', () => {
    const salt = newSalt()
    const bytes = Uint8Array.from(atob(salt), c => c.charCodeAt(0))
    expect(bytes.length).toBe(16)
  })
})

describe('deriveKey', () => {
  it('retourne une CryptoKey depuis un mot de passe et un sel', async () => {
    const salt = Uint8Array.from(atob(newSalt()), c => c.charCodeAt(0))
    const key = await deriveKey('motdepasse', salt)
    expect(key).toBeDefined()
    expect(key.type).toBe('secret')
    expect(key.algorithm.name).toBe('AES-GCM')
  })

  it('deux mots de passe différents → clés différentes (round-trip échoue)', async () => {
    const salt = Uint8Array.from(atob(newSalt()), c => c.charCodeAt(0))
    const key1 = await deriveKey('password1', salt)
    const key2 = await deriveKey('password2', salt)
    const { iv, data } = await encrypt('test', key1)
    await expect(decrypt(data, iv, key2)).rejects.toThrow()
  })
})

describe('encrypt / decrypt', () => {
  it('round-trip : chiffrer puis déchiffrer donne le texte original', async () => {
    const salt = Uint8Array.from(atob(newSalt()), c => c.charCodeAt(0))
    const key = await deriveKey('monmotdepasse', salt)
    const plaintext = '{"transactions":[],"profile":{"nom":"Test"}}'
    const { iv, data } = await encrypt(plaintext, key)
    const decrypted = await decrypt(data, iv, key)
    expect(decrypted).toBe(plaintext)
  })

  it('chaque chiffrement produit un résultat différent (IV aléatoire)', async () => {
    const salt = Uint8Array.from(atob(newSalt()), c => c.charCodeAt(0))
    const key = await deriveKey('password', salt)
    const r1 = await encrypt('hello', key)
    const r2 = await encrypt('hello', key)
    expect(r1.iv).not.toBe(r2.iv)
    expect(r1.data).not.toBe(r2.data)
  })

  it('retourne des chaînes base64 valides', async () => {
    const salt = Uint8Array.from(atob(newSalt()), c => c.charCodeAt(0))
    const key = await deriveKey('password', salt)
    const { iv, data } = await encrypt('test', key)
    expect(() => atob(iv)).not.toThrow()
    expect(() => atob(data)).not.toThrow()
  })

  it('mauvais mot de passe → déchiffrement échoue (OperationError)', async () => {
    const salt = Uint8Array.from(atob(newSalt()), c => c.charCodeAt(0))
    const goodKey = await deriveKey('bon-mot-de-passe', salt)
    const badKey  = await deriveKey('mauvais-mot-de-passe', salt)
    const { iv, data } = await encrypt('données sensibles', goodKey)
    await expect(decrypt(data, iv, badKey)).rejects.toThrow()
  })

  it('données corrompues → déchiffrement échoue', async () => {
    const salt = Uint8Array.from(atob(newSalt()), c => c.charCodeAt(0))
    const key = await deriveKey('password', salt)
    const { iv } = await encrypt('test', key)
    const corruptedData = btoa('données corrompues qui ne sont pas du AES-GCM valide!!!')
    await expect(decrypt(corruptedData, iv, key)).rejects.toThrow()
  })

  it('IV incorrect → déchiffrement échoue', async () => {
    const salt = Uint8Array.from(atob(newSalt()), c => c.charCodeAt(0))
    const key = await deriveKey('password', salt)
    const { data } = await encrypt('test', key)
    const wrongIv = btoa(String.fromCharCode(...new Uint8Array(12).fill(0)))
    await expect(decrypt(data, wrongIv, key)).rejects.toThrow()
  })
})
