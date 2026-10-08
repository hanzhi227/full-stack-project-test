import { AppError } from './errors';
export function requiredEnv(name: string): string {
 const value = process.env[name]?.trim();
 if (!value) throw new AppError('CONFIGURATION_REQUIRED', `Set ${name} on the server before using this feature.`, 503, false);
 return value;
}
export function missingConfiguration(): string[] {
 return ['OPENROUTER_API_KEY','OPENROUTER_EMBEDDING_MODEL','OPENROUTER_CHAT_MODEL','ZILLIZ_ENDPOINT','ZILLIZ_TOKEN','SESSION_SIGNING_SECRET'].filter(name => !process.env[name]?.trim());
}
