import type { FastifyInstance } from 'fastify';
import type { IMerchantRuleRepository } from '@financas/shared';
import { makeVerifyJwt } from '../middleware/authenticate.js';
import { SaveMerchantRuleUseCase } from '../use-cases/merchant-rules/SaveMerchantRuleUseCase.js';
import { GetMerchantRulesUseCase } from '../use-cases/merchant-rules/GetMerchantRulesUseCase.js';
import { DeleteMerchantRuleUseCase } from '../use-cases/merchant-rules/DeleteMerchantRuleUseCase.js';

interface MerchantRuleRouteOptions {
  merchantRuleRepo: IMerchantRuleRepository;
}

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-prod';

export default async function merchantRuleRoutes(
  app: FastifyInstance,
  opts: MerchantRuleRouteOptions,
): Promise<void> {
  const { merchantRuleRepo } = opts;

  const saveUC = new SaveMerchantRuleUseCase(merchantRuleRepo);
  const getUC = new GetMerchantRulesUseCase(merchantRuleRepo);
  const deleteUC = new DeleteMerchantRuleUseCase(merchantRuleRepo);

  const verifyJwt = makeVerifyJwt(JWT_SECRET);

  // POST /merchant-rules
  app.post<{ Body: { merchantPattern: string; categoryId: string } }>(
    '/merchant-rules',
    { preHandler: verifyJwt },
    async (request, reply) => {
      const userId = request.user!.id;
      const { merchantPattern, categoryId } = request.body;
      const rule = await saveUC.execute(userId, merchantPattern, categoryId, 'exact');
      app.log.info({ userId, pattern: rule.pattern, categoryId: rule.categoryId }, 'merchant-rule created');
      return reply.code(201).send(rule);
    },
  );

  // GET /merchant-rules
  app.get(
    '/merchant-rules',
    { preHandler: verifyJwt },
    async (request, reply) => {
      const userId = request.user!.id;
      const rules = await getUC.execute(userId);
      return reply.send(rules);
    },
  );

  // DELETE /merchant-rules/:id
  app.delete<{ Params: { id: string } }>(
    '/merchant-rules/:id',
    { preHandler: verifyJwt },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;
      try {
        await deleteUC.execute(userId, id);
        return reply.code(204).send();
      } catch (err: any) {
        if (err?.message === 'RULE_NOT_FOUND') {
          return reply.code(404).send({ error: 'Not found' });
        }
        if (err?.message === 'FORBIDDEN') {
          return reply.code(403).send({ error: 'Forbidden' });
        }
        throw err;
      }
    },
  );
}
