import type { FastifyInstance } from 'fastify';
import type { ITransactionRepository, IMerchantRuleRepository } from '@financas/shared';
import { makeVerifyJwt } from '../middleware/authenticate.js';
import { GetImportSessionUseCase } from '../use-cases/import/GetImportSessionUseCase.js';
import { ConfirmImportUseCase, type ImportDecision } from '../use-cases/import/ConfirmImportUseCase.js';
import { CancelImportUseCase } from '../use-cases/import/CancelImportUseCase.js';

interface ImportRouteOptions {
  transactionRepo: ITransactionRepository;
  merchantRuleRepo?: IMerchantRuleRepository;
}

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-prod';

export default async function importRoutes(
  app: FastifyInstance,
  opts: ImportRouteOptions,
): Promise<void> {
  const { transactionRepo, merchantRuleRepo } = opts;

  const getSessionUC = new GetImportSessionUseCase(transactionRepo);
  const confirmUC = new ConfirmImportUseCase(transactionRepo);
  const cancelUC = new CancelImportUseCase(transactionRepo);

  const verifyJwt = makeVerifyJwt(JWT_SECRET);

  // GET /transactions/import/:sessionId — fetch session buckets
  app.get<{ Params: { sessionId: string } }>(
    '/transactions/import/:sessionId',
    { preHandler: verifyJwt },
    async (request, reply) => {
      const { sessionId } = request.params;
      const result = await getSessionUC.execute(sessionId);
      return reply.send(result);
    },
  );

  // POST /transactions/import/:sessionId/confirm — accept/reject decisions
  app.post<{
    Params: { sessionId: string };
    Body: { decisions: ImportDecision[] };
  }>(
    '/transactions/import/:sessionId/confirm',
    { preHandler: verifyJwt },
    async (request, reply) => {
      const { sessionId } = request.params;
      const { decisions } = request.body;

      if (!Array.isArray(decisions)) {
        return reply.code(400).send({ error: 'decisions must be an array' });
      }

      const userId = request.user!.id;
      const result = await confirmUC.execute(sessionId, userId, decisions, merchantRuleRepo);

      app.log.info(
        { sessionId, accepted: result.accepted.length, rejected: result.rejected, cleaned: result.cleaned },
        'Import confirmed',
      );

      return reply.send(result);
    },
  );

  // DELETE /transactions/import/:sessionId — cancel and discard all pending rows
  app.delete<{ Params: { sessionId: string } }>(
    '/transactions/import/:sessionId',
    { preHandler: verifyJwt },
    async (request, reply) => {
      const { sessionId } = request.params;
      await cancelUC.execute(sessionId);

      app.log.info({ sessionId }, 'Import cancelled');

      return reply.code(204).send();
    },
  );
}
