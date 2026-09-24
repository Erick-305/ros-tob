import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type View = 'dashboard' | 'inventory' | 'sale' | 'history' | 'users';
interface Book { id: number; barcode: string; title: string; author: string; category: string; cost: number; salePrice: number; stock: number; minStock: number; }
interface SaleLine { bookId: number; barcode: string; title: string; quantity: number; unitPrice: number; }
interface Dashboard { bookCount: number; unitsAvailable: number; todaySales: number; todayTotal: number; lowStock: Book[]; lowStockTotal: number; outOfStock: Book[]; outOfStockTotal: number; recentSales: any[]; }
interface SessionUser { id: number; name: string; username: string; email?: string | null; role: string; }
interface ManagedUser extends SessionUser { active: boolean; }
interface Customer { id: number; taxId?: string | null; name: string; phone?: string | null; email?: string | null; address?: string | null; city?: string | null; }

@Component({
  imports: [FormsModule, CurrencyPipe, DatePipe, NgClass],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly http = inject(HttpClient);
  protected readonly todayLabel = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date()).toUpperCase();
  protected readonly view = signal<View>('dashboard');
  protected readonly authenticated = signal(false);
  protected readonly currentUser = signal<SessionUser | null>(this.readStoredUser());
  protected readonly isAdmin = signal(false);
  protected readonly forgotMode = signal(false);
  protected readonly recoveryCodeSent = signal(false);
  protected forgotIdentifier = '';
  protected recoveryCode = '';
  protected recoveryPassword = '';
  protected readonly profileImage = signal(localStorage.getItem('ros-tob-profile-image') ?? '');
  protected readonly darkMode = signal(localStorage.getItem('ros-tob-dark-mode') === 'true');
  protected readonly mobileMenuOpen = signal(false);
  protected readonly dashboard = signal<Dashboard | null>(null);
  protected readonly books = signal<Book[]>([]);
  protected readonly booksPage = signal(1);
  protected readonly booksHasNextPage = signal(false);
  protected readonly sales = signal<any[]>([]);
  protected readonly completedSale = signal<any | null>(null);
  protected readonly salesPage = signal(1);
  protected readonly salesHasNextPage = signal(false);
  protected readonly users = signal<ManagedUser[]>([]);
  protected readonly customers = signal<Customer[]>([]);
  protected customerSearch = '';
  protected readonly selectedCustomerId = signal<number | null>(null);
  protected readonly saleLines = signal<SaleLine[]>([]);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly showBookForm = signal(false);
  protected readonly bookFormError = signal('');
  protected readonly showEntryForm = signal(false);
  protected readonly editingBook = signal<Book | null>(null);
  protected readonly showSaleCustomer = signal(false);
  protected search = '';
  protected category = '';
  protected barcode = '';
  protected bookForm = { barcode: '', title: '', author: '', category: '', cost: 0, salePrice: 0, stock: 0, minStock: 0 };
  protected customer = { taxId: '', name: '', phone: '', email: '', address: '', city: '' };
  protected shippingActive = false;
  protected shippingAmount = 0;
  protected shippingAddress = '';
  protected shippingReference = '';
  protected shippingNote = '';
  protected receivedConfirmed = false;
  protected loginForm = { identifier: '', password: '' };

  constructor() { const token = localStorage.getItem('ros-tob-token'); const tokenRole = token ? this.readTokenRole(token) : ''; this.authenticated.set(Boolean(token)); this.isAdmin.set((localStorage.getItem('ros-tob-role') ?? tokenRole) === 'ADMIN'); if (this.authenticated()) this.loadDashboard(); }

  private readTokenRole(token: string) { try { return JSON.parse(atob(token.split('.')[1] ?? '')).role ?? ''; } catch { return ''; } }
  private readStoredUser(): SessionUser | null { try { return JSON.parse(localStorage.getItem('ros-tob-user') ?? 'null') as SessionUser | null; } catch { return null; } }

  protected navigate(view: View) { this.view.set(view); this.mobileMenuOpen.set(false); this.notice.set(''); this.error.set(''); if (view === 'inventory') this.loadBooks(); if (view === 'sale') this.loadCustomers(); if (view === 'history') this.loadSales(); if (view === 'users' && this.isAdmin()) this.loadUsers(); }
  protected login() { this.error.set(''); this.http.post<{ token: string; user: SessionUser }>('/api/auth/login', this.loginForm).subscribe({ next: (result) => { localStorage.setItem('ros-tob-token', result.token); localStorage.setItem('ros-tob-role', result.user.role); localStorage.setItem('ros-tob-user', JSON.stringify(result.user)); this.currentUser.set(result.user); this.isAdmin.set(result.user.role === 'ADMIN'); this.authenticated.set(true); this.loadDashboard(); }, error: (err) => this.error.set(err.error?.message ?? 'No se pudo iniciar sesión.') }); }
  protected logout() { localStorage.removeItem('ros-tob-token'); localStorage.removeItem('ros-tob-role'); localStorage.removeItem('ros-tob-user'); this.currentUser.set(null); this.authenticated.set(false); this.isAdmin.set(false); this.loginForm.password = ''; }
  protected changeProfile(event: Event) { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file || !file.type.startsWith('image/')) return; const reader = new FileReader(); reader.onload = () => { const image = String(reader.result); localStorage.setItem('ros-tob-profile-image', image); this.profileImage.set(image); }; reader.readAsDataURL(file); }
  protected toggleDarkMode() { const enabled = !this.darkMode(); this.darkMode.set(enabled); localStorage.setItem('ros-tob-dark-mode', String(enabled)); }
  protected toggleMobileMenu() { this.mobileMenuOpen.update((open) => !open); }
  protected loadDashboard() { this.http.get<Dashboard>('/api/dashboard').subscribe({ next: (data) => this.dashboard.set(data), error: (err) => { if (err.status === 401) this.logout(); else this.error.set('No se pudo conectar con la API. Inicia el backend en el puerto 3000.'); } }); }
  protected loadBooks(page = 1) { this.http.get<{ items: Book[]; page: number; hasNextPage: boolean }>('/api/books', { params: { ...(this.search ? { q: this.search } : {}), page } }).subscribe({ next: (data) => { this.books.set(data.items); this.booksPage.set(data.page); this.booksHasNextPage.set(data.hasNextPage); }, error: (err) => this.error.set(err.error?.message ?? 'No se pudo cargar el inventario.') }); }
  protected previousBooksPage() { if (this.booksPage() > 1) this.loadBooks(this.booksPage() - 1); }
  protected nextBooksPage() { if (this.booksHasNextPage()) this.loadBooks(this.booksPage() + 1); }
  protected categories() { return [...new Set(this.books().map((book) => book.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)); }
  protected filteredBooks() { return this.books().filter((book) => !this.category || book.category === this.category); }
  protected printInventory() {
    const rows = this.filteredBooks().map((book) => `<tr><td>${this.escapePrint(book.title)}</td><td>${this.escapePrint(book.author)}</td><td>${this.escapePrint(book.category)}</td><td>${this.escapePrint(book.barcode)}</td><td>${book.stock}</td><td>$${book.cost.toFixed(2)}</td><td>$${book.salePrice.toFixed(2)}</td><td>${book.stock === 0 ? 'Sin stock' : book.stock <= book.minStock ? 'Stock bajo' : 'Disponible'}</td></tr>`).join('');
    const category = this.category ? `Categoría: ${this.escapePrint(this.category)}` : 'Todas las categorías';
    const report = `<html><head><title>Inventario General - ROS-TOB</title><style>body{font-family:Arial,sans-serif;color:#111;padding:24px;position:relative}.report-logo{position:absolute;top:0;right:0;width:62px;height:42px;object-fit:contain}h1{text-align:center;color:#23483d;margin-top:0}p{color:#555}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #9bb9d0;padding:8px;text-align:left;font-size:11px}th{background:#e5ebe4}td:nth-child(5),td:nth-child(6),td:nth-child(7){text-align:right}@media print{body{padding:0}}</style></head><body><img class="report-logo" src="${window.location.origin}/images/ros-tob.jpeg" alt="ROS-TOB"><h1>ROS-TOB</h1><h2>Inventario General</h2><p>${category} | Generado: ${new Date().toLocaleString('es-EC')}</p><table><thead><tr><th>Libro</th><th>Autor</th><th>Categoría</th><th>Código</th><th>Stock</th><th>Costo</th><th>Precio venta</th><th>Estado</th></tr></thead><tbody>${rows || '<tr><td colspan="8">No hay libros registrados.</td></tr>'}</tbody></table></body></html>`;
    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) { this.error.set('El navegador bloqueó la ventana de impresión.'); return; }
    printWindow.document.write(report); printWindow.document.close(); printWindow.focus(); printWindow.print();
  }
  private escapePrint(value: unknown) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character); }
  protected loadSales(page = 1) { this.http.get<{ items: any[]; page: number; hasNextPage: boolean }>('/api/sales', { params: { page } }).subscribe({ next: (data) => { this.sales.set(data.items); this.salesPage.set(data.page); this.salesHasNextPage.set(data.hasNextPage); }, error: () => this.error.set('No se pudo cargar el historial.') }); }
  protected previousSalesPage() { if (this.salesPage() > 1) this.loadSales(this.salesPage() - 1); }
  protected nextSalesPage() { if (this.salesHasNextPage()) this.loadSales(this.salesPage() + 1); }
  protected loadUsers() { this.http.get<ManagedUser[]>('/api/users').subscribe({ next: (data) => this.users.set(data), error: (err) => this.error.set(err.error?.message ?? 'No se pudieron cargar los usuarios.') }); }
  protected loadCustomers() { this.http.get<Customer[]>('/api/customers').subscribe({ next: (data) => this.customers.set(data), error: (err) => this.error.set(err.error?.message ?? 'No se pudieron cargar los clientes.') }); }
  protected filteredCustomers() { const query = this.customerSearch.trim().toLowerCase(); return this.customers().filter((customer) => !query || [customer.name, customer.taxId, customer.email, customer.phone, customer.city].some((value) => String(value ?? '').toLowerCase().includes(query))); }
  protected selectCustomer(customer: Customer) { this.selectedCustomerId.set(customer.id); this.customer = { taxId: customer.taxId ?? '', name: customer.name, phone: customer.phone ?? '', email: customer.email ?? '', address: customer.address ?? '', city: customer.city ?? '' }; this.showSaleCustomer.set(true); }
  protected updateCustomer() { const id = this.selectedCustomerId(); if (!id || !this.customer.name.trim()) { this.error.set('Selecciona un cliente y completa su nombre.'); return; } this.http.patch<Customer>(`/api/customers/${id}`, this.customer).subscribe({ next: (updated) => { this.customers.update((items) => items.map((item) => item.id === updated.id ? updated : item)); this.notice.set('Datos del cliente actualizados.'); }, error: (err) => this.error.set(err.error?.message ?? 'No se pudieron actualizar los datos del cliente.') }); }
  protected deleteCustomer(customer: Customer, event: Event) { event.stopPropagation(); if (!window.confirm(`¿Eliminar a "${customer.name}" de los clientes guardados?`)) return; this.http.delete(`/api/customers/${customer.id}`).subscribe({ next: () => { this.notice.set(`${customer.name} eliminado.`); this.loadCustomers(); }, error: (err) => this.error.set(err.error?.message ?? 'No se pudo eliminar el cliente.') }); }
  protected toggleUser(user: ManagedUser) { this.http.patch<ManagedUser>(`/api/users/${user.id}/status`, { active: !user.active }).subscribe({ next: (updated) => { this.users.update((items) => items.map((item) => item.id === updated.id ? updated : item)); this.notice.set(`${updated.name} ${updated.active ? 'activado' : 'desactivado'}.`); }, error: (err) => this.error.set(err.error?.message ?? 'No se pudo actualizar la cuenta.') }); }
  protected requestPasswordRecovery() { this.error.set(''); this.notice.set(''); this.http.post('/api/auth/forgot-password', { identifier: this.forgotIdentifier }).subscribe({ next: (result: any) => { this.recoveryCodeSent.set(true); this.notice.set(result.message); }, error: (err) => this.error.set(err.error?.message ?? 'No se pudo solicitar la recuperación.') }); }
  protected resetPassword() { this.error.set(''); this.notice.set(''); this.http.post('/api/auth/reset-password', { identifier: this.forgotIdentifier, code: this.recoveryCode, password: this.recoveryPassword }).subscribe({ next: (result: any) => { this.notice.set(result.message); this.forgotMode.set(false); this.recoveryCodeSent.set(false); this.recoveryCode = ''; this.recoveryPassword = ''; this.loginForm.identifier = this.forgotIdentifier; this.loginForm.password = ''; }, error: (err) => this.error.set(err.error?.message ?? 'No se pudo actualizar la contraseña.') }); }
  protected deleteSale(sale: any) { if (!window.confirm(`¿Eliminar la venta #${sale.number}? El stock será restaurado.`)) return; this.http.delete(`/api/sales/${sale.id}`).subscribe({ next: () => { this.notice.set(`Venta #${sale.number} eliminada.`); this.loadSales(this.salesPage()); this.loadDashboard(); }, error: (err) => this.error.set(err.error?.message ?? 'No se pudo eliminar la venta.') }); }
  protected printSale(sale: any) {
    this.http.get<any>(`/api/sales/${sale.id}`).subscribe({
      next: (detail) => {
        const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character);
        const customer = detail.customer ?? {};
        const date = new Date(detail.createdAt).toLocaleDateString('es-EC');
        const items = detail.items.map((item: any) => `<tr><td>${item.quantity}</td><td>${escapeHtml(item.description)}</td><td>$${Number(item.unitPrice).toFixed(2)}</td><td>$${Number(item.total).toFixed(2)}</td></tr>`).join('');
        const receipt = `<html><head><title>Nota de venta #${detail.number} - ROS-TOB</title><style>
          @page{size:letter;margin:10mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#163d62;font-size:12px}.note{max-width:780px;margin:auto;border:2px solid #4f83af;border-radius:12px;overflow:hidden}.title{padding:10px 16px;text-align:right;border-bottom:1px solid #4f83af}.title h1{display:inline-block;margin:0;padding:4px 12px;border:1px solid #4f83af;border-radius:5px;font-size:20px;letter-spacing:.04em}.meta{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #4f83af}.field{min-height:27px;padding:6px 9px;border-bottom:1px solid #9bb9d0}.field:nth-child(odd){border-right:1px solid #4f83af}.field b{font-size:9px;text-transform:uppercase}.field span{color:#222;margin-left:8px}.items{width:100%;border-collapse:collapse}.items th{height:34px;text-transform:uppercase;font-size:10px;border-bottom:1px solid #4f83af}.items th,.items td{padding:7px 9px;border-right:1px solid #9bb9d0}.items th:last-child,.items td:last-child{border-right:0}.items th:nth-child(1),.items td:nth-child(1){width:11%;text-align:center}.items th:nth-child(2),.items td:nth-child(2){width:54%}.items th:nth-child(3),.items td:nth-child(3),.items th:nth-child(4),.items td:nth-child(4){width:17.5%;text-align:right}.items tbody tr{height:28px}.items tbody td{border-bottom:1px solid #c2d3df;color:#222}.bottom{display:grid;grid-template-columns:1fr 185px;border-top:1px solid #4f83af}.conform{min-height:105px;padding:10px;border-right:1px solid #4f83af;display:flex;align-items:end;justify-content:center}.conform span{border-top:1px solid #4f83af;padding:5px 40px 0;text-transform:uppercase;font-size:10px}.totals{padding:10px}.total-row{display:flex;justify-content:space-between;padding:7px 0;color:#222}.total-row.final{border-top:2px solid #4f83af;font-size:18px;font-weight:bold;color:#163d62}.footer{padding:8px 10px;border-top:1px solid #4f83af;font-size:10px;font-weight:bold}.received{margin-top:8px;text-align:center;font-size:10px}</style></head><body><div class="note"><div class="title"><h1>NOTA DE VENTA</h1></div><div class="meta"><div class="field"><b>Vendido a:</b><span>${escapeHtml(customer.name || 'Consumidor final')}</span></div><div class="field" style="display:flex;justify-content:space-between;align-items:center"><span><b>R.U.C./C.I.:</b> ${escapeHtml(customer.taxId || '')}</span><span style="padding-left:12px;margin-left:12px;border-left:1px solid #4f83af"><b>N.º:</b> ${String(detail.number).padStart(6, '0')}</span></div><div class="field"><b>Dirección:</b><span>${escapeHtml(customer.address || '')}</span></div><div class="field"><b>Teléfono:</b><span>${escapeHtml(customer.phone || '')}</span></div><div class="field"><b>Fecha:</b><span>${date}</span></div></div><table class="items"><thead><tr><th>Cant.</th><th>Descripción</th><th>V. unitario</th><th>V. total</th></tr></thead><tbody>${items}</tbody></table><div class="bottom"><div class="conform">${detail.receivedConfirmed ? '<span>Recibí conforme</span>' : ''}</div><div class="totals"><div class="total-row"><span>Subtotal</span><span>$${Number(detail.subtotal).toFixed(2)}</span></div><div class="total-row"><span>Envío</span><span>$${Number(detail.shippingAmount).toFixed(2)}</span></div><div class="total-row final"><span>TOTAL</span><span>$${Number(detail.total).toFixed(2)}</span></div></div></div><div class="footer">NOTA: Salida la mercadería no se acepta reclamos</div></div></body></html>`;
        const printWindow = window.open('', '_blank', 'width=900,height=1000');
        if (!printWindow) { this.error.set('El navegador bloqueó la ventana de impresión.'); return; }
        const receiptWithCity = receipt.replace(
          `<span>${escapeHtml(customer.address || '')}</span></div><div class="field"><b>Teléfono:</b>`,
          `<span>${escapeHtml(customer.address || '')}</span></div><div class="field"><b>Ciudad:</b><span>${escapeHtml(customer.city || '')}</span></div><div class="field"><b>Teléfono:</b>`,
        );
        const compactReceipt = receiptWithCity
          .replace('</style>', '@page{margin:0}.note{margin:0 auto}.note,.note .field,.note .field b,.note .field span,.note .items,.note .items th,.note .items td,.note .total-row{font-size:10px!important}.note .title h1{font-size:14px!important}.note .total-row.final{font-size:11px!important}.note .items{table-layout:auto}.note .items th,.note .items td{width:auto!important;white-space:nowrap}.note .items th:nth-child(2),.note .items td:nth-child(2){width:100%!important;white-space:normal}.note .bottom{height:45px!important;min-height:45px!important;grid-template-rows:45px!important;align-items:stretch!important;overflow:hidden!important}.note .conform{min-height:45px!important;height:45px!important;padding:2px!important;align-self:stretch!important;align-items:flex-end!important}.note .conform span{padding:1px 24px 0!important;font-size:8px!important}.note .totals{padding:2px!important}.note .total-row{padding:1px 0!important;line-height:11px!important}</style>');
        printWindow.document.write(compactReceipt.replace('<div class="title">', '<div class="title" style="position:relative"><span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#163d62;font:bold 16px Arial,sans-serif;white-space:nowrap">ROS-TOB</span>')); printWindow.document.close(); printWindow.document.title = `Nota de venta #${detail.number} - ROS-TOB`; printWindow.focus(); printWindow.print();
      },
      error: () => this.error.set('No se pudo cargar el detalle de la venta.'),
    });
  }
  protected searchBooks() { this.loadBooks(1); }
  protected openNewBook(barcode = '') { this.bookFormError.set(''); this.bookForm = { barcode, title: '', author: '', category: '', cost: 0, salePrice: 0, stock: 0, minStock: 0 }; this.showBookForm.set(true); }
  protected openEditBook(book: Book) { this.bookFormError.set(''); this.bookForm = { barcode: book.barcode, title: book.title, author: book.author, category: book.category, cost: book.cost, salePrice: book.salePrice, stock: book.stock, minStock: book.minStock }; this.editingBook.set(book); this.showBookForm.set(true); }
  protected openEntry(book: Book) { this.editingBook.set(book); this.bookForm = { barcode: book.barcode, title: book.title, author: book.author, category: book.category, cost: book.cost, salePrice: book.salePrice, stock: 0, minStock: book.minStock }; this.showEntryForm.set(true); }
  protected saveBook() { this.bookFormError.set(''); this.http.post<Book>('/api/books', this.bookForm).subscribe({ next: () => { this.showBookForm.set(false); this.notice.set('Libro registrado correctamente.'); this.loadBooks(); this.loadDashboard(); }, error: (err) => this.bookFormError.set(err.error?.message ?? 'No se pudo registrar el libro.') }); }
  protected updateBook() { const book = this.editingBook(); if (!book) return; this.http.patch<Book>(`/api/books/${book.id}`, this.bookForm).subscribe({ next: () => { this.showBookForm.set(false); this.editingBook.set(null); this.notice.set('Libro actualizado correctamente.'); this.loadBooks(); this.loadDashboard(); }, error: (err) => this.error.set(err.error?.message ?? 'No se pudo actualizar el libro.') }); }
  protected deleteBook(book: Book) { if (!window.confirm(`¿Eliminar "${book.title}" del inventario? El historial de ventas se conservará.`)) return; this.http.delete(`/api/books/${book.id}`).subscribe({ next: () => { this.notice.set(`${book.title} eliminado del inventario.`); this.loadBooks(); this.loadDashboard(); }, error: (err) => this.error.set(err.error?.message ?? 'No se pudo eliminar el libro.') }); }
  protected saveEntry() { const book = this.editingBook(); if (!book || this.bookForm.stock < 1) { this.error.set('Selecciona un libro y una cantidad válida.'); return; } this.http.post<Book>('/api/inventory/entries', { bookId: book.id, quantity: this.bookForm.stock, cost: this.bookForm.cost }).subscribe({ next: () => { this.showEntryForm.set(false); this.notice.set(`Entrada registrada para ${book.title}.`); this.loadBooks(); this.loadDashboard(); }, error: (err) => this.error.set(err.error?.message ?? 'No se pudo registrar la entrada.') }); }
  protected scanInventory() { const code = this.bookForm.barcode.replace(/[\r\n]/g, '').trim(); this.bookForm.barcode = code; if (code) { this.http.get<Book>(`/api/books/barcode/${encodeURIComponent(code)}`).subscribe({ next: (book) => this.notice.set(`${book.title} encontrado. Stock: ${book.stock}`), error: () => this.openNewBook(code) }); } }
  protected scanSale() { const code = this.barcode.replace(/[\r\n]/g, '').trim(); this.barcode = code; if (!code) return; this.http.get<Book>(`/api/books/barcode/${encodeURIComponent(code)}`).subscribe({ next: (book) => { const lines = [...this.saleLines()]; const existing = lines.find((line) => line.bookId === book.id); if (existing) existing.quantity += 1; else lines.push({ bookId: book.id, barcode: book.barcode, title: book.title, quantity: 1, unitPrice: book.salePrice }); this.saleLines.set(lines); this.barcode = ''; this.notice.set(`${book.title} agregado a la venta.`); }, error: () => this.error.set('Código de barras no registrado.') }); }
  protected changeQuantity(line: SaleLine, quantity: number) { const lines = this.saleLines().map((item) => item === line ? { ...item, quantity: Math.max(1, Number.isFinite(quantity) ? Math.floor(quantity) : 1) } : item); this.saleLines.set(lines); }
  protected removeLine(line: SaleLine) { this.saleLines.set(this.saleLines().filter((item) => item !== line)); }
  protected subtotal() { return this.saleLines().reduce((sum, line) => sum + line.quantity * line.unitPrice, 0); }
  protected total() { return this.subtotal() + (this.shippingActive ? Number(this.shippingAmount) || 0 : 0); }
  protected finalizeSale() { if (!this.saleLines().length) { this.error.set('Agrega al menos un libro a la venta.'); return; } const payload = { items: this.saleLines().map((line) => ({ bookId: line.bookId, quantity: line.quantity, unitPrice: line.unitPrice })), customer: this.customer.name ? this.customer : undefined, shippingActive: this.shippingActive, shippingAmount: Number(this.shippingAmount) || 0, shippingAddress: this.shippingAddress, shippingReference: this.shippingReference, shippingNote: this.shippingNote, receivedConfirmed: this.receivedConfirmed }; this.http.post<any>('/api/sales', payload).subscribe({ next: (sale) => { this.completedSale.set(sale); this.notice.set(`Venta #${String(sale.number).padStart(6, '0')} finalizada.`); this.saleLines.set([]); this.customer = { taxId: '', name: '', phone: '', email: '', address: '', city: '' }; this.selectedCustomerId.set(null); this.shippingActive = false; this.shippingAmount = 0; this.loadDashboard(); }, error: (err) => this.error.set(err.error?.message ?? 'No se pudo finalizar la venta.') }); }
}
