import crypto from 'node:crypto';

export const hashCode = (code: string) => crypto.createHash('sha256').update(code).digest('hex');
