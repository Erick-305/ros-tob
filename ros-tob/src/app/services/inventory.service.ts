import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { DashboardService } from './dashboard.service';
import type { Book } from './models';
import { NotificationService } from './notification.service';

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(NotificationService);
  private readonly dashboardService = inject(DashboardService);

  readonly books = signal<Book[]>([]);
  readonly booksPage = signal(1);
  readonly booksHasNextPage = signal(false);
  readonly showBookForm = signal(false);
  readonly bookFormError = signal('');
  readonly showEntryForm = signal(false);
  readonly editingBook = signal<Book | null>(null);

  search = '';
  category = '';
  bookForm = { barcode: '', title: '', author: '', category: '', cost: 0, salePrice: 0, stock: 0, minStock: 0 };

  loadBooks(page = 1) { this.http.get<{ items: Book[]; page: number; hasNextPage: boolean }>('/api/books', { params: { ...(this.search ? { q: this.search } : {}), page } }).subscribe({ next: (data) => { this.books.set(data.items); this.booksPage.set(data.page); this.booksHasNextPage.set(data.hasNextPage); }, error: (err) => this.notifications.setError(err.error?.message ?? 'No se pudo cargar el inventario.') }); }
  searchBooks() { this.loadBooks(1); }
  previousBooksPage() { if (this.booksPage() > 1) this.loadBooks(this.booksPage() - 1); }
  nextBooksPage() { if (this.booksHasNextPage()) this.loadBooks(this.booksPage() + 1); }
  categories() { return [...new Set(this.books().map((book) => book.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)); }
  filteredBooks() { return this.books().filter((book) => !this.category || book.category === this.category); }

  printInventory() {
    const rows = this.filteredBooks().map((book) => `<tr><td>${this.escapePrint(book.title)}</td><td>${this.escapePrint(book.author)}</td><td>${this.escapePrint(book.category)}</td><td>${this.escapePrint(book.barcode)}</td><td>${book.stock}</td><td>$${book.cost.toFixed(2)}</td><td>$${book.salePrice.toFixed(2)}</td><td>${book.stock === 0 ? 'Sin stock' : book.stock <= book.minStock ? 'Stock bajo' : 'Disponible'}</td></tr>`).join('');
    const category = this.category ? `Categoría: ${this.escapePrint(this.category)}` : 'Todas las categorías';
    const report = `<html><head><title>Inventario General - ROS-TOB</title><style>body{font-family:Arial,sans-serif;color:#111;padding:24px;position:relative}.report-logo{position:absolute;top:0;right:0;width:62px;height:42px;object-fit:contain}h1{text-align:center;color:#23483d;margin-top:0}p{color:#555}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #9bb9d0;padding:8px;text-align:left;font-size:11px}th{background:#e5ebe4}td:nth-child(5),td:nth-child(6),td:nth-child(7){text-align:right}@media print{body{padding:0}}</style></head><body><img class="report-logo" src="${window.location.origin}/images/ros-tob-logo.png" alt="ROS-TOB"><h1>ROS-TOB</h1><h2>Inventario General</h2><p>${category} | Generado: ${new Date().toLocaleString('es-EC')}</p><table><thead><tr><th>Libro</th><th>Autor</th><th>Categoría</th><th>Código</th><th>Stock</th><th>Costo</th><th>Precio venta</th><th>Estado</th></tr></thead><tbody>${rows || '<tr><td colspan="8">No hay libros registrados.</td></tr>'}</tbody></table></body></html>`;
    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) { this.notifications.setError('El navegador bloqueó la ventana de impresión.'); return; }
    printWindow.document.write(report); printWindow.document.close(); printWindow.focus(); printWindow.print();
  }
  private escapePrint(value: unknown) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character); }

  openNewBook(barcode = '') { this.bookFormError.set(''); this.bookForm = { barcode, title: '', author: '', category: '', cost: 0, salePrice: 0, stock: 0, minStock: 0 }; this.showBookForm.set(true); }
  openEditBook(book: Book) { this.bookFormError.set(''); this.bookForm = { barcode: book.barcode, title: book.title, author: book.author, category: book.category, cost: book.cost, salePrice: book.salePrice, stock: book.stock, minStock: book.minStock }; this.editingBook.set(book); this.showBookForm.set(true); }
  openEntry(book: Book) { this.editingBook.set(book); this.bookForm = { barcode: book.barcode, title: book.title, author: book.author, category: book.category, cost: book.cost, salePrice: book.salePrice, stock: 0, minStock: book.minStock }; this.showEntryForm.set(true); }

  saveBook() { this.bookFormError.set(''); this.http.post<Book>('/api/books', this.bookForm).subscribe({ next: () => { this.showBookForm.set(false); this.notifications.setNotice('Libro registrado correctamente.'); this.loadBooks(); this.dashboardService.load(); }, error: (err) => this.bookFormError.set(err.error?.message ?? 'No se pudo registrar el libro.') }); }
  updateBook() {
    const book = this.editingBook();
    if (!book) return;
    const form = this.bookForm;
    const changes = Object.fromEntries((Object.keys(form) as (keyof typeof form)[]).filter((key) => form[key] !== book[key]).map((key) => [key, form[key]]));
    if (Object.keys(changes).length === 0) { this.showBookForm.set(false); this.editingBook.set(null); this.notifications.setNotice('No hay cambios que guardar.'); return; }
    this.bookFormError.set('');
    this.http.patch<Book>(`/api/books/${book.id}`, changes).subscribe({ next: () => { this.showBookForm.set(false); this.editingBook.set(null); this.notifications.setNotice('Libro actualizado correctamente.'); this.loadBooks(); this.dashboardService.load(); }, error: (err) => this.bookFormError.set(this.apiErrorMessage(err, 'No se pudo actualizar el libro.')) });
  }
  private apiErrorMessage(err: any, fallback: string) { const fields = Object.keys(err.error?.errors?.fieldErrors ?? {}); return (err.error?.message ?? fallback) + (fields.length ? ` Campos: ${fields.join(', ')}.` : ''); }
  deleteBook(book: Book) { if (!window.confirm(`¿Eliminar "${book.title}" del inventario? El historial de ventas se conservará.`)) return; this.http.delete(`/api/books/${book.id}`).subscribe({ next: () => { this.notifications.setNotice(`${book.title} eliminado del inventario.`); this.loadBooks(); this.dashboardService.load(); }, error: (err) => this.notifications.setError(err.error?.message ?? 'No se pudo eliminar el libro.') }); }
  saveEntry() { const book = this.editingBook(); if (!book || this.bookForm.stock < 1) { this.notifications.setError('Selecciona un libro y una cantidad válida.'); return; } this.http.post<Book>('/api/inventory/entries', { bookId: book.id, quantity: this.bookForm.stock, cost: this.bookForm.cost }).subscribe({ next: () => { this.showEntryForm.set(false); this.notifications.setNotice(`Entrada registrada para ${book.title}.`); this.loadBooks(); this.dashboardService.load(); }, error: (err) => this.notifications.setError(err.error?.message ?? 'No se pudo registrar la entrada.') }); }

  scanInventory() { const code = this.bookForm.barcode.replace(/[\r\n]/g, '').trim(); this.bookForm.barcode = code; if (code) { this.http.get<Book>(`/api/books/barcode/${encodeURIComponent(code)}`).subscribe({ next: (book) => this.notifications.setNotice(`${book.title} encontrado. Stock: ${book.stock}`), error: () => this.openNewBook(code) }); } }

  lookupBookByBarcode(barcode: string) { return this.http.get<Book>(`/api/books/barcode/${encodeURIComponent(barcode)}`); }
  searchBooksByQuery(query: string) { return this.http.get<{ items: Book[] }>('/api/books', { params: { q: query } }); }
}
