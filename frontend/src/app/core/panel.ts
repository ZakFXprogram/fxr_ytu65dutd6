/**
 * The owner's panel has no fixed URL in this code. The server adds <meta name="fxr-panel" content="..."> only to
 * the page it serves at the secret path, so the path never appears in the public JavaScript.
 */
import { demoApi } from './demo/demo-setup';

export const PANEL_PATH: string | null = (() => {
  if (demoApi) return demoApi.panelPath; // preview build only
  if (typeof document === 'undefined') return null;
  const v = document.querySelector<HTMLMetaElement>('meta[name="fxr-panel"]')?.content ?? '';
  return /^[a-z0-9][a-z0-9-]{15,63}$/.test(v) ? v : null;
})();
