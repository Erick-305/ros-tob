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

  loadSales(page = 1) {
    this.http.get<{ items: any[]; page: number; hasNextPage: boolean }>('/api/sales', { params: { page } }).subscribe({
      next: (data) => { this.sales.set(data.items); this.salesPage.set(data.page); this.salesHasNextPage.set(data.hasNextPage); },
      error: () => this.notifications.setError('No se pudo cargar el historial.'),
    });
  }
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
    this.http.get<any>(`/api/sales/${sale.id}`).subscribe({
      next: (detail) => {
        const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character);
        const customer = detail.customer ?? {};
        const date = new Date(detail.createdAt).toLocaleDateString('es-EC');
        const items = detail.items.map((item: any) => `<tr><td>${item.quantity}</td><td>${escapeHtml(item.description)}</td><td>$${Number(item.unitPrice).toFixed(2)}</td><td>$${Number(item.total).toFixed(2)}</td></tr>`).join('');
        const receipt = `<html><head><title>Nota de venta #${detail.number} - ROS-TOB</title><style>
          @page{size:letter;margin:10mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#163d62;font-size:12px}.note{max-width:780px;margin:auto;border:2px solid #4f83af;border-radius:12px;overflow:hidden}.title{padding:10px 16px;text-align:right;border-bottom:1px solid #4f83af}.title h1{display:inline-block;margin:0;padding:4px 12px;border:1px solid #4f83af;border-radius:5px;font-size:20px;letter-spacing:.04em}.meta{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #4f83af}.field{min-height:27px;padding:6px 9px;border-bottom:1px solid #9bb9d0}.field:nth-child(odd){border-right:1px solid #4f83af}.field b{font-size:9px;text-transform:uppercase}.field span{color:#222;margin-left:8px}.items{width:100%;border-collapse:collapse}.items th{height:34px;text-transform:uppercase;font-size:10px;border-bottom:1px solid #4f83af}.items th,.items td{padding:7px 9px;border-right:1px solid #9bb9d0}.items th:last-child,.items td:last-child{border-right:0}.items th:nth-child(1),.items td:nth-child(1){width:11%;text-align:center}.items th:nth-child(2),.items td:nth-child(2){width:54%}.items th:nth-child(3),.items td:nth-child(3),.items th:nth-child(4),.items td:nth-child(4){width:17.5%;text-align:right}.items tbody tr{height:28px}.items tbody td{border-bottom:1px solid #c2d3df;color:#222}.bottom{display:grid;grid-template-columns:1fr 185px;border-top:1px solid #4f83af}.conform{min-height:105px;padding:10px;border-right:1px solid #4f83af;display:flex;align-items:end;justify-content:center}.conform span{border-top:1px solid #4f83af;padding:5px 40px 0;text-transform:uppercase;font-size:10px}.totals{padding:10px}.total-row{display:flex;justify-content:space-between;padding:7px 0;color:#222}.total-row.final{border-top:2px solid #4f83af;font-size:18px;font-weight:bold;color:#163d62}.footer{padding:8px 10px;border-top:1px solid #4f83af;font-size:10px;font-weight:bold}.received{margin-top:8px;text-align:center;font-size:10px}</style></head><body><div class="note"><div class="title"><h1>NOTA DE VENTA</h1></div><div class="meta"><div class="field"><b>Vendido a:</b><span>${escapeHtml(customer.name || 'Consumidor final')}</span></div><div class="field" style="display:flex;justify-content:space-between;align-items:center"><span><b>R.U.C./C.I.:</b> ${escapeHtml(customer.taxId || '')}</span><span style="padding-left:12px;margin-left:12px;border-left:1px solid #4f83af"><b>N.º:</b> ${String(detail.number).padStart(6, '0')}</span></div><div class="field"><b>Dirección:</b><span>${escapeHtml(customer.address || '')}</span></div><div class="field"><b>Teléfono:</b><span>${escapeHtml(customer.phone || '')}</span></div><div class="field"><b>Fecha:</b><span>${date}</span></div></div><table class="items"><thead><tr><th>Cant.</th><th>Descripción</th><th>V. unitario</th><th>V. total</th></tr></thead><tbody>${items}</tbody></table><div class="bottom"><div class="conform">${detail.receivedConfirmed ? '<span>Recibí conforme</span>' : ''}</div><div class="totals"><div class="total-row"><span>Subtotal</span><span>$${Number(detail.subtotal).toFixed(2)}</span></div><div class="total-row"><span>Envío</span><span>$${Number(detail.shippingAmount).toFixed(2)}</span></div><div class="total-row final"><span>TOTAL</span><span>$${Number(detail.total).toFixed(2)}</span></div></div></div><div class="footer">NOTA: Salida la mercadería no se acepta reclamos</div></div></body></html>`;
        const printWindow = window.open('', '_blank', 'width=900,height=1000');
        if (!printWindow) { this.notifications.setError('El navegador bloqueó la ventana de impresión.'); return; }
        const sellerSpan = detail.sellerName ? `<span style="padding-left:12px;margin-left:12px;border-left:1px solid #4f83af"><b>Vendedor:</b> ${escapeHtml(detail.sellerName)}</span>` : '';
        const receiptWithSeller = receipt.replace(
          `<div class="field"><b>Vendido a:</b><span>${escapeHtml(customer.name || 'Consumidor final')}</span></div><div class="field" style="display:flex;justify-content:space-between;align-items:center"><span><b>R.U.C./C.I.:</b> ${escapeHtml(customer.taxId || '')}</span><span style="padding-left:12px;margin-left:12px;border-left:1px solid #4f83af"><b>N.º:</b> ${String(detail.number).padStart(6, '0')}</span></div>`,
          `<div class="field" style="display:flex;justify-content:space-between;align-items:center"><span><b>Vendido a:</b> ${escapeHtml(customer.name || 'Consumidor final')}</span>${sellerSpan}</div><div class="field" style="display:flex;justify-content:space-between;align-items:center"><span><b>R.U.C./C.I.:</b> ${escapeHtml(customer.taxId || '')}</span><span style="padding-left:12px;margin-left:12px;border-left:1px solid #4f83af"><b>N.º:</b> ${String(detail.number).padStart(6, '0')}</span></div>`,
        );
        const receiptWithCity = receiptWithSeller.replace(
          `<span>${escapeHtml(customer.address || '')}</span></div><div class="field"><b>Teléfono:</b>`,
          `<span>${escapeHtml(customer.address || '')}</span></div><div class="field"><b>Ciudad:</b><span>${escapeHtml(customer.city || '')}</span></div><div class="field"><b>Teléfono:</b>`,
        );
        const compactReceipt = receiptWithCity
          .replace('</style>', '@page{margin:0}.note{margin:0 auto}.note,.note .field,.note .field b,.note .field span,.note .items,.note .items th,.note .items td,.note .total-row{font-size:10px!important}.note .title h1{font-size:14px!important}.note .total-row.final{font-size:11px!important}.note .items{table-layout:auto}.note .items th,.note .items td{width:auto!important;white-space:nowrap}.note .items th:nth-child(2),.note .items td:nth-child(2){width:100%!important;white-space:normal}.note .bottom{height:45px!important;min-height:45px!important;grid-template-rows:45px!important;align-items:stretch!important;overflow:hidden!important}.note .conform{min-height:45px!important;height:45px!important;padding:2px!important;align-self:stretch!important;align-items:flex-end!important}.note .conform span{padding:1px 24px 0!important;font-size:8px!important}.note .totals{padding:2px!important}.note .total-row{padding:1px 0!important;line-height:11px!important}</style>');
        printWindow.document.write(compactReceipt.replace('<div class="title">', '<div class="title" style="position:relative"><span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#163d62;font:bold 16px Arial,sans-serif;white-space:nowrap">ROS-TOB</span>')); printWindow.document.close(); printWindow.document.title = `Nota de venta #${detail.number} - ROS-TOB`; printWindow.focus(); printWindow.print();
      },
      error: () => this.notifications.setError('No se pudo cargar el detalle de la venta.'),
    });
  }
}
