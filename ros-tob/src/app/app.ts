import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dashboard } from './features/dashboard/dashboard';
import { History } from './features/history/history';
import { Inventory } from './features/inventory/inventory';
import { Sale } from './features/sale/sale';
import { Users } from './features/users/users';
import { AuthService } from './services/auth.service';
import { DashboardService } from './services/dashboard.service';
import { parseDecimal } from './services/decimal.util';
import { InventoryService } from './services/inventory.service';
import type { View } from './services/models';
import { NavigationService } from './services/navigation.service';
import { NotificationService } from './services/notification.service';

@Component({
  imports: [FormsModule, Dashboard, Inventory, Sale, History, Users],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {
  private readonly auth = inject(AuthService);
  private readonly navigation = inject(NavigationService);
  private readonly notifications = inject(NotificationService);
  private readonly dashboardService = inject(DashboardService);
  private readonly inventory = inject(InventoryService);

  protected readonly todayLabel = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date()).toUpperCase();
  protected readonly authenticated = this.auth.authenticated;
  protected readonly currentUser = this.auth.currentUser;
  protected readonly isAdmin = this.auth.isAdmin;
  protected readonly view = this.navigation.view;
  protected readonly mobileMenuOpen = this.navigation.mobileMenuOpen;
  protected readonly notice = this.notifications.notice;
  protected readonly error = this.notifications.error;
  protected readonly showBookForm = this.inventory.showBookForm;
  protected readonly bookFormError = this.inventory.bookFormError;
  protected readonly showEntryForm = this.inventory.showEntryForm;
  protected readonly editingBook = this.inventory.editingBook;
  protected readonly parseDecimal = parseDecimal;

  protected readonly forgotMode = signal(false);
  protected readonly recoveryCodeSent = signal(false);
  protected forgotIdentifier = '';
  protected recoveryCode = '';
  protected recoveryPassword = '';
  protected readonly profileImage = signal(localStorage.getItem('ros-tob-profile-image') ?? '');
  protected readonly darkMode = signal(localStorage.getItem('ros-tob-dark-mode') === 'true');
  protected loginForm = { identifier: '', password: '' };

  constructor() { if (this.auth.authenticated()) this.dashboardService.load(); }

  protected get bookForm() { return this.inventory.bookForm; }

  protected navigate(view: View) { this.navigation.navigate(view); }
  protected toggleMobileMenu() { this.navigation.toggleMobileMenu(); }

  protected login() { this.notifications.setError(''); this.auth.login(this.loginForm).subscribe({ next: (result) => { this.auth.applySession(result); this.dashboardService.load(); }, error: (err) => this.notifications.setError(err.error?.message ?? 'No se pudo iniciar sesión.') }); }
  protected logout() { this.auth.logout(); this.loginForm.password = ''; }
  protected changeProfile(event: Event) { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file || !file.type.startsWith('image/')) return; const reader = new FileReader(); reader.onload = () => { const image = String(reader.result); localStorage.setItem('ros-tob-profile-image', image); this.profileImage.set(image); }; reader.readAsDataURL(file); }
  protected toggleDarkMode() { const enabled = !this.darkMode(); this.darkMode.set(enabled); localStorage.setItem('ros-tob-dark-mode', String(enabled)); }
  protected requestPasswordRecovery() { this.notifications.clear(); this.auth.requestPasswordRecovery(this.forgotIdentifier).subscribe({ next: (result) => { this.recoveryCodeSent.set(true); this.notifications.setNotice(result.message); }, error: (err) => this.notifications.setError(err.error?.message ?? 'No se pudo solicitar la recuperación.') }); }
  protected resetPassword() { this.notifications.clear(); this.auth.resetPassword({ identifier: this.forgotIdentifier, code: this.recoveryCode, password: this.recoveryPassword }).subscribe({ next: (result) => { this.notifications.setNotice(result.message); this.forgotMode.set(false); this.recoveryCodeSent.set(false); this.recoveryCode = ''; this.recoveryPassword = ''; this.loginForm.identifier = this.forgotIdentifier; this.loginForm.password = ''; }, error: (err) => this.notifications.setError(err.error?.message ?? 'No se pudo actualizar la contraseña.') }); }

  protected scanInventory() { this.inventory.scanInventory(); }
  protected saveBook() { this.inventory.saveBook(); }
  protected updateBook() { this.inventory.updateBook(); }
  protected saveEntry() { this.inventory.saveEntry(); }
}
