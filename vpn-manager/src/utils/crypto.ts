/**
 * Cifrado AES-GCM para proteger credenciales en reposo (IndexedDB).
 * La llave se genera una vez y se almacena en un store separado de localforage.
 *
 * Protege contra: inspección directa del storage, volcados de base de datos parciales.
 * No protege contra: acceso completo al navegador con las DevTools del usuario.
 */
import localforage from 'localforage';

const KEY_STORE_ITEM = 'mikrotik_enc_key_v1';

const keyStore = localforage.createInstance({
  name: 'MikroTikVPNManager',
  storeName: 'key_store',
  description: 'Llave de cifrado AES-GCM para credenciales',
});

async function getOrCreateKey(): Promise<CryptoKey> {
  const stored = await keyStore.getItem<JsonWebKey>(KEY_STORE_ITEM);
  if (stored) {
    return crypto.subtle.importKey(
      'jwk',
      stored,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
  }
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  const exported = await crypto.subtle.exportKey('jwk', key);
  await keyStore.setItem(KEY_STORE_ITEM, exported);
  return key;
}

export async function encryptText(plain: string): Promise<string> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plain);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptText(encryptedB64: string): Promise<string> {
  const key = await getOrCreateKey();
  const combined = Uint8Array.from(atob(encryptedB64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

export async function clearEncryptionKey(): Promise<void> {
  await keyStore.removeItem(KEY_STORE_ITEM);
}
