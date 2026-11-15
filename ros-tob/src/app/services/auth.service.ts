import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import type { SessionUser } from './models';
import { NotificationService } from './notification.service';

const idleTimeoutMs = 10 * 60 * 1000;
const lastActivityKey = 'ros-tob-last-activity';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(NotificationService);
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActivityAt = 0;
  private lastActivityPersistedAt = 0;
  private lastIdleTimerResetAt = 0;
  private readonly activityHandler = () => this.recordActivity();
  private readonly visibilityHandler = () => this.handleVisibilityChange();
  private readonly storageHandler = (event: StorageEvent) => this.handleStorageChange(event);
  readonly authenticated = signal(false);
  readonly currentUser = signal<SessionUser | null>(this.readStoredUser());
  readonly isAdmin = signal(false);

  constructor() {
    const token = localStorage.getItem('ros-tob-token');
    if (!token) return;
    const storedActivity = Number(localStorage.getItem(lastActivityKey));
    const lastActivityAt = Number.isFinite(storedActivity) && storedActivity > 0 ? storedActivity : Date.now();
    if (Date.now() - lastActivityAt >= idleTimeoutMs) {
      this.logout();
      return;
    }
    if (!Number.isFinite(storedActivity) || storedActivity <= 0) localStorage.setItem(lastActivityKey, String(lastActivityAt));
    this.lastActivityAt = lastActivityAt;
    this.lastActivityPersistedAt = lastActivityAt;
    const tokenRole = this.readTokenRole(token);
    this.authenticated.set(true);
    this.isAdmin.set((localStorage.getItem('ros-tob-role') ?? tokenRole) === 'ADMIN');
    this.scheduleIdleLogout();
    this.listenForActivity();
  }

  private readTokenRole(token: string) {
    try {
      const payload = (token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
      const paddedPayload = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
      return (JSON.parse(atob(paddedPayload)) as { role?: string }).role ?? '';
    } catch { return ''; }
  }
  private readStoredUser(): SessionUser | null { try { return JSON.parse(localStorage.getItem('ros-tob-user') ?? 'null') as SessionUser | null; } catch { return null; } }

  private listenForActivity() {
    for (const eventName of ['pointerdown', 'keydown', 'mousemove', 'touchstart', 'scroll', 'wheel']) {
      window.addEventListener(eventName, this.activityHandler, { passive: true });
    }
    document.addEventListener('visibilitychange', this.visibilityHandler);
    window.addEventListener('storage', this.storageHandler);
  }

  private stopListeningForActivity() {
    for (const eventName of ['pointerdown', 'keydown', 'mousemove', 'touchstart', 'scroll', 'wheel']) {
      window.removeEventListener(eventName, this.activityHandler);
    }
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    window.removeEventListener('storage', this.storageHandler);
  }

  private recordActivity() {
    if (!this.authenticated()) return;
    const now = Date.now();
    this.lastActivityAt = now;
    if (now - this.lastIdleTimerResetAt >= 1000) this.scheduleIdleLogout();
    if (now - this.lastActivityPersistedAt >= 15_000) {
      localStorage.setItem(lastActivityKey, String(now));
      this.lastActivityPersistedAt = now;
    }
  }

  private handleVisibilityChange() {
    if (document.visibilityState !== 'visible' || !this.authenticated()) return;
    if (Date.now() - this.lastActivityAt >= idleTimeoutMs) this.logout();
    else this.recordActivity();
  }

  private scheduleIdleLogout() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.lastIdleTimerResetAt = Date.now();
    const remaining = this.lastActivityAt + idleTimeoutMs - Date.now();
    this.idleTimer = setTimeout(() => {
      if (Date.now() - this.lastActivityAt >= idleTimeoutMs) this.logout();
      else this.scheduleIdleLogout();
    }, Math.max(0, remaining));
  }

  private handleStorageChange(event: StorageEvent) {
    if (event.key === 'ros-tob-token' && !event.newValue && this.authenticated()) {
      this.logout();
      return;
    }
    if (event.key !== lastActivityKey || !event.newValue || !this.authenticated()) return;
    const activityAt = Number(event.newValue);
    if (!Number.isFinite(activityAt) || activityAt <= this.lastActivityAt) return;
    this.lastActivityAt = activityAt;
    this.lastActivityPersistedAt = activityAt;
    this.scheduleIdleLogout();
  }

  private clearStoredSession() {
    localStorage.removeItem('ros-tob-token');
    localStorage.removeItem('ros-tob-role');
    localStorage.removeItem('ros-tob-user');
    this.currentUser.set(null);
    this.authenticated.set(false);
    this.isAdmin.set(false);
    localStorage.removeItem(lastActivityKey);
  }

  login(form: { identifier: string; password: string }) {
    return this.http.post<{ token: string; user: SessionUser }>('/api/auth/login', form);
  }

  applySession(result: { token: string; user: SessionUser }) {
    localStorage.setItem('ros-tob-token', result.token);
    localStorage.setItem('ros-tob-role', result.user.role);
    localStorage.setItem('ros-tob-user', JSON.stringify(result.user));
    this.currentUser.set(result.user);
    this.isAdmin.set(result.user.role === 'ADMIN');
    this.authenticated.set(true);
    this.lastActivityAt = Date.now();
    this.lastActivityPersistedAt = this.lastActivityAt;
    localStorage.setItem(lastActivityKey, String(this.lastActivityAt));
    this.scheduleIdleLogout();
    this.listenForActivity();
  }

  logout() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.stopListeningForActivity();
    this.clearStoredSession();
    this.notifications.clear();
  }

  requestPasswordRecovery(identifier: string) {
    return this.http.post<{ message: string }>('/api/auth/forgot-password', { identifier });
  }

  resetPassword(payload: { identifier: string; code: string; password: string }) {
    return this.http.post<{ message: string }>('/api/auth/reset-password', payload);
  }
}
