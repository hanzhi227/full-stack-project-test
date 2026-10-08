import type { AskRequest, AskResponse } from '@/contracts';
export async function answerQuestion(_input: AskRequest & { workspaceId: string }): Promise<AskResponse> { throw new Error('Agent lane pending'); }
