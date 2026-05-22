// ─── Chiffrement AES-256-GCM via Web Crypto API ──────────────────────────────
// Utilise PBKDF2 pour dériver une clé depuis le mot de passe utilisateur.
// Chaque chiffrement génère un IV aléatoire — les données ne sont jamais identiques.

const ITERATIONS = 100_000
const KEY_USAGE  = ['encrypt', 'decrypt']

function b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function unb64(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0))
}

/**
 * Dérive une clé AES-256-GCM depuis un mot de passe et un sel.
 * @param {string}     password
 * @param {Uint8Array} salt      – 16 bytes aléatoires
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKey(password, salt) {
  const enc     = new TextEncoder()
  const keyMat  = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, hash: 'SHA-256', iterations: ITERATIONS },
    keyMat,
    { name: 'AES-GCM', length: 256 },
    false,
    KEY_USAGE
  )
}

/**
 * Chiffre une chaîne JSON avec AES-256-GCM.
 * @param {string}    plaintext
 * @param {CryptoKey} key
 * @returns {Promise<{ iv: string, data: string }>}  – base64
 */
export async function encrypt(plaintext, key) {
  const iv         = crypto.getRandomValues(new Uint8Array(12))
  const encoded    = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  return { iv: b64(iv), data: b64(ciphertext) }
}

/**
 * Déchiffre un bloc AES-256-GCM.
 * @param {string}    data  – base64 ciphertext
 * @param {string}    iv    – base64 IV
 * @param {CryptoKey} key
 * @returns {Promise<string>}
 * @throws si mot de passe incorrect (OperationError)
 */
export async function decrypt(data, iv, key) {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(iv) },
    key,
    unb64(data)
  )
  return new TextDecoder().decode(plaintext)
}

/**
 * Génère un sel aléatoire de 16 bytes (stocké en clair avec les données chiffrées).
 * @returns {string} base64
 */
export function newSalt() {
  return b64(crypto.getRandomValues(new Uint8Array(16)))
}
