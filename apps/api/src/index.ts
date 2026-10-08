import { createApp } from './app';
const app = createApp();
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
app.listen({ port, host: '::' }).then(() => console.log(`Document Q&A API listening on port ${port}`)).catch(() => { console.error('API startup failed. Check the port and server configuration.'); process.exitCode = 1; });
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { void app.close(); });
