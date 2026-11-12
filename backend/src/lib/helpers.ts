export const money = (value: unknown) => Number(value ?? 0);

export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const publicBook = (book: any) => ({ ...book, cost: money(book.cost), salePrice: money(book.salePrice) });
