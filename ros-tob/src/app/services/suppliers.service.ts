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

export interface SupplierPurchase {
  id: number;
  number: number;
  supplierId: number;
  supplierName: string;
  invoiceNumber: string | null;
  notes: string | null;
  createdAt: string;
  subtotal: number;
  items: { id: number; description: string; quantity: number; unitCost: number; total: number }[];
}

@Injectable({ providedIn: 'root' })
export class SuppliersService {
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(NotificationService);

  readonly suppliers = signal<Supplier[]>([]);
  readonly purchases = signal<SupplierPurchase[]>([]);

  load() {
    this.http.get<Supplier[]>('/api/suppliers').subscribe({
      next: (suppliers) => this.suppliers.set(suppliers),
      error: (err) => this.notifications.setError(err.error?.message ?? 'No se pudieron cargar los proveedores.'),
    });
    this.loadPurchases();
  }

  loadPurchases() {
    this.http.get<SupplierPurchase[]>('/api/suppliers/purchases').subscribe({
      next: (purchases) => this.purchases.set(purchases),
      error: (err) => this.notifications.setError(err.error?.message ?? 'No se pudieron cargar las entradas de compra.'),
    });
  }

  create(payload: { name: string; contactName?: string; phone?: string; email?: string; address?: string; notes?: string }) {
    return this.http.post<Supplier>('/api/suppliers', payload);
  }

  createPurchase(payload: { supplierId: number; invoiceNumber?: string; notes?: string; items: { bookId: number; quantity: number; unitCost: number }[] }) {
    return this.http.post<SupplierPurchase>('/api/suppliers/purchases', payload);
  }

  printPurchase(purchase: SupplierPurchase) {
    const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character);
    const items = purchase.items.map((item) => `<tr><td>${item.quantity}</td><td>${escapeHtml(item.description)}</td><td>$${item.unitCost.toFixed(2)}</td><td>$${item.total.toFixed(2)}</td></tr>`).join('');
    const report = `<html><head><title>Entrada de compra #${purchase.number} - ROS-TOB</title><style>body{font-family:Arial,sans-serif;color:#163d62;padding:24px}.note{max-width:780px;margin:auto;border:2px solid #4f83af;border-radius:12px;overflow:hidden}.head{display:grid;grid-template-columns:70px 1fr auto;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #4f83af}.head img{width:60px;height:55px;object-fit:contain}.head h1{margin:0;text-align:center;font-size:17px}.head strong{padding:8px;border:1px solid #4f83af;border-radius:5px}p{margin:8px 16px}.items{width:100%;border-collapse:collapse}.items th,.items td{padding:9px;border-bottom:1px solid #c2d3df;text-align:left}.items th:last-child,.items td:last-child{text-align:right}.total{text-align:right;padding:16px;font-size:18px;font-weight:bold}</style></head><body><div class="note"><header class="head"><img src="${window.location.origin}/images/ros-tob-logo.png" alt="ROS-TOB"><h1>NOTA DE ENTRADA DE COMPRA</h1><strong>N.º ${purchase.number}</strong></header><p><b>Proveedor:</b> ${escapeHtml(purchase.supplierName)}</p><p><b>Factura:</b> ${escapeHtml(purchase.invoiceNumber || '—')} &nbsp; <b>Fecha:</b> ${new Date(purchase.createdAt).toLocaleString('es-EC')}</p><table class="items"><thead><tr><th>Cantidad</th><th>Producto</th><th>Precio unitario</th><th>Total</th></tr></thead><tbody>${items}</tbody></table><div class="total">TOTAL: $${purchase.subtotal.toFixed(2)}</div>${purchase.notes ? `<p><b>Observaciones:</b> ${escapeHtml(purchase.notes)}</p>` : ''}</div></body></html>`;
    const printWindow = window.open('', '_blank', 'width=900,height=900');
    if (!printWindow) { this.notifications.setError('El navegador bloqueó la ventana de impresión.'); return; }
    printWindow.onload = () => printWindow.print();
    printWindow.document.write(report);
    printWindow.document.close();
  }

  delete(supplier: Supplier) {
    if (!window.confirm(`¿Eliminar al proveedor "${supplier.name}"?`)) return;
    this.http.delete(`/api/suppliers/${supplier.id}`).subscribe({
      next: () => { this.notifications.setNotice(`Proveedor "${supplier.name}" eliminado.`); this.load(); },
      error: (err) => this.notifications.setError(err.error?.message ?? 'No se pudo eliminar el proveedor.'),
    });
  }
}
