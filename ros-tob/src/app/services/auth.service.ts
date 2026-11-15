import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import type { SessionUser } from './models';
import { NotificationService } from './notification.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(NotificationService);
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  readonly authenticated = signal(false);
  readonly currentUser = signal<SessionUser | null>(this.readStoredUser());
  readonly isAdmin = signal(false);

  constructor() {
    const token = localStorage.getItem('ros-tob-token');
    const expiresAt = token ? this.readTokenExpiry(token) : null;
    if (token && expiresAt !== null && expiresAt <= Date.now()) {
      this.clearStoredSession();
      return;
    }
    const tokenRole = token ? this.readTokenPayload(token)?.role ?? '' : '';
    this.authenticated.set(Boolean(token));
    this.isAdmin.set((localStorage.getItem('ros-tob-role') ?? tokenRole) === 'ADMIN');
    if (token && expiresAt !== null) this.scheduleLogout(expiresAt);
  }

  private readTokenPayload(token: string): { role?: string; exp?: number; iat?: number } | null {
    try {
      const payload = (token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
      const paddedPayload = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
      return JSON.parse(atob(paddedPayload)) as { role?: string; exp?: number; iat?: number };
    } catch { return null; }
  }
  private readTokenExpiry(token: string) {
    const payload = this.readTokenPayload(token);
    if (payload?.exp) return payload.exp * 1000;
    if (payload?.iat) return (payload.iat + 8 * 60 * 60) * 1000;
    return null;
  }
  private readStoredUser(): SessionUser | null { try { return JSON.parse(localStorage.getItem('ros-tob-user') ?? 'null') as SessionUser | null; } catch { return null; } }

  private scheduleLogout(expiresAt: number) {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = setTimeout(() => this.logout(), Math.max(0, expiresAt - Date.now()));
  }

  private clearStoredSession() {
    localStorage.removeItem('ros-tob-token');
    localStorage.removeItem('ros-tob-role');
    localStorage.removeItem('ros-tob-user');
    this.currentUser.set(null);
    this.authenticated.set(false);
    this.isAdmin.set(false);
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
    const expiresAt = this.readTokenExpiry(result.token);
    if (expiresAt !== null) this.scheduleLogout(expiresAt);
  }

  logout() {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
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
