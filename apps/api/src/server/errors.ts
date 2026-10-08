export class AppError extends Error {
 constructor(public code: string, message: string, public status = 503, public retryable = true) { super(message); this.name = 'AppError'; }
}
