import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type View = 'dashboard' | 'inventory' | 'sale' | 'history';
interface Book { id: number; barcode: string; title: string; author: string; category: string; cost: number; salePrice: number; stock: number; minStock: number; }
interface SaleLine { bookId: number; barcode: string; title: string; quantity: number; unitPrice: number; }
interface Dashboard { bookCount: number; unitsAvailable: number; todaySales: number; todayTotal: number; lowStock: Book[]; outOfStock: Book[]; recentSales: any[]; }

@Component({
  imports: [FormsModule, CurrencyPipe, DatePipe, NgClass],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly http = inject(HttpClient);
  protected readonly view = signal<View>('dashboard');
  protected readonly authenticated = signal(false);
  protected readonly dashboard = signal<Dashboard | null>(null);
  protected readonly books = signal<Book[]>([]);
  protected readonly sales = signal<any[]>([]);
  protected readonly saleLines = signal<SaleLine[]>([]);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly showBookForm = signal(false);
  protected readonly showEntryForm = signal(false);
  protected readonly editingBook = signal<Book | null>(null);
  protected readonly showSaleCustomer = signal(false);
  protected search = '';
  protected barcode = '';
  protected bookForm = { barcode: '', title: '', author: '', category: '', cost: 0, salePrice: 0, stock: 0, minStock: 0 };
  protected customer = { taxId: '', name: '', phone: '', email: '', address: '' };
  protected shippingActive = false;
  protected shippingAmount = 0;
  protected shippingAddress = '';
  protected shippingReference = '';
  protected shippingNote = '';
  protected receivedConfirmed = false;
  protected loginForm = { username: 'admin', password: 'admin123' };

  constructor() { this.authenticated.set(Boolean(localStorage.getItem('ros-tob-token'))); if (this.authenticated()) this.loadDashboard(); }

  protected navigate(view: View) { this.view.set(view); this.notice.set(''); this.error.set(''); if (view === 'inventory') this.loadBooks(); if (view === 'history') this.loadSales(); }
  protected login() { this.error.set(''); this.http.post<{ token: string }>('/api/auth/login', this.loginForm).subscribe({ next: (result) => { localStorage.setItem('ros-tob-token', result.token); this.authenticated.set(true); this.loadDashboard(); }, error: (err) => this.error.set(err.error?.message ?? 'No se pudo iniciar sesión.') }); }
  protected logout() { localStorage.removeItem('ros-tob-token'); this.authenticated.set(false); this.loginForm.password = ''; }
  protected loadDashboard() { this.http.get<Dashboard>('/api/dashboard').subscribe({ next: (data) => this.dashboard.set(data), error: () => this.error.set('No se pudo conectar con la API. Inicia el backend en el puerto 3000.') }); }
  protected loadBooks() { this.http.get<Book[]>('/api/books', { params: this.search ? { q: this.search } : {} }).subscribe({ next: (data) => this.books.set(data), error: (err) => this.error.set(err.error?.message ?? 'No se pudo cargar el inventario.') }); }
  protected loadSales() { this.http.get<any[]>('/api/sales').subscribe({ next: (data) => this.sales.set(data), error: () => this.error.set('No se pudo cargar el historial.') }); }
  protected printSale(sale: any) {
    this.http.get<any>(`/api/sales/${sale.id}`).subscribe({
      next: (detail) => {
        const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character);
        const customer = detail.customer ?? {};
        const date = new Date(detail.createdAt).toLocaleDateString('es-EC');
        const items = detail.items.map((item: any) => `<tr><td>${item.quantity}</td><td>${escapeHtml(item.description)}</td><td>$${Number(item.unitPrice).toFixed(2)}</td><td>$${Number(item.total).toFixed(2)}</td></tr>`).join('');
        const receipt = `<html><head><title>Nota de venta #${detail.number} - ROS-TOB</title><style>
          @page{size:letter;margin:10mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#163d62;font-size:12px}.note{max-width:780px;margin:auto;border:2px solid #4f83af;border-radius:12px;overflow:hidden}.title{padding:10px 16px;text-align:right;border-bottom:1px solid #4f83af}.title h1{display:inline-block;margin:0;padding:4px 12px;border:1px solid #4f83af;border-radius:5px;font-size:20px;letter-spacing:.04em}.meta{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #4f83af}.field{min-height:27px;padding:6px 9px;border-bottom:1px solid #9bb9d0}.field:nth-child(odd){border-right:1px solid #4f83af}.field b{font-size:9px;text-transform:uppercase}.field span{color:#222;margin-left:8px}.items{width:100%;border-collapse:collapse}.items th{height:34px;text-transform:uppercase;font-size:10px;border-bottom:1px solid #4f83af}.items th,.items td{padding:7px 9px;border-right:1px solid #9bb9d0}.items th:last-child,.items td:last-child{border-right:0}.items th:nth-child(1),.items td:nth-child(1){width:11%;text-align:center}.items th:nth-child(2),.items td:nth-child(2){width:54%}.items th:nth-child(3),.items td:nth-child(3),.items th:nth-child(4),.items td:nth-child(4){width:17.5%;text-align:right}.items tbody tr{height:28px}.items tbody td{border-bottom:1px solid #c2d3df;color:#222}.bottom{display:grid;grid-template-columns:1fr 185px;border-top:1px solid #4f83af}.conform{min-height:105px;padding:10px;border-right:1px solid #4f83af;display:flex;align-items:end;justify-content:center}.conform span{border-top:1px solid #4f83af;padding:5px 40px 0;text-transform:uppercase;font-size:10px}.totals{padding:10px}.total-row{display:flex;justify-content:space-between;padding:7px 0;color:#222}.total-row.final{border-top:2px solid #4f83af;font-size:18px;font-weight:bold;color:#163d62}.footer{padding:8px 10px;border-top:1px solid #4f83af;font-size:10px;font-weight:bold}.received{margin-top:8px;text-align:center;font-size:10px}</style></head><body><div class="note"><div class="title"><h1>NOTA DE VENTA</h1></div><div class="meta"><div class="field"><b>Vendido a:</b><span>${escapeHtml(customer.name || 'Consumidor final')}</span></div><div class="field"><b>R.U.C./C.I.:</b><span>${escapeHtml(customer.taxId || '')}</span></div><div class="field"><b>Dirección:</b><span>${escapeHtml(customer.address || '')}</span></div><div class="field"><b>Teléfono:</b><span>${escapeHtml(customer.phone || '')}</span></div><div class="field"><b>Fecha:</b><span>${date}</span></div><div class="field"><b>N.º:</b><span>${String(detail.number).padStart(6, '0')}</span></div></div><table class="items"><thead><tr><th>Cant.</th><th>Descripción</th><th>V. unitario</th><th>V. total</th></tr></thead><tbody>${items}</tbody></table><div class="bottom"><div class="conform">${detail.receivedConfirmed ? '<span>Recibí conforme</span>' : ''}</div><div class="totals"><div class="total-row"><span>Subtotal</span><span>$${Number(detail.subtotal).toFixed(2)}</span></div><div class="total-row"><span>Envío</span><span>$${Number(detail.shippingAmount).toFixed(2)}</span></div><div class="total-row final"><span>TOTAL</span><span>$${Number(detail.total).toFixed(2)}</span></div></div></div><div class="footer">NOTA: Salida la mercadería no se acepta reclamos</div></div></body></html>`;
        const printWindow = window.open('', '_blank', 'width=900,height=1000');
        if (!printWindow) { this.error.set('El navegador bloqueó la ventana de impresión.'); return; }
        printWindow.document.write(receipt); printWindow.document.close(); printWindow.focus(); printWindow.print();
      },
      error: () => this.error.set('No se pudo cargar el detalle de la venta.'),
    });
  }
  protected searchBooks() { this.loadBooks(); }
  protected openNewBook(barcode = '') { this.bookForm = { barcode, title: '', author: '', category: '', cost: 0, salePrice: 0, stock: 0, minStock: 0 }; this.showBookForm.set(true); }
  protected openEditBook(book: Book) { this.bookForm = { barcode: book.barcode, title: book.title, author: book.author, category: book.category, cost: book.cost, salePrice: book.salePrice, stock: book.stock, minStock: book.minStock }; this.editingBook.set(book); this.showBookForm.set(true); }
  protected openEntry(book: Book) { this.editingBook.set(book); this.bookForm = { barcode: book.barcode, title: book.title, author: book.author, category: book.category, cost: book.cost, salePrice: book.salePrice, stock: 0, minStock: book.minStock }; this.showEntryForm.set(true); }
  protected saveBook() { this.http.post<Book>('/api/books', this.bookForm).subscribe({ next: () => { this.showBookForm.set(false); this.notice.set('Libro registrado correctamente.'); this.loadBooks(); this.loadDashboard(); }, error: (err) => this.error.set(err.error?.message ?? 'No se pudo registrar el libro.') }); }
  protected updateBook() { const book = this.editingBook(); if (!book) return; this.http.patch<Book>(`/api/books/${book.id}`, this.bookForm).subscribe({ next: () => { this.showBookForm.set(false); this.editingBook.set(null); this.notice.set('Libro actualizado correctamente.'); this.loadBooks(); this.loadDashboard(); }, error: (err) => this.error.set(err.error?.message ?? 'No se pudo actualizar el libro.') }); }
  protected saveEntry() { const book = this.editingBook(); if (!book || this.bookForm.stock < 1) { this.error.set('Selecciona un libro y una cantidad válida.'); return; } this.http.post<Book>('/api/inventory/entries', { bookId: book.id, quantity: this.bookForm.stock, cost: this.bookForm.cost }).subscribe({ next: () => { this.showEntryForm.set(false); this.notice.set(`Entrada registrada para ${book.title}.`); this.loadBooks(); this.loadDashboard(); }, error: (err) => this.error.set(err.error?.message ?? 'No se pudo registrar la entrada.') }); }
  protected scanInventory() { const code = this.bookForm.barcode.trim(); if (code) { this.http.get<Book>(`/api/books/barcode/${encodeURIComponent(code)}`).subscribe({ next: (book) => this.notice.set(`${book.title} encontrado. Stock: ${book.stock}`), error: () => this.openNewBook(code) }); } }
  protected scanSale() { const code = this.barcode.trim(); if (!code) return; this.http.get<Book>(`/api/books/barcode/${encodeURIComponent(code)}`).subscribe({ next: (book) => { const lines = [...this.saleLines()]; const existing = lines.find((line) => line.bookId === book.id); if (existing) existing.quantity += 1; else lines.push({ bookId: book.id, barcode: book.barcode, title: book.title, quantity: 1, unitPrice: book.salePrice }); this.saleLines.set(lines); this.barcode = ''; this.notice.set(`${book.title} agregado a la venta.`); }, error: () => this.error.set('Código de barras no registrado.') }); }
  protected changeQuantity(line: SaleLine, delta: number) { const lines = this.saleLines().map((item) => item === line ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item); this.saleLines.set(lines); }
  protected removeLine(line: SaleLine) { this.saleLines.set(this.saleLines().filter((item) => item !== line)); }
  protected subtotal() { return this.saleLines().reduce((sum, line) => sum + line.quantity * line.unitPrice, 0); }
  protected total() { return this.subtotal() + (this.shippingActive ? Number(this.shippingAmount) || 0 : 0); }
  protected finalizeSale() { if (!this.saleLines().length) { this.error.set('Agrega al menos un libro a la venta.'); return; } const payload = { items: this.saleLines().map((line) => ({ bookId: line.bookId, quantity: line.quantity, unitPrice: line.unitPrice })), customer: this.customer.name ? this.customer : undefined, shippingActive: this.shippingActive, shippingAmount: Number(this.shippingAmount) || 0, shippingAddress: this.shippingAddress, shippingReference: this.shippingReference, shippingNote: this.shippingNote, receivedConfirmed: this.receivedConfirmed }; this.http.post<any>('/api/sales', payload).subscribe({ next: (sale) => { this.notice.set(`Venta #${String(sale.number).padStart(6, '0')} finalizada.`); this.saleLines.set([]); this.customer = { taxId: '', name: '', phone: '', email: '', address: '' }; this.shippingActive = false; this.shippingAmount = 0; this.navigate('dashboard'); this.loadDashboard(); }, error: (err) => this.error.set(err.error?.message ?? 'No se pudo finalizar la venta.') }); }
}
