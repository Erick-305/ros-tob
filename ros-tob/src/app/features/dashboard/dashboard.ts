import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DashboardService } from '../../services/dashboard.service';
import { InventoryService } from '../../services/inventory.service';
import type { View } from '../../services/models';
import { NavigationService } from '../../services/navigation.service';

@Component({
  imports: [FormsModule, CurrencyPipe, DatePipe],
  selector: 'app-dashboard',
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private readonly navigationService = inject(NavigationService);
  protected readonly dashboardService = inject(DashboardService);
  protected readonly inventory = inject(InventoryService);
  protected readonly dashboard = this.dashboardService.dashboard;

  protected get bookForm() { return this.inventory.bookForm; }
  protected scanInventory() { this.inventory.scanInventory(); }
  protected navigate(view: View) { this.navigationService.navigate(view); }
}
