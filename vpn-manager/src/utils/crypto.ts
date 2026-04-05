/**
 * Cifrado AES-GCM para proteger credenciales en reposo (IndexedDB).
 * La llave se genera una vez y se almacena en un store separado de localforage.
 *
 * Protege contra: inspección directa del storage, volcados de base de datos parciales.
 * No protege contra: acceso completo al navegador con las DevTools del usuario.
 *
 * FALLBACK: Si crypto.subtle no está disponible (HTTP sin TLS), usa
 * ofuscación Base64 simple. No es seguro, pero evita el crash.
 */
import localforage from 'localforage';

const KEY_STORE_ITEM = 'mikrotik_enc_key_v1';
const subtle = globalThis.crypto?.subtle;

const keyStore = localforage.createInstance({
  name: 'MikroTikVPNManager',
  storeName: 'key_store',
  description: 'Llave de cifrado AES-GCM para credenciales',
});

async function getOrCreateKey(): Promise<CryptoKey> {
  const stored = await keyStore.getItem<JsonWebKey>(KEY_STORE_ITEM);
  if (stored) {
    return subtle!.importKey(
      'jwk',
      stored,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
  }
  const key = await subtle!.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  const exported = await subtle!.exportKey('jwk', key);
  await keyStore.setItem(KEY_STORE_ITEM, exported);
  return key;
}

// ── Fallback: ofuscación Base64 cuando crypto.subtle no existe (HTTP) ───
const FALLBACK_PREFIX = 'B64:';

function fallbackEncrypt(plain: string): string {
  return FALLBACK_PREFIX + btoa(unescape(encodeURIComponent(plain)));
}

function fallbackDecrypt(encoded: string): string {
  const b64 = encoded.startsWith(FALLBACK_PREFIX) ? encoded.slice(FALLBACK_PREFIX.length) : encoded;
  return decodeURIComponent(escape(atob(b64)));
}

// ── Exports ─────────────────────────────────────────────────────────────

export async function encryptText(plain: string): Promise<string> {
  if (!subtle) return fallbackEncrypt(plain);
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plain);
  const encrypted = await subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptText(encryptedB64: string): Promise<string> {
  if (!subtle || encryptedB64.startsWith(FALLBACK_PREFIX)) return fallbackDecrypt(encryptedB64);
  const key = await getOrCreateKey();
  const combined = Uint8Array.from(atob(encryptedB64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

export async function clearEncryptionKey(): Promise<void> {
  await keyStore.removeItem(KEY_STORE_ITEM);
}
