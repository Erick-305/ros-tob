import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CustomersService } from '../../services/customers.service';
import { DashboardService } from '../../services/dashboard.service';
import { InventoryService } from '../../services/inventory.service';
import type { Book, Customer, SaleLine } from '../../services/models';
import { NotificationService } from '../../services/notification.service';
import { SalesService } from '../../services/sales.service';

@Component({
  imports: [FormsModule, CurrencyPipe],
  selector: 'app-sale',
  templateUrl: './sale.html',
})
export class Sale {
  private readonly inventory = inject(InventoryService);
  private readonly customersService = inject(CustomersService);
  private readonly salesService = inject(SalesService);
  private readonly dashboardService = inject(DashboardService);
  private readonly notifications = inject(NotificationService);

  protected readonly customers = this.customersService.customers;
  protected customerSearch = '';
  protected readonly selectedCustomerId = signal<number | null>(null);
  protected readonly saleLines = signal<SaleLine[]>([]);
  protected readonly saleBookResults = signal<Book[]>([]);
  protected readonly submittingSale = signal(false);
  protected readonly completedSale = signal<any | null>(null);
  protected readonly showSaleCustomer = signal(false);
  protected barcode = '';
  protected customer = { taxId: '', name: '', phone: '', email: '', address: '', city: '', vendedor: '' };
  protected shippingActive = false;
  protected shippingAmount = 0;
  protected shippingAddress = '';
  protected shippingReference = '';
  protected shippingNote = '';
  protected receivedConfirmed = false;

  protected filteredCustomers() { const query = this.customerSearch.trim().toLowerCase(); return this.customers().filter((customer) => !query || [customer.name, customer.taxId, customer.email, customer.phone, customer.city].some((value) => String(value ?? '').toLowerCase().includes(query))); }
  protected selectCustomer(customer: Customer) { this.selectedCustomerId.set(customer.id); this.customer = { taxId: customer.taxId ?? '', name: customer.name, phone: customer.phone ?? '', email: customer.email ?? '', address: customer.address ?? '', city: customer.city ?? '', vendedor: this.customer.vendedor }; this.showSaleCustomer.set(true); }
  protected updateCustomer() { const id = this.selectedCustomerId(); if (!id || !this.customer.name.trim()) { this.notifications.setError('Selecciona un cliente y completa su nombre.'); return; } this.customersService.update(id, this.customer).subscribe({ next: (updated) => { this.customersService.applyUpdate(updated); this.notifications.setNotice('Datos del cliente actualizados.'); }, error: (err) => this.notifications.setError(err.error?.message ?? 'No se pudieron actualizar los datos del cliente.') }); }
  protected deleteCustomer(customer: Customer, event: Event) { event.stopPropagation(); if (!window.confirm(`¿Eliminar a "${customer.name}" de los clientes guardados?`)) return; this.customersService.delete(customer); }

  protected scanSale() {
    const query = this.barcode.replace(/[\r\n]/g, '').trim();
    this.barcode = query;
    this.notifications.clear();
    this.saleBookResults.set([]);
    if (!query) return;
    this.inventory.lookupBookByBarcode(query).subscribe({
      next: (book) => this.selectSaleBook(book),
      error: () => this.searchSaleBooks(query),
    });
  }
  private searchSaleBooks(query: string) {
    this.inventory.searchBooksByQuery(query).subscribe({
      next: (data) => { this.saleBookResults.set(data.items); if (!data.items.length) this.notifications.setError('No se encontraron libros con ese código o nombre.'); },
      error: () => this.notifications.setError('No se pudo buscar el libro.'),
    });
  }
  protected selectSaleBook(book: Book) { this.addBookToSale(book); this.barcode = ''; this.saleBookResults.set([]); }
  private addBookToSale(book: Book) { const lines = [...this.saleLines()]; const existing = lines.find((line) => line.bookId === book.id); if (existing) existing.quantity += 1; else lines.push({ bookId: book.id, barcode: book.barcode, title: book.title, quantity: 1, unitPrice: book.salePrice }); this.saleLines.set(lines); this.notifications.setNotice(`${book.title} agregado a la venta.`); }
  protected changeQuantity(line: SaleLine, quantity: number) { const lines = this.saleLines().map((item) => item === line ? { ...item, quantity: Math.max(1, Number.isFinite(quantity) ? Math.floor(quantity) : 1) } : item); this.saleLines.set(lines); }
  protected removeLine(line: SaleLine) { this.saleLines.set(this.saleLines().filter((item) => item !== line)); }
  protected subtotal() { return this.saleLines().reduce((sum, line) => sum + line.quantity * line.unitPrice, 0); }
  protected total() { return this.subtotal() + (this.shippingActive ? Number(this.shippingAmount) || 0 : 0); }

  protected finalizeSale() {
    if (this.submittingSale()) return;
    if (!this.saleLines().length) { this.notifications.setError('Agrega al menos un libro a la venta.'); return; }
    this.submittingSale.set(true);
    const payload = { items: this.saleLines().map((line) => ({ bookId: line.bookId, quantity: line.quantity, unitPrice: line.unitPrice })), customer: this.customer.name ? this.customer : undefined, sellerName: this.customer.vendedor || undefined, shippingActive: this.shippingActive, shippingAmount: Number(this.shippingAmount) || 0, shippingAddress: this.shippingAddress, shippingReference: this.shippingReference, shippingNote: this.shippingNote, receivedConfirmed: this.receivedConfirmed };
    this.salesService.createSale(payload).subscribe({
      next: (sale) => {
        this.submittingSale.set(false);
        this.completedSale.set(sale);
        this.notifications.setNotice(`Venta #${String(sale.number).padStart(6, '0')} finalizada.`);
        this.saleLines.set([]);
        this.customer = { taxId: '', name: '', phone: '', email: '', address: '', city: '', vendedor: '' };
        this.selectedCustomerId.set(null);
        this.shippingActive = false;
        this.shippingAmount = 0;
        this.dashboardService.load();
      },
      error: (err) => { this.submittingSale.set(false); this.notifications.setError(err.error?.message ?? 'No se pudo finalizar la venta.'); },
    });
  }

  protected printSale(sale: any) { this.salesService.printSale(sale); }
}
