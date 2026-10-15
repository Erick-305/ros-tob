import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import type { Dashboard } from './models';
import { NotificationService } from './notification.service';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  readonly dashboard = signal<Dashboard | null>(null);

  load() {
    this.http.get<Dashboard>('/api/dashboard').subscribe({
      next: (data) => this.dashboard.set(data),
      error: (err) => { if (err.status === 401) this.auth.logout(); else this.notifications.setError('No se pudo conectar con la API. Inicia el backend en el puerto 3000.'); },
    });
  }
}
