import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UpdateService {
  readonly updateAvailable = signal(false);
  private currentBundle = this.bundleFromDocument();

  constructor() {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.check(); });
    setInterval(() => this.check(), 5 * 60 * 1000);
  }

  reload() { window.location.reload(); }

  private bundleFromDocument() { return document.querySelector('script[src^="main-"]')?.getAttribute('src') ?? null; }

  private async check() {
    if (this.updateAvailable()) return;
    try {
      const response = await fetch(`/index.html?_=${Date.now()}`, { cache: 'no-store' });
      const html = await response.text();
      const latestBundle = html.match(/main-[\w-]+\.js/)?.[0] ?? null;
      if (this.currentBundle && latestBundle && latestBundle !== this.currentBundle) this.updateAvailable.set(true);
    } catch { /* sin conexión o error de red: se reintenta en el siguiente ciclo */ }
  }
}
