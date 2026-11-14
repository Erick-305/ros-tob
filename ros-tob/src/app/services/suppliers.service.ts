import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { NotificationService } from './notification.service';

export interface SupplierEntry {
  id: number;
  createdAt: string;
  quantity: number;
  unitCost: number | null;
  bookTitle: string;
}

export interface Supplier {
  id: number;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  entries: SupplierEntry[];
}

@Injectable({ providedIn: 'root' })
export class SuppliersService {
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(NotificationService);

  readonly suppliers = signal<Supplier[]>([]);

  load() {
    this.http.get<Supplier[]>('/api/suppliers').subscribe({
      next: (suppliers) => this.suppliers.set(suppliers),
      error: (err) => this.notifications.setError(err.error?.message ?? 'No se pudieron cargar los proveedores.'),
    });
  }

  create(payload: { name: string; contactName?: string; phone?: string; email?: string; address?: string; notes?: string }) {
    return this.http.post<Supplier>('/api/suppliers', payload);
  }

  delete(supplier: Supplier) {
    if (!window.confirm(`¿Eliminar al proveedor "${supplier.name}"?`)) return;
    this.http.delete(`/api/suppliers/${supplier.id}`).subscribe({
      next: () => { this.notifications.setNotice(`Proveedor "${supplier.name}" eliminado.`); this.load(); },
      error: (err) => this.notifications.setError(err.error?.message ?? 'No se pudo eliminar el proveedor.'),
    });
  }
}
