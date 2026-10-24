import {
  SessionHttpError,
  SessionTransportError,
} from '@roithme0/chat-ui/conversation';
import { RecipeSessionTransport } from './recipe-session-transport';
import { mapSessionInput } from './recipe-conversation-contract';

describe('Recipe session creation transport', () => {
  const created = {
    session_id: 'conversation',
    expires_at: '2026-10-25T12:00:00Z',
  };
  const transport = new RecipeSessionTransport('source-version', 42);
  const request = vi.fn<typeof fetch>();

  beforeEach(() => {
    request.mockReset();
    vi.stubGlobal('fetch', request);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('sends only the source ID and rendering capabilities through the authenticated API', async () => {
    request.mockResolvedValue(Response.json(created, { status: 201 }));
    const initialization = mapSessionInput();
    await expect(
      transport.createSession({
        ...initialization,
        initial_context: { source: { ownerId: 999, name: 'Forged recipe' } },
      }),
    ).resolves.toEqual(created);
    expect(request).toHaveBeenCalledExactlyOnceWith(
      '/api/recipe-conversations',
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceRecipeVersionId: 'source-version',
          artifact_capabilities: initialization.artifact_capabilities,
        }),
      },
    );
  });

  it.each([401, 403, 404, 502, 503, 504])(
    'handles API error %s without requiring the AI service error shape or retrying',
    async (status) => {
      request.mockResolvedValue(
        Response.json({ detail: 'Request failed' }, { status }),
      );
      await expect(transport.createSession()).rejects.toMatchObject({
        status,
        kind: status === 503 ? 'agent_unavailable' : 'unknown',
      } satisfies Partial<SessionHttpError>);
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it('reports network failure without retrying', async () => {
    request.mockRejectedValue(new TypeError('Offline'));
    await expect(transport.createSession()).rejects.toMatchObject({
      reason: 'network',
    } satisfies Partial<SessionTransportError>);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    new Response('not json', { status: 201 }),
    Response.json({ session_id: 'missing-expiry' }, { status: 201 }),
    Response.json({ ...created, session_id: '' }, { status: 201 }),
    Response.json(created, { status: 200 }),
  ])('rejects malformed success responses', async (response) => {
    request.mockResolvedValue(response);
    await expect(transport.createSession()).rejects.toMatchObject({
      reason: 'invalid_response',
    } satisfies Partial<SessionTransportError>);
  });
});
