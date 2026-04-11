import type { FastifyInstance } from 'fastify';
import type { IAccountRepository, AccountType } from '@financas/shared';
import { makeVerifyJwt } from '../middleware/authenticate.js';
import { CreateAccountUseCase } from '../use-cases/accounts/CreateAccountUseCase.js';
import { GetAccountsUseCase } from '../use-cases/accounts/GetAccountsUseCase.js';
import { UpdateAccountUseCase } from '../use-cases/accounts/UpdateAccountUseCase.js';
import { DeleteAccountUseCase } from '../use-cases/accounts/DeleteAccountUseCase.js';

interface AccountRouteOptions {
  accountRepo: IAccountRepository;
}

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-prod';

export default async function accountRoutes(
  app: FastifyInstance,
  opts: AccountRouteOptions,
): Promise<void> {
  const { accountRepo } = opts;

  const createUC = new CreateAccountUseCase(accountRepo);
  const getUC = new GetAccountsUseCase(accountRepo);
  const updateUC = new UpdateAccountUseCase(accountRepo);
  const deleteUC = new DeleteAccountUseCase(accountRepo);

  const verifyJwt = makeVerifyJwt(JWT_SECRET);

  // POST /accounts
  app.post<{ Body: { name: string; type: AccountType; closingDay?: number; dueDay?: number } }>(
    '/accounts',
    { preHandler: verifyJwt },
    async (request, reply) => {
      const userId = request.user!.id;
      const { name, type, closingDay, dueDay } = request.body;
      try {
        const account = await createUC.execute(userId, { name, type, closingDay, dueDay });
        return reply.code(201).send(account);
      } catch (err: any) {
        if (err?.message === 'ACCOUNT_NOT_FOUND') {
          return reply.code(404).send({ error: 'Not found' });
        }
        if (err?.message === 'FORBIDDEN') {
          return reply.code(403).send({ error: 'Forbidden' });
        }
        throw err;
      }
    },
  );

  // GET /accounts
  app.get(
    '/accounts',
    { preHandler: verifyJwt },
    async (request, reply) => {
      const userId = request.user!.id;
      const accounts = await getUC.execute(userId);
      return reply.send(accounts);
    },
  );

  // PUT /accounts/:id
  app.put<{
    Params: { id: string };
    Body: { name?: string; type?: AccountType; closingDay?: number; dueDay?: number };
  }>(
    '/accounts/:id',
    { preHandler: verifyJwt },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;
      const { name, type, closingDay, dueDay } = request.body;
      try {
        const account = await updateUC.execute(userId, id, { name, type, closingDay, dueDay });
        return reply.send(account);
      } catch (err: any) {
        if (err?.message === 'ACCOUNT_NOT_FOUND') {
          return reply.code(404).send({ error: 'Not found' });
        }
        if (err?.message === 'FORBIDDEN') {
          return reply.code(403).send({ error: 'Forbidden' });
        }
        throw err;
      }
    },
  );

  // DELETE /accounts/:id
  app.delete<{ Params: { id: string } }>(
    '/accounts/:id',
    { preHandler: verifyJwt },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;
      try {
        await deleteUC.execute(userId, id);
        return reply.code(204).send();
      } catch (err: any) {
        if (err?.message === 'ACCOUNT_NOT_FOUND') {
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
