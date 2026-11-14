import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { DashboardService } from './dashboard.service';
import { NotificationService } from './notification.service';

@Injectable({ providedIn: 'root' })
export class SalesService {
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(NotificationService);
  private readonly dashboardService = inject(DashboardService);

  readonly sales = signal<any[]>([]);
  readonly salesPage = signal(1);
  readonly salesHasNextPage = signal(false);
  search = '';

  loadSales(page = 1) {
    this.http.get<{ items: any[]; page: number; hasNextPage: boolean }>('/api/sales', { params: { page, ...(this.search ? { q: this.search } : {}) } }).subscribe({
      next: (data) => { this.sales.set(data.items); this.salesPage.set(data.page); this.salesHasNextPage.set(data.hasNextPage); },
      error: () => this.notifications.setError('No se pudo cargar el historial.'),
    });
  }
  searchSales(query: string) { this.search = query.trim(); this.loadSales(1); }
  previousSalesPage() { if (this.salesPage() > 1) this.loadSales(this.salesPage() - 1); }
  nextSalesPage() { if (this.salesHasNextPage()) this.loadSales(this.salesPage() + 1); }

  deleteSale(sale: any) {
    if (!window.confirm(`¿Eliminar la venta #${sale.number}? El stock será restaurado.`)) return;
    this.http.delete(`/api/sales/${sale.id}`).subscribe({
      next: () => { this.notifications.setNotice(`Venta #${sale.number} eliminada.`); this.loadSales(this.salesPage()); this.dashboardService.load(); },
      error: (err) => this.notifications.setError(err.error?.message ?? 'No se pudo eliminar la venta.'),
    });
  }

  createSale(payload: any) {
    return this.http.post<any>('/api/sales', payload);
  }

  printSale(sale: any) {
    const printWindow = window.open('', '_blank', 'width=900,height=1000');
    if (!printWindow) { this.notifications.setError('El navegador bloqueó la ventana de impresión.'); return; }
    printWindow.document.write('<!doctype html><html><head><title>Preparando nota de venta</title></head><body>Preparando la nota de venta...</body></html>');
    printWindow.document.close();
    this.http.get<any>(`/api/sales/${sale.id}`).subscribe({
      next: (detail) => {
        const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character);
        const customer = detail.customer ?? { name: detail.customerName, taxId: detail.customerTaxId };
        const date = new Date(detail.createdAt).toLocaleDateString('es-EC');
        const items = detail.items.map((item: any) => `<tr><td>${item.quantity}</td><td>${escapeHtml(item.description)}</td><td>$${Number(item.unitPrice).toFixed(2)}</td><td>$${Number(item.total).toFixed(2)}</td></tr>`).join('');
        const seller = detail.sellerName ? `<span class="seller"><b>Vendedor:</b> ${escapeHtml(detail.sellerName)}</span>` : '';
        const fields = [
          `<div class="field"><b>Vendido a:</b><span>${escapeHtml(customer.name || 'Consumidor final')}</span>${seller}</div>`,
          `<div class="field"><b>R.U.C./C.I.:</b><span>${escapeHtml(customer.taxId || '')}</span><strong>N.º: ${String(detail.number).padStart(6, '0')}</strong></div>`,
          `<div class="field"><b>Dirección:</b><span>${escapeHtml(customer.address || '')}</span></div>`,
          `<div class="field"><b>Ciudad:</b><span>${escapeHtml(customer.city || '')}</span></div>`,
          `<div class="field"><b>Teléfono:</b><span>${escapeHtml(customer.phone || '')}</span></div>`,
          `<div class="field"><b>Fecha:</b><span>${date}</span></div>`,
        ].join('');
        const receipt = `<html><head><title>Nota de venta #${detail.number} - ROS-TOB</title><style>
          @page{size:letter;margin:10mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#163d62;font-size:12px}.note{max-width:780px;margin:auto;border:2px solid #4f83af;border-radius:12px;overflow:hidden}.title{display:grid;grid-template-columns:70px 1fr auto;align-items:center;gap:12px;padding:8px 14px;border-bottom:1px solid #4f83af}.receipt-logo{display:block;width:60px;height:54px;object-fit:contain}.brand{text-align:center;font:bold 17px Arial,sans-serif;letter-spacing:.04em}.title h1{margin:0;padding:4px 12px;border:1px solid #4f83af;border-radius:5px;font-size:20px;letter-spacing:.04em;white-space:nowrap}.meta{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #4f83af}.field{min-height:27px;padding:6px 9px;border-bottom:1px solid #9bb9d0}.field:nth-child(odd){border-right:1px solid #4f83af}.field b{font-size:9px;text-transform:uppercase}.field span{color:#222;margin-left:8px}.field strong{float:right}.seller{display:block!important;margin:4px 0 0!important;font-size:10px}.items{width:100%;border-collapse:collapse}.items th{height:34px;text-transform:uppercase;font-size:10px;border-bottom:1px solid #4f83af}.items th,.items td{padding:7px 9px;border-right:1px solid #9bb9d0}.items th:last-child,.items td:last-child{border-right:0}.items th:nth-child(1),.items td:nth-child(1){width:11%;text-align:center}.items th:nth-child(2),.items td:nth-child(2){width:54%}.items th:nth-child(3),.items td:nth-child(3),.items th:nth-child(4),.items td:nth-child(4){width:17.5%;text-align:right}.items tbody tr{height:28px}.items tbody td{border-bottom:1px solid #c2d3df;color:#222}.bottom{display:grid;grid-template-columns:1fr 185px;border-top:1px solid #4f83af}.conform{min-height:105px;padding:10px;border-right:1px solid #4f83af;display:flex;align-items:end;justify-content:center}.conform span{border-top:1px solid #4f83af;padding:5px 40px 0;text-transform:uppercase;font-size:10px}.totals{padding:10px}.total-row{display:flex;justify-content:space-between;padding:7px 0;color:#222}.total-row.final{border-top:2px solid #4f83af;font-size:18px;font-weight:bold;color:#163d62}.footer{padding:8px 10px;border-top:1px solid #4f83af;font-size:10px;font-weight:bold}</style></head><body><div class="note"><div class="title"><img class="receipt-logo" src="${window.location.origin}/images/ros-tob-logo.png" alt="ROS-TOB"><span class="brand">ROS-TOB</span><h1>NOTA DE VENTA</h1></div><div class="meta">${fields}</div><table class="items"><thead><tr><th>Cant.</th><th>Descripción</th><th>V. unitario</th><th>V. total</th></tr></thead><tbody>${items}</tbody></table><div class="bottom"><div class="conform">${detail.receivedConfirmed ? '<span>Recibí conforme</span>' : ''}</div><div class="totals"><div class="total-row"><span>Subtotal</span><span>$${Number(detail.subtotal).toFixed(2)}</span></div><div class="total-row"><span>Envío</span><span>$${Number(detail.shippingAmount).toFixed(2)}</span></div><div class="total-row final"><span>TOTAL</span><span>$${Number(detail.total).toFixed(2)}</span></div></div></div><div class="footer"><b style="color:#222;font-weight:800">NOTA: Salida la mercadería no se aceptan reclamos ni devoluciones</b></div></div></body></html>`;
        const compactReceipt = receipt.replace('</style>', '@page{margin:0}.note{margin:0 auto}.note,.note .field,.note .field b,.note .field span,.note .items,.note .items th,.note .items td,.note .total-row{font-size:10px!important}.note .title h1{font-size:14px!important}.note .brand{font-size:13px!important}.note .receipt-logo{width:42px;height:38px}.note .total-row.final{font-size:11px!important}.note .items{table-layout:auto}.note .items th,.note .items td{width:auto!important;white-space:nowrap}.note .items th:nth-child(2),.note .items td:nth-child(2){width:100%!important;white-space:normal}.note .bottom{height:45px!important;min-height:45px!important;grid-template-rows:45px!important;align-items:stretch!important;overflow:hidden!important}.note .conform{min-height:45px!important;height:45px!important;padding:2px!important;align-self:stretch!important;align-items:flex-end!important}.note .conform span{padding:1px 24px 0!important;font-size:8px!important}.note .totals{padding:2px!important}.note .total-row{padding:1px 0!important;line-height:11px!important}</style>');
        let printStarted = false;
        const startPrint = () => {
          if (printStarted || printWindow.closed) return;
          printStarted = true;
          printWindow.focus();
          printWindow.print();
        };
        printWindow.addEventListener('load', () => printWindow.setTimeout(startPrint, 100), { once: true });
        printWindow.document.open();
        printWindow.document.write(compactReceipt);
        printWindow.document.close();
        printWindow.document.title = `Nota de venta #${detail.number} - ROS-TOB`;
        printWindow.setTimeout(() => {
          if (printWindow.document.readyState === 'complete') startPrint();
        }, 1000);
      },
      error: () => {
        printWindow.close();
        this.notifications.setError('No se pudo cargar el detalle de la venta.');
      },
    });
  }
}
