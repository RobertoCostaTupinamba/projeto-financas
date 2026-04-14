import type { FastifyInstance } from 'fastify';
import type { ITransactionRepository, ICategoryRepository, IMerchantRuleRepository, TransactionType, UpdateTransactionDto } from '@financas/shared';
import { makeVerifyJwt } from '../middleware/authenticate.js';
import { CreateTransactionUseCase } from '../use-cases/transactions/CreateTransactionUseCase.js';
import { GetTransactionsUseCase } from '../use-cases/transactions/GetTransactionsUseCase.js';
import { GetTransactionSummaryUseCase } from '../use-cases/transactions/GetTransactionSummaryUseCase.js';
import { UpdateTransactionUseCase } from '../use-cases/transactions/UpdateTransactionUseCase.js';
import { DeleteTransactionUseCase } from '../use-cases/transactions/DeleteTransactionUseCase.js';
import { ImportTransactionsUseCase } from '../use-cases/transactions/ImportTransactionsUseCase.js';

interface TransactionRouteOptions {
  transactionRepo: ITransactionRepository;
  categoryRepo: ICategoryRepository;
  merchantRuleRepo: IMerchantRuleRepository;
}

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-prod';

const MONTH_REGEX = /^\d{4}-\d{2}$/;

function parseMonth(monthStr: string): { year: number; month: number } | null {
  if (!MONTH_REGEX.test(monthStr)) return null;
  const [year, month] = monthStr.split('-').map((s) => parseInt(s, 10));
  return { year, month };
}

export default async function transactionRoutes(
  app: FastifyInstance,
  opts: TransactionRouteOptions,
): Promise<void> {
  const { transactionRepo, categoryRepo, merchantRuleRepo } = opts;

  const createUC = new CreateTransactionUseCase(transactionRepo);
  const getUC = new GetTransactionsUseCase(transactionRepo);
  const getSummaryUC = new GetTransactionSummaryUseCase(transactionRepo, categoryRepo);
  const updateUC = new UpdateTransactionUseCase(transactionRepo);
  const deleteUC = new DeleteTransactionUseCase(transactionRepo);
  const importUC = new ImportTransactionsUseCase(transactionRepo, merchantRuleRepo);

  const verifyJwt = makeVerifyJwt(JWT_SECRET);

  // POST /transactions
  app.post<{
    Body: {
      accountId: string;
      categoryId?: string;
      amount: number;
      type: TransactionType;
      date: string;
      description?: string;
    };
  }>(
    '/transactions',
    { preHandler: verifyJwt },
    async (request, reply) => {
      const userId = request.user!.id;
      const { accountId, categoryId, amount, type, date, description } = request.body;
      try {
        const transaction = await createUC.execute(userId, {
          accountId,
          categoryId,
          amount,
          type,
          date: new Date(date),
          description,
        });
        return reply.code(201).send(transaction);
      } catch (err: any) {
        if (err?.message === 'INVALID_AMOUNT') {
          return reply.code(400).send({ error: 'Amount must be greater than 0' });
        }
        if (err?.message === 'TRANSACTION_NOT_FOUND') {
          app.log.warn({ transactionId: undefined, userId }, 'Transaction not found');
          return reply.code(404).send({ error: 'Not found' });
        }
        if (err?.message === 'FORBIDDEN') {
          app.log.warn({ userId }, 'Forbidden access to transaction');
          return reply.code(403).send({ error: 'Forbidden' });
        }
        throw err;
      }
    },
  );

  // GET /transactions?month=YYYY-MM
  app.get<{ Querystring: { month?: string } }>(
    '/transactions',
    { preHandler: verifyJwt },
    async (request, reply) => {
      const userId = request.user!.id;
      const { month } = request.query;
      if (month !== undefined) {
        const parsed = parseMonth(month);
        if (!parsed) {
          return reply.code(400).send({ error: 'Invalid month format. Use YYYY-MM' });
        }
        const transactions = await getUC.execute(userId, parsed);
        return reply.send(transactions);
      }
      const transactions = await getUC.execute(userId);
      return reply.send(transactions);
    },
  );

  // GET /transactions/summary?month=YYYY-MM
  app.get<{ Querystring: { month?: string } }>(
    '/transactions/summary',
    { preHandler: verifyJwt },
    async (request, reply) => {
      const userId = request.user!.id;
      const { month } = request.query;
      if (!month) {
        return reply.code(400).send({ error: 'month query parameter is required' });
      }
      const parsed = parseMonth(month);
      if (!parsed) {
        return reply.code(400).send({ error: 'Invalid month format. Use YYYY-MM' });
      }
      const summary = await getSummaryUC.execute(userId, parsed.year, parsed.month);
      return reply.send(summary);
    },
  );

  // PUT /transactions/:id
  app.put<{
    Params: { id: string };
    Body: UpdateTransactionDto;
  }>(
    '/transactions/:id',
    { preHandler: verifyJwt },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;
      try {
        const transaction = await updateUC.execute(userId, id, request.body);
        return reply.send(transaction);
      } catch (err: any) {
        if (err?.message === 'TRANSACTION_NOT_FOUND') {
          app.log.warn({ transactionId: id, userId }, 'Transaction not found');
          return reply.code(404).send({ error: 'Not found' });
        }
        if (err?.message === 'FORBIDDEN') {
          app.log.warn({ transactionId: id, userId }, 'Forbidden access to transaction');
          return reply.code(403).send({ error: 'Forbidden' });
        }
        throw err;
      }
    },
  );

  // DELETE /transactions/:id
  app.delete<{ Params: { id: string } }>(
    '/transactions/:id',
    { preHandler: verifyJwt },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;
      try {
        await deleteUC.execute(userId, id);
        return reply.code(204).send();
      } catch (err: any) {
        if (err?.message === 'TRANSACTION_NOT_FOUND') {
          app.log.warn({ transactionId: id, userId }, 'Transaction not found');
          return reply.code(404).send({ error: 'Not found' });
        }
        if (err?.message === 'FORBIDDEN') {
          app.log.warn({ transactionId: id, userId }, 'Forbidden access to transaction');
          return reply.code(403).send({ error: 'Forbidden' });
        }
        throw err;
      }
    },
  );

  // POST /transactions/import — multipart CSV upload
  app.post(
    '/transactions/import',
    { preHandler: verifyJwt },
    async (request, reply) => {
      const userId = request.user!.id;

      const parts = request.parts();
      let accountId: string | undefined;
      let csvText: string | undefined;

      for await (const part of parts) {
        if (part.type === 'field' && part.fieldname === 'accountId') {
          accountId = part.value as string;
        } else if (part.type === 'file' && part.fieldname === 'file') {
          const buf = await part.toBuffer();
          csvText = buf.toString('utf-8');
        }
      }

      if (!accountId) {
        return reply.code(400).send({ error: 'accountId is required' });
      }
      if (!csvText) {
        return reply.code(400).send({ error: 'file is required' });
      }

      const result = await importUC.execute(userId, accountId, csvText);

      app.log.info(
        { sessionId: result.sessionId, userId, newCount: result.new.length, duplicateCount: result.probableDuplicates.length, ignoredCount: result.ignored.length },
        'Import completed',
      );

      return reply.code(200).send(result);
    },
  );
}
