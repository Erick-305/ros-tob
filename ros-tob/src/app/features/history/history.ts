import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { SalesService } from '../../services/sales.service';

@Component({
  imports: [CurrencyPipe, DatePipe],
  selector: 'app-history',
  templateUrl: './history.html',
})
export class History {
  protected readonly salesService = inject(SalesService);
  protected readonly sales = this.salesService.sales;
  protected readonly salesPage = this.salesService.salesPage;
  protected readonly salesHasNextPage = this.salesService.salesHasNextPage;

  protected loadSales(page: number) { this.salesService.loadSales(page); }
  protected previousSalesPage() { this.salesService.previousSalesPage(); }
  protected nextSalesPage() { this.salesService.nextSalesPage(); }
  protected printSale(sale: any) { this.salesService.printSale(sale); }
  protected deleteSale(sale: any) { this.salesService.deleteSale(sale); }
}
