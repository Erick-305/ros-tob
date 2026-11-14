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
  customerName: string | null;
  customerTaxId: string | null;
  items: ReturnableSaleItem[];
}

export interface ReturnRecord {
  id: number;
  createdAt: string;
  reason: string;
  refundAmount: number;
  saleNumber: number | null;
  customerName: string | null;
  customerTaxId: string | null;
  itemCount: number;
  descriptions: string[];
}

@Injectable({ providedIn: 'root' })
export class ReturnsService {
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(NotificationService);
  private readonly dashboard = inject(DashboardService);

  readonly sales = signal<ReturnableSale[]>([]);
  readonly salesLoading = signal(false);
  readonly salesSearchError = signal('');
  readonly returns = signal<ReturnRecord[]>([]);
  private salesSearchRequest = 0;
  private salesSearchTimer: ReturnType<typeof setTimeout> | undefined;

  load() {
    this.searchSales();
    this.loadReturns();
  }

  searchSales(query = '') {
    const request = ++this.salesSearchRequest;
    if (this.salesSearchTimer) clearTimeout(this.salesSearchTimer);
    this.sales.set([]);
    this.salesLoading.set(true);
    this.salesSearchError.set('');
    const search = query.trim();
    const load = () => this.http.get<ReturnableSale[]>('/api/returns/sales', {
      params: search ? { q: search } : {},
    }).subscribe({
      next: (sales) => {
        if (request !== this.salesSearchRequest) return;
        this.sales.set(sales);
        this.salesLoading.set(false);
      },
      error: (err) => {
        if (request !== this.salesSearchRequest) return;
        const message = err.error?.message ?? 'No se pudieron cargar las ventas para devolución.';
        this.salesSearchError.set(message);
        this.salesLoading.set(false);
        this.notifications.setError(message);
      },
    });
    if (search) this.salesSearchTimer = setTimeout(load, 250);
    else load();
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
