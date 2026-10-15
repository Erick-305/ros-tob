import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { CustomersService } from './customers.service';
import { InventoryService } from './inventory.service';
import type { View } from './models';
import { NotificationService } from './notification.service';
import { SalesService } from './sales.service';
import { UsersService } from './users.service';

@Injectable({ providedIn: 'root' })
export class NavigationService {
  private readonly inventory = inject(InventoryService);
  private readonly customers = inject(CustomersService);
  private readonly sales = inject(SalesService);
  private readonly users = inject(UsersService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);

  readonly view = signal<View>('dashboard');
  readonly mobileMenuOpen = signal(false);

  navigate(view: View) {
    this.view.set(view);
    this.mobileMenuOpen.set(false);
    this.notifications.clear();
    if (view === 'inventory') this.inventory.loadBooks();
    if (view === 'sale') this.customers.load();
    if (view === 'history') this.sales.loadSales();
    if (view === 'users' && this.auth.isAdmin()) this.users.load();
  }

  toggleMobileMenu() { this.mobileMenuOpen.update((open) => !open); }
}
