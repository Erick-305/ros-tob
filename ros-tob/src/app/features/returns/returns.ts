import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../services/notification.service';
import { ReturnsService, type ReturnableSale } from '../../services/returns.service';

@Component({
  imports: [FormsModule, CurrencyPipe, DatePipe],
  selector: 'app-returns',
  templateUrl: './returns.html',
})
export class Returns {
  private readonly service = inject(ReturnsService);
  private readonly notifications = inject(NotificationService);

  protected readonly sales = this.service.sales;
  protected readonly returns = this.service.returns;
  protected readonly form: { saleId: number; reason: string; items: { saleItemId: number; quantity: number }[] } = {
    saleId: 0,
    reason: '',
    items: [{ saleItemId: 0, quantity: 1 }],
  };

  protected selectedSale(): ReturnableSale | undefined { return this.sales().find((sale) => sale.id === Number(this.form.saleId)); }

  protected availableQuantity(saleItemId: number, excludeIndex = -1) {
    const item = this.selectedSale()?.items.find((saleItem) => saleItem.id === Number(saleItemId));
    const alreadySelected = this.form.items.reduce((sum, line, index) => sum + (index !== excludeIndex && line.saleItemId === saleItemId ? Number(line.quantity || 0) : 0), 0);
    return item ? item.quantity - item.returnedQuantity - alreadySelected : 0;
  }

  protected addItem() { this.form.items.push({ saleItemId: 0, quantity: 1 }); }
  protected removeItem(index: number) { if (this.form.items.length > 1) this.form.items.splice(index, 1); }

  protected save() {
    const items = this.form.items.map((item) => ({ saleItemId: Number(item.saleItemId), quantity: Number(item.quantity) }));
    if (!this.form.saleId || !this.form.reason.trim() || items.some((item) => !item.saleItemId || !Number.isInteger(item.quantity) || item.quantity < 1)) {
      this.notifications.setError('Selecciona la venta, los libros y las cantidades; indica también el motivo.');
      return;
    }
    if (new Set(items.map((item) => item.saleItemId)).size !== items.length) {
      this.notifications.setError('Selecciona cada libro una sola vez; ajusta la cantidad en su misma fila.');
      return;
    }
    const sale = this.selectedSale();
    if (!sale || items.some((item, index) => item.quantity > this.availableQuantity(item.saleItemId, index))) {
      this.notifications.setError('La cantidad solicitada supera las unidades disponibles para devolución.');
      return;
    }
    this.notifications.clear();
    this.service.create({ saleId: Number(this.form.saleId), reason: this.form.reason.trim(), items }).subscribe({
      next: (result) => {
        this.notifications.setNotice(`Devolución registrada. Reembolso: ${Number(result.refundAmount).toFixed(2)}.`);
        this.form.saleId = 0;
        this.form.reason = '';
        this.form.items = [{ saleItemId: 0, quantity: 1 }];
        this.service.refreshAfterCreate();
      },
      error: (err) => this.notifications.setError(err.error?.message ?? 'No se pudo registrar la devolución.'),
    });
  }

  protected refresh() { this.service.load(); }
}
