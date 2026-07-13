import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { safeErrorDetail } from '../lib/errors';
import { isBadgyRequest, isSecure } from '../lib/req';
import { sessionCookie } from '../lib/session';
import { loadAuthTransactionById, logError, updateAuthTransaction } from '../lib/store';
import { completionDecision } from '../lib/transactions';

interface CompleteBody {
  transactionId: string;
  pollSecret: string;
}

async function requestBody(req: HttpRequest): Promise<CompleteBody> {
  const value: unknown = JSON.parse(await req.text());
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid body');
  const candidate = value as Partial<CompleteBody>;
  if (
    typeof candidate.transactionId !== 'string' ||
    candidate.transactionId.length < 32 ||
    typeof candidate.pollSecret !== 'string' ||
    candidate.pollSecret.length < 32
  )
    throw new Error('invalid body');
  return { transactionId: candidate.transactionId, pollSecret: candidate.pollSecret };
}

function decisionResponse(kind: 'invalid' | 'expired' | 'pending'): HttpResponseInit {
  const headers = { 'Cache-Control': 'no-store' };
  switch (kind) {
    case 'invalid':
      return {
        status: 404,
        headers,
        jsonBody: { status: 'invalid', error: 'invalid_transaction' },
      };
    case 'expired':
      return {
        status: 410,
        headers,
        jsonBody: { status: 'expired', error: 'transaction_expired' },
      };
    case 'pending':
      return { status: 202, headers, jsonBody: { status: 'pending' } };
  }
}

async function complete(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (!isBadgyRequest(req)) return { status: 403, jsonBody: { error: 'forbidden' } };

  let body: CompleteBody;
  try {
    body = await requestBody(req);
  } catch {
    return { status: 400, jsonBody: { error: 'invalid_request' } };
  }

  try {
    let stored = await loadAuthTransactionById(body.transactionId);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (!stored) return decisionResponse('invalid');
      const decision = completionDecision(stored.data, body.pollSecret);
      if (decision.kind === 'failed') {
        return {
          status: 401,
          headers: { 'Cache-Control': 'no-store' },
          jsonBody: { status: 'failed', error: decision.code },
        };
      }
      if (decision.kind !== 'complete') return decisionResponse(decision.kind);

      if (decision.needsConsume) {
        const consumed = await updateAuthTransaction(stored, decision.consumed);
        if (!consumed) {
          stored = await loadAuthTransactionById(body.transactionId);
          continue;
        }
      }

      const account = decision.account;
      return {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
        cookies: [
          sessionCookie(
            { uid: account.id, name: account.name, email: account.email },
            isSecure(req),
          ),
        ],
        jsonBody: { status: 'complete', account },
      };
    }
    return {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: { status: 'error', error: 'temporarily_unavailable' },
    };
  } catch (error: unknown) {
    const detail = safeErrorDetail(error);
    context.error('auth complete failed', detail);
    await logError('auth-complete', JSON.stringify(detail));
    return {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: { status: 'error', error: 'temporarily_unavailable' },
    };
  }
}

app.http('auth-complete', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/complete',
  handler: complete,
});
