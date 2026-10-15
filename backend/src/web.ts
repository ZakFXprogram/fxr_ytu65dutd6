import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

/**
 * The Angular build is copied next to the server at deploy time (see Dockerfile). Locally it is two
 * directories up in frontend/dist/frontend/browser.
 */
export function frontendDir(): string {
  const candidates = [
    join(__dirname, '..', 'public'),
    join(__dirname, '..', '..', 'frontend', 'dist', 'frontend', 'browser'),
  ];
  return candidates.find((p) => existsSync(join(p, 'index.html'))) ?? candidates[0];
}

export interface SpaPages {
  /** index.html as built. */
  site: string | null;
  /** index.html plus the meta tag that tells Angular to mount the panel at this URL. Served only at /<ADMIN_PATH>. */
  panel: string | null;
}

export function loadSpaPages(adminPath: string): SpaPages {
  const file = join(frontendDir(), 'index.html');
  if (!existsSync(file)) return { site: null, panel: null };
  const site = readFileSync(file, 'utf8');
  // adminPath is validated as [a-z0-9-] at startup, so it is safe inside an attribute
  const meta = `<meta name="fxr-panel" content="${adminPath}"><meta name="robots" content="noindex, nofollow">`;
  return { site, panel: site.replace('</head>', `${meta}</head>`) };
}
