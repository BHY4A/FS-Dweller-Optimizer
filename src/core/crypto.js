// Save file encryption.
// AES-256-CBC with the long-published static key. CryptoJS is loaded as a
// global by index.html, so it is read from globalThis here rather than
// imported, which also lets tests inject a stub.

const CryptoJS = globalThis.CryptoJS;

// ============================================================
// SAVE FILE CRYPTO
// Fallout Shelter saves are AES-256-CBC with a static key and IV — the
// long-published scheme every open-source save editor uses. Everything runs
// locally in the browser; the file is never uploaded anywhere.
// ============================================================
const KEY_HEX = "a7ca9f3366d892c2f0bef417341ca971b69ae9f7bacccffcf43c62d1d7d021f9";
const IV_HEX  = "7475383967656a693334307438397532";
const CJS_KEY = CryptoJS.enc.Hex.parse(KEY_HEX);
const CJS_IV  = CryptoJS.enc.Hex.parse(IV_HEX);

export function decryptSave(text) {
  const trimmed = text.trim();
  // Some tools hand out already-decrypted JSON; accept that too.
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  const decrypted = CryptoJS.AES.decrypt(
    { ciphertext: CryptoJS.enc.Base64.parse(trimmed) },
    CJS_KEY, { iv: CJS_IV, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
  );
  const json = decrypted.toString(CryptoJS.enc.Utf8);
  if (!json) throw new Error('Decryption produced no readable data');
  return JSON.parse(json);
}
export function encryptSave(obj) {
  return CryptoJS.AES.encrypt(
    CryptoJS.enc.Utf8.parse(JSON.stringify(obj)), CJS_KEY,
    { iv: CJS_IV, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
  ).toString();
}
