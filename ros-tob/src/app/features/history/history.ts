import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SalesService } from '../../services/sales.service';

@Component({
  imports: [CurrencyPipe, DatePipe, FormsModule],
  selector: 'app-history',
  templateUrl: './history.html',
})
export class History {
  protected readonly salesService = inject(SalesService);
  protected readonly sales = this.salesService.sales;
  protected readonly salesPage = this.salesService.salesPage;
  protected readonly salesHasNextPage = this.salesService.salesHasNextPage;
  protected search = this.salesService.search;

  protected loadSales(page: number) { this.salesService.loadSales(page); }
  protected searchSales() { this.salesService.searchSales(this.search); }
  protected previousSalesPage() { this.salesService.previousSalesPage(); }
  protected nextSalesPage() { this.salesService.nextSalesPage(); }
  protected printSale(sale: any) { this.salesService.printSale(sale); }
  protected deleteSale(sale: any) { this.salesService.deleteSale(sale); }
}
