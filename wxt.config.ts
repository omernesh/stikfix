import { defineConfig } from 'wxt';

// Firefox add-on identity (FUT-01 → shipped). Must match the native-messaging
// manifest's `allowed_extensions` entry (host/src/bootstrap/register.ts) and the
// gecko id the bootstrapper registers (bin/stikfix.ts --browser firefox).
const GECKO_ID = 'stikfix@stikfix.com';

export default defineConfig({
  // WXT 0.20 defaults the firefox target to MV2. stikfix is MV3-only by spec
  // (Chrome MV3 service worker, scripting/permissions APIs), so pin MV3 for all
  // targets — Firefox 109+ supports MV3 background scripts + browser_specific_settings.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'stikfix',
    description: 'Pin sticky notes on any page — your AI reads them.',
    version: '1.7.0',
    icons: {
      16: '/icon/16.png',
      32: '/icon/32.png',
      48: '/icon/48.png',
      128: '/icon/128.png',
    },
    // Phase 3 additions — D-04 / EXT-01
    // Phase 9 addition — ONB-02/03: native messaging for auto-pairing (extension-only API)
    permissions: ['activeTab', 'scripting', 'storage', 'tabs', 'nativeMessaging'],
    // Chrome/Edge: pin the stable extension ID via the manifest `key` (base64
    // SPKI/DER public key → ccdfmbhdcafhmnnnfjpbhgebfkfgjgca). Firefox ignores
    // `key` and identifies the add-on via browser_specific_settings.gecko.id, so
    // emit each browser its own identity field and never both at once.
    //
    // Stable extension ID (Phase 9 enhancement): base64 SPKI/DER public key.
    // Generated with Node crypto.generateKeyPairSync('rsa',{modulusLength:2048}).
    // Private key is in .keys/stikfix-extension.pem (gitignored — needed only for CWS publish).
    // Derived extension ID: ccdfmbhdcafhmnnnfjpbhgebfkfgjgca
    // To re-derive: sha256(DER-public-key-bytes)[0..15] → hex → map 0-9a-f to a-p
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: GECKO_ID,
              strict_min_version: '109.0',
            },
          },
        }
      : {
          key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1RFrtpIlsiHwm21+ISi8v5381HQeJq2pw4lgbvqQ2a6o2uZ6H1uHfT+1xRy2msqHzXMOJOhwfAKuwBoebATIFDcms132Msz11DJPHUgoVX29sh9PWxUN5aJ/KovtPgIXoEDTKg/QtV+C9Hza0bcdncqymi9xBw5De/rRn/ZQdkXx2ZFiIm6AuHE0Q4dJrSPLqRLEFxP7mf+/SNPQ0LGDYsWUBbDLz8ksMU0VrrDDtRbDSPhBglxNzVYv00MYpwPEHijBCG9wQ57a34tDuA2/TFvNSwpbkWIYiGe6GyN5DvVHdIZgHcmTxSoY43Xu8EAvX+isRp3DdK8j3tAx1C/wIwIDAQAB',
        }),
    host_permissions: ['http://127.0.0.1/*', 'http://localhost/*'],
    optional_host_permissions: ['<all_urls>'],
    // Note: no static content_scripts — review UI is injected on-demand via
    // chrome.scripting.executeScript (D-04 / EXT-02)
  }),
  hooks: {
    // CR-01: WXT hoists web_accessible_resources[].matches into host_permissions,
    // including the '<all_urls>' pattern from the runtime content-script CSS.
    // PRD §7.1 mandates host_permissions contain ONLY localhost at install time;
    // '<all_urls>' must be requested on demand via optional_host_permissions.
    // Strip it here after WXT's manifest generation so the grant model is correct.
    'build:manifestGenerated'(_wxt, manifest) {
      manifest.host_permissions = (manifest.host_permissions ?? [])
        .filter((p: string) => p !== '<all_urls>');
    },
  },
});
