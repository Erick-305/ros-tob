import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { DashboardService } from './dashboard.service';
import { NotificationService } from './notification.service';

export interface ReturnableSaleItem {
  id: number;
  saleId: number;
  description: string;
  barcode: string;
  quantity: number;
  returnedQuantity: number;
  unitPrice: number;
}

export interface ReturnableSale {
  id: number;
  number: number;
  createdAt: string;
  items: ReturnableSaleItem[];
}

export interface ReturnRecord {
  id: number;
  createdAt: string;
  reason: string;
  refundAmount: number;
  saleNumber: number | null;
  itemCount: number;
  descriptions: string[];
}

@Injectable({ providedIn: 'root' })
export class ReturnsService {
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(NotificationService);
  private readonly dashboard = inject(DashboardService);

  readonly sales = signal<ReturnableSale[]>([]);
  readonly returns = signal<ReturnRecord[]>([]);

  load() {
    this.http.get<ReturnableSale[]>('/api/returns/sales').subscribe({
      next: (sales) => this.sales.set(sales),
      error: (err) => this.notifications.setError(err.error?.message ?? 'No se pudieron cargar las ventas para devolución.'),
    });
    this.loadReturns();
  }

  loadReturns() {
    this.http.get<ReturnRecord[]>('/api/returns').subscribe({
      next: (returns) => this.returns.set(returns),
      error: (err) => this.notifications.setError(err.error?.message ?? 'No se pudo cargar el historial de devoluciones.'),
    });
  }

  create(payload: { saleId: number; reason: string; items: { saleItemId: number; quantity: number }[] }) {
    return this.http.post<ReturnRecord>('/api/returns', payload);
  }

  refreshAfterCreate() {
    this.load();
    this.dashboard.load();
  }
}
