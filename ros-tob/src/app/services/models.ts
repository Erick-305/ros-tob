export type View = 'dashboard' | 'inventory' | 'sale' | 'history' | 'users';

export interface Book { id: number; barcode: string; title: string; author: string; category: string; cost: number; salePrice: number; stock: number; minStock: number; }
export interface SaleLine { bookId: number; barcode: string; title: string; quantity: number; unitPrice: number; }
export interface Dashboard { bookCount: number; unitsAvailable: number; todaySales: number; todayTotal: number; lowStock: Book[]; lowStockTotal: number; outOfStock: Book[]; outOfStockTotal: number; recentSales: any[]; }
export interface SessionUser { id: number; name: string; username: string; email?: string | null; role: string; }
export interface ManagedUser extends SessionUser { active: boolean; }
export interface Customer { id: number; taxId?: string | null; name: string; phone?: string | null; email?: string | null; address?: string | null; city?: string | null; }
