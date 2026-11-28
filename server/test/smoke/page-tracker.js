export function attachPageDiagnostics(page) {
  const pageErrors = [];
  const consoleErrors = [];
  const assetNotFound = [];

  page.on('pageerror', (err) => {
    pageErrors.push(err instanceof Error ? err : new Error(String(err)));
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (text.includes('favicon.ico')) return;
    if (/Failed to load resource:.*\b404\b/i.test(text)) return;
    consoleErrors.push(text);
  });
  page.on('response', (response) => {
    const url = response.url();
    if (response.status() !== 404) return;
    if (url.includes('favicon.ico')) return;
    if (/\.(css|js|mjs)(\?|$)/i.test(url)) {
      assetNotFound.push(url);
    }
  });

  return {
    assertClean() {
      if (pageErrors.length) {
        throw new Error(`Page JS errors: ${pageErrors.map((e) => e.message).join(' | ')}`);
      }
      if (assetNotFound.length) {
        throw new Error(`Missing assets (404): ${assetNotFound.join(', ')}`);
      }
      if (consoleErrors.length) {
        throw new Error(`Console errors: ${consoleErrors.join(' | ')}`);
      }
    },
    pageErrors,
    consoleErrors,
    assetNotFound,
  };
}