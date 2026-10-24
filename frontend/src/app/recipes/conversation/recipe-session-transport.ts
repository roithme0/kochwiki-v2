import {
  HttpSessionTransport,
  SessionCreated,
  SessionCreationRequest,
  SessionHttpError,
  SessionTransportError,
} from '@roithme0/chat-ui/conversation';
import { zConversationCreated } from '../../core/api/generated/zod.gen';
import { backendUrl } from '../../core/constants/api';

export class RecipeSessionTransport extends HttpSessionTransport {
  constructor(
    private readonly sourceRecipeVersionId: string,
    userId: number,
  ) {
    super('/ai/api/v1', 'kochwiki', `kochwiki:${userId}`);
  }

  override async createSession(
    initialization: SessionCreationRequest = {},
  ): Promise<SessionCreated> {
    let response: Response;
    try {
      response = await fetch(`${backendUrl}/recipe-conversations`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceRecipeVersionId: this.sourceRecipeVersionId,
          artifact_capabilities: initialization.artifact_capabilities ?? [],
        }),
      });
    } catch (error: unknown) {
      throw new SessionTransportError('network', { cause: error });
    }
    if (response.status === 503)
      throw new SessionHttpError(503, 'agent_unavailable');
    if (!response.ok) throw new SessionHttpError(response.status, 'unknown');
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error: unknown) {
      throw new SessionTransportError('invalid_response', { cause: error });
    }
    const parsed = zConversationCreated.safeParse(payload);
    if (response.status !== 201 || !parsed.success)
      throw new SessionTransportError('invalid_response');
    return parsed.data;
  }
}
