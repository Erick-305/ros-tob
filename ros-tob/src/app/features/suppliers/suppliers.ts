import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DashboardService } from '../../services/dashboard.service';
import { parseDecimal, roundMoney } from '../../services/decimal.util';
import { InventoryService } from '../../services/inventory.service';
import type { Book } from '../../services/models';
import { NotificationService } from '../../services/notification.service';
import { SuppliersService } from '../../services/suppliers.service';
import type { Supplier, SupplierPurchase } from '../../services/suppliers.service';

@Component({
  imports: [FormsModule, CurrencyPipe, DatePipe],
  selector: 'app-suppliers',
  templateUrl: './suppliers.html',
})
export class Suppliers {
  private readonly service = inject(SuppliersService);
  private readonly notifications = inject(NotificationService);
  private readonly inventory = inject(InventoryService);
  private readonly dashboard = inject(DashboardService);

  protected readonly suppliers = this.service.suppliers;
  protected readonly purchases = this.service.purchases;
  protected readonly purchaseItems = signal<{ bookId: number; title: string; barcode: string; quantity: number; unitCost: number }[]>([]);
  protected readonly bookResults = signal<Book[]>([]);
  protected readonly form = { name: '', contactName: '', phone: '', email: '', address: '', notes: '' };
  protected readonly purchaseForm = { supplierId: 0, invoiceNumber: '', notes: '' };
  protected bookQuery = '';
  protected readonly entries = () => this.suppliers().flatMap((supplier) => supplier.entries.map((entry) => ({ ...entry, supplierName: supplier.name })));
  protected readonly parseDecimal = parseDecimal;

  protected refresh() { this.service.load(); }

  protected searchPurchaseBook() {
    const query = this.bookQuery.trim();
    if (!query) return;
    this.inventory.lookupBookByBarcode(query).subscribe({
      next: (book) => this.addPurchaseBook(book),
      error: () => this.inventory.searchBooksByQuery(query).subscribe({
        next: (result) => {
          this.bookResults.set(result.items);
          if (!result.items.length) this.notifications.setError('No se encontraron libros con ese código o nombre.');
        },
        error: (err) => this.notifications.setError(err.error?.message ?? 'No se pudieron buscar libros.'),
      }),
    });
  }

  protected addPurchaseBook(book: Book) {
    this.purchaseItems.update((items) => {
      const existing = items.find((item) => item.bookId === book.id);
      if (existing) return items.map((item) => item.bookId === book.id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...items, { bookId: book.id, title: book.title, barcode: book.barcode, quantity: 1, unitCost: book.cost }];
    });
    this.bookQuery = '';
    this.bookResults.set([]);
    this.notifications.clear();
  }

  protected changePurchaseQuantity(index: number, value: number) {
    const quantity = Number(value);
    this.purchaseItems.update((items) => items.map((item, itemIndex) => itemIndex === index
      ? { ...item, quantity: Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : 1 }
      : item));
  }

  protected changePurchaseCost(index: number, value: string) {
    const unitCost = roundMoney(parseDecimal(value));
    this.purchaseItems.update((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, unitCost } : item));
  }

  protected removePurchaseBook(index: number) { this.purchaseItems.update((items) => items.filter((_, itemIndex) => itemIndex !== index)); }
  protected purchaseLineTotal(item: { quantity: number; unitCost: number }) { return roundMoney(item.quantity * item.unitCost); }
  protected purchaseTotal() { return roundMoney(this.purchaseItems().reduce((sum, item) => sum + this.purchaseLineTotal(item), 0)); }

  protected savePurchase() {
    const items = this.purchaseItems().map(({ bookId, quantity, unitCost }) => ({ bookId, quantity: Number(quantity), unitCost: Number(unitCost) }));
    if (!this.purchaseForm.supplierId || !items.length || items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1 || !Number.isFinite(item.unitCost) || item.unitCost < 0)) {
      this.notifications.setError('Selecciona el proveedor, agrega al menos un libro y revisa cantidades y costos.');
      return;
    }
    this.notifications.clear();
    this.service.createPurchase({
      supplierId: Number(this.purchaseForm.supplierId),
      invoiceNumber: this.purchaseForm.invoiceNumber.trim() || undefined,
      notes: this.purchaseForm.notes.trim() || undefined,
      items,
    }).subscribe({
      next: (purchase) => {
        this.notifications.setNotice(`Entrada #${purchase.number} registrada por $${purchase.subtotal.toFixed(2)}; existencias actualizadas.`);
        Object.assign(this.purchaseForm, { supplierId: 0, invoiceNumber: '', notes: '' });
        this.purchaseItems.set([]);
        this.service.load();
        this.dashboard.load();
      },
      error: (err) => this.notifications.setError(err.error?.message ?? 'No se pudo registrar la entrada de compra.'),
    });
  }

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
  protected printPurchase(purchase: SupplierPurchase) { this.service.printPurchase(purchase); }
}
