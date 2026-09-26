const MARKER = /<!-- CODE-BOY-OVERLAY-CSP:([A-Za-z0-9+/=]+) -->/;
const META = /<meta\b[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/i;
const CONTENT = /\bcontent\s*=\s*"([^"]*)"/i;
const CONNECT = /\bconnect-src\s+[^;]+/;
export const OVERLAY_ORIGINS = [43821, 43822, 43823, 43824, 43825].map(port => `http://127.0.0.1:${port}`);

export function patchWorkbenchCsp(html: string): string {
  if (MARKER.test(html)) return html;
  const meta = html.match(META)?.[0];
  const policy = meta?.match(CONTENT)?.[1];
  const directive = policy?.match(CONNECT)?.[0];
  if (!meta || !policy || !directive) throw new Error('Could not locate the workbench connect-src security policy.');
  const updated = directive.trimEnd() + ' ' + OVERLAY_ORIGINS.join(' ') + directive.slice(directive.trimEnd().length);
  const nextMeta = meta.replace(policy, policy.replace(directive, updated));
  const backup = Buffer.from(directive, 'utf8').toString('base64');
  return html.replace(meta, nextMeta + `<!-- CODE-BOY-OVERLAY-CSP:${backup} -->`);
}

export function unpatchWorkbenchCsp(html: string): string {
  const marker = html.match(MARKER);
  if (!marker) return html;
  const original = Buffer.from(marker[1], 'base64').toString('utf8');
  const meta = html.match(META)?.[0];
  const policy = meta?.match(CONTENT)?.[1];
  if (!meta || !policy || !CONNECT.test(policy)) throw new Error('Could not restore the workbench security policy.');
  return html.replace(meta, meta.replace(policy, policy.replace(CONNECT, original))).replace(marker[0], '');
}

export function hasOverlayCsp(html: string): boolean {
  const policy = html.match(META)?.[0].match(CONTENT)?.[1];
  const sources = policy?.match(CONNECT)?.[0].split(/\s+/) ?? [];
  return OVERLAY_ORIGINS.every(origin => sources.includes(origin));
}
