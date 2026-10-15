import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import type { Customer } from './models';
import { NotificationService } from './notification.service';

@Injectable({ providedIn: 'root' })
export class CustomersService {
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(NotificationService);
  readonly customers = signal<Customer[]>([]);

  load() {
    this.http.get<Customer[]>('/api/customers').subscribe({
      next: (data) => this.customers.set(data),
      error: (err) => this.notifications.setError(err.error?.message ?? 'No se pudieron cargar los clientes.'),
    });
  }

  update(id: number, data: Partial<Customer>) {
    return this.http.patch<Customer>(`/api/customers/${id}`, data);
  }

  applyUpdate(updated: Customer) {
    this.customers.update((items) => items.map((item) => item.id === updated.id ? updated : item));
  }

  delete(customer: Customer) {
    this.http.delete(`/api/customers/${customer.id}`).subscribe({
      next: () => { this.notifications.setNotice(`${customer.name} eliminado.`); this.load(); },
      error: (err) => this.notifications.setError(err.error?.message ?? 'No se pudo eliminar el cliente.'),
    });
  }
}
