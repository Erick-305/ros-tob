import { CurrencyPipe, NgClass } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InventoryService } from '../../services/inventory.service';
import type { Book } from '../../services/models';

@Component({
  imports: [FormsModule, CurrencyPipe, NgClass],
  selector: 'app-inventory',
  templateUrl: './inventory.html',
})
export class Inventory {
  protected readonly inventoryService = inject(InventoryService);
  protected readonly books = this.inventoryService.books;
  protected readonly booksPage = this.inventoryService.booksPage;
  protected readonly booksHasNextPage = this.inventoryService.booksHasNextPage;

  protected get search() { return this.inventoryService.search; }
  protected set search(value: string) { this.inventoryService.search = value; }
  protected get category() { return this.inventoryService.category; }
  protected set category(value: string) { this.inventoryService.category = value; }

  protected searchBooks() { this.inventoryService.searchBooks(); }
  protected loadBooks() { this.inventoryService.loadBooks(); }
  protected previousBooksPage() { this.inventoryService.previousBooksPage(); }
  protected nextBooksPage() { this.inventoryService.nextBooksPage(); }
  protected categories() { return this.inventoryService.categories(); }
  protected filteredBooks() { return this.inventoryService.filteredBooks(); }
  protected printInventory() { this.inventoryService.printInventory(); }
  protected openNewBook() { this.inventoryService.openNewBook(); }
  protected openEditBook(book: Book) { this.inventoryService.openEditBook(book); }
  protected openEntry(book: Book) { this.inventoryService.openEntry(book); }
  protected deleteBook(book: Book) { this.inventoryService.deleteBook(book); }
}
