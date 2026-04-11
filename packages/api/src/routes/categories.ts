import type { FastifyInstance } from 'fastify';
import type { ICategoryRepository } from '@financas/shared';
import { makeVerifyJwt } from '../middleware/authenticate.js';
import { CreateCategoryUseCase } from '../use-cases/categories/CreateCategoryUseCase.js';
import { GetCategoriesUseCase } from '../use-cases/categories/GetCategoriesUseCase.js';
import { UpdateCategoryUseCase } from '../use-cases/categories/UpdateCategoryUseCase.js';
import { DeleteCategoryUseCase } from '../use-cases/categories/DeleteCategoryUseCase.js';

interface CategoryRouteOptions {
  categoryRepo: ICategoryRepository;
}

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-prod';

export default async function categoryRoutes(
  app: FastifyInstance,
  opts: CategoryRouteOptions,
): Promise<void> {
  const { categoryRepo } = opts;

  const createUC = new CreateCategoryUseCase(categoryRepo);
  const getUC = new GetCategoriesUseCase(categoryRepo);
  const updateUC = new UpdateCategoryUseCase(categoryRepo);
  const deleteUC = new DeleteCategoryUseCase(categoryRepo);

  const verifyJwt = makeVerifyJwt(JWT_SECRET);

  // POST /categories
  app.post<{ Body: { name: string } }>(
    '/categories',
    { preHandler: verifyJwt },
    async (request, reply) => {
      const userId = request.user!.id;
      const { name } = request.body;
      try {
        const category = await createUC.execute(userId, name);
        return reply.code(201).send(category);
      } catch (err: any) {
        if (err?.message === 'DUPLICATE_CATEGORY_NAME') {
          return reply.code(409).send({ error: 'Category name already exists' });
        }
        throw err;
      }
    },
  );

  // GET /categories
  app.get(
    '/categories',
    { preHandler: verifyJwt },
    async (request, reply) => {
      const userId = request.user!.id;
      const categories = await getUC.execute(userId);
      return reply.send(categories);
    },
  );

  // PUT /categories/:id
  app.put<{ Params: { id: string }; Body: { name: string } }>(
    '/categories/:id',
    { preHandler: verifyJwt },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;
      const { name } = request.body;
      try {
        const category = await updateUC.execute(userId, id, name);
        return reply.send(category);
      } catch (err: any) {
        if (err?.message === 'CATEGORY_NOT_FOUND') {
          return reply.code(404).send({ error: 'Not found' });
        }
        if (err?.message === 'FORBIDDEN') {
          return reply.code(403).send({ error: 'Forbidden' });
        }
        throw err;
      }
    },
  );

  // DELETE /categories/:id
  app.delete<{ Params: { id: string } }>(
    '/categories/:id',
    { preHandler: verifyJwt },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;
      try {
        await deleteUC.execute(userId, id);
        return reply.code(204).send();
      } catch (err: any) {
        if (err?.message === 'CATEGORY_NOT_FOUND') {
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
