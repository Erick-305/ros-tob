import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { NotificationService } from './notification.service';
import type { ManagedUser } from './models';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(NotificationService);
  readonly users = signal<ManagedUser[]>([]);

  load() {
    this.http.get<ManagedUser[]>('/api/users').subscribe({
      next: (data) => this.users.set(data),
      error: (err) => this.notifications.setError(err.error?.message ?? 'No se pudieron cargar los usuarios.'),
    });
  }

  toggle(user: ManagedUser) {
    this.http.patch<ManagedUser>(`/api/users/${user.id}/status`, { active: !user.active }).subscribe({
      next: (updated) => { this.users.update((items) => items.map((item) => item.id === updated.id ? updated : item)); this.notifications.setNotice(`${updated.name} ${updated.active ? 'activado' : 'desactivado'}.`); },
      error: (err) => this.notifications.setError(err.error?.message ?? 'No se pudo actualizar la cuenta.'),
    });
  }
}
