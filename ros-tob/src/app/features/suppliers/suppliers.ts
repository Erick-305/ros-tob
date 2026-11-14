import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SuppliersService } from '../../services/suppliers.service';
import type { Supplier } from '../../services/suppliers.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  imports: [FormsModule, CurrencyPipe, DatePipe],
  selector: 'app-suppliers',
  templateUrl: './suppliers.html',
})
export class Suppliers {
  private readonly service = inject(SuppliersService);
  private readonly notifications = inject(NotificationService);

  protected readonly suppliers = this.service.suppliers;
  protected readonly form = { name: '', contactName: '', phone: '', email: '', address: '', notes: '' };
  protected readonly entries = () => this.suppliers().flatMap((supplier) => supplier.entries.map((entry) => ({ ...entry, supplierName: supplier.name })));

  protected refresh() { this.service.load(); }

  protected save() {
    this.notifications.clear();
    this.service.create({
      name: this.form.name,
      contactName: this.form.contactName || undefined,
      phone: this.form.phone || undefined,
      email: this.form.email || undefined,
      address: this.form.address || undefined,
      notes: this.form.notes || undefined,
    }).subscribe({
      next: () => {
        Object.assign(this.form, { name: '', contactName: '', phone: '', email: '', address: '', notes: '' });
        this.notifications.setNotice('Proveedor registrado correctamente.');
        this.service.load();
      },
      error: (err) => this.notifications.setError(err.error?.message ?? 'No se pudo registrar el proveedor.'),
    });
  }

  protected delete(supplier: Supplier) { this.service.delete(supplier); }
}
