import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import type { SessionUser } from './models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  readonly authenticated = signal(false);
  readonly currentUser = signal<SessionUser | null>(this.readStoredUser());
  readonly isAdmin = signal(false);

  constructor() {
    const token = localStorage.getItem('ros-tob-token');
    const tokenRole = token ? this.readTokenRole(token) : '';
    this.authenticated.set(Boolean(token));
    this.isAdmin.set((localStorage.getItem('ros-tob-role') ?? tokenRole) === 'ADMIN');
  }

  private readTokenRole(token: string) { try { return JSON.parse(atob(token.split('.')[1] ?? '')).role ?? ''; } catch { return ''; } }
  private readStoredUser(): SessionUser | null { try { return JSON.parse(localStorage.getItem('ros-tob-user') ?? 'null') as SessionUser | null; } catch { return null; } }

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
  }

  logout() {
    localStorage.removeItem('ros-tob-token');
    localStorage.removeItem('ros-tob-role');
    localStorage.removeItem('ros-tob-user');
    this.currentUser.set(null);
    this.authenticated.set(false);
    this.isAdmin.set(false);
  }

  requestPasswordRecovery(identifier: string) {
    return this.http.post<{ message: string }>('/api/auth/forgot-password', { identifier });
  }

  resetPassword(payload: { identifier: string; code: string; password: string }) {
    return this.http.post<{ message: string }>('/api/auth/reset-password', payload);
  }
}
