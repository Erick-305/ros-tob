import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly notice = signal('');
  readonly error = signal('');

  setNotice(message: string) { this.notice.set(message); }
  setError(message: string) { this.error.set(message); }
  clear() { this.notice.set(''); this.error.set(''); }
}
