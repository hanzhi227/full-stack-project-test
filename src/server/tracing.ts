import { traceable } from 'langsmith/traceable';
// Only fictional demo data is approved for remote traces.
export function traceStage<T>(name: string, run: () => Promise<T>): Promise<T> {
 if (process.env.LANGSMITH_TRACING !== 'true' || !process.env.LANGSMITH_API_KEY) return run();
 return traceable(run, { name, project_name: process.env.LANGSMITH_PROJECT ?? 'document-qa' })();
}
