import { AppError } from './errors';
// shortcut: limits and locks are process-local; use a shared limiter/lock before adding replicas.
const buckets = new Map<string, { count: number; expires: number }>();
const busy = new Set<string>();
export function rateLimit(key: string, max: number, now = Date.now()) {
 for (const [id, bucket] of buckets) if (bucket.expires <= now) buckets.delete(id);
 const current = buckets.get(key) ?? { count: 0, expires: now + 60_000 };
 if (current.count >= max || (!buckets.has(key) && buckets.size >= 10_000)) throw new AppError('RATE_LIMITED', 'Too many requests. Wait a minute and try again.', 429, true);
 current.count++;
 buckets.set(key, current);
}
export async function withWorkspaceLock<T>(workspaceId: string, run: () => Promise<T>): Promise<T> {
 if (busy.has(workspaceId)) throw new AppError('WORKSPACE_BUSY', 'A document is already being indexed. Wait and try again.', 409, true);
 busy.add(workspaceId);
 try { return await run(); } finally { busy.delete(workspaceId); }
}
