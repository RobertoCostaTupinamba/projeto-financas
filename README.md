# Finanças Pessoais

Sistema de controle financeiro pessoal com múltiplas contas bancárias e cartões de crédito. Registre gastos manualmente, importe extratos (CSV/OFX) e veja quanto gastou por categoria no mês — sem duplicatas e com categorização que aprende com suas correções.

## Stack

| Camada | Tecnologia |
|---|---|
| Monorepo | Turborepo 2.9.6 + pnpm workspaces |
| API | Fastify 5 + Pino (logs JSON) |
| Web | Next.js 15.3.0 App Router |
| Banco de dados | MongoDB 8 via Mongoose 9.x |
| Cache / Sessão | Redis alpine |
| Auth | JWT (jose) + refresh tokens + HTTP-only cookies |
| Linguagem | TypeScript 5.x (strict, NodeNext) |
| Testes | Vitest (unit + integração contra MongoDB real) |

## Estrutura do monorepo

```
.
├── apps/
│   └── web/              # Next.js 15 — App Router
├── packages/
│   ├── api/              # Fastify 5 — REST API
│   └── shared/           # Tipos de domínio + interfaces de repositório
├── docker-compose.yml
├── turbo.json
└── package.json
```

## Arquitetura

Clean Architecture em camadas, com as interfaces de repositório isoladas em `@financas/shared`:

```
domain (interfaces) → @financas/shared
         ↓
use cases            → @financas/api (a implementar)
         ↓
infrastructure       → @financas/api/infrastructure/repositories
         ↓
MongoDB              → Mongoose 9.x models
```

**Regra principal:** nenhum tipo Mongoose (`Document`, `Model`) vaza fora da camada de infrastructure. Todos os métodos de repositório retornam interfaces de domínio puras.

## Pré-requisitos

- Node >= 20
- pnpm >= 10 (`npm i -g pnpm`)
- Docker (MongoDB + Redis via Docker Compose)

## Setup

```bash
# Instalar dependências
pnpm install

# Subir MongoDB e Redis
docker compose up -d

# Compilar todos os pacotes
pnpm build

# Rodar testes (integração requer MongoDB rodando)
pnpm test
```

## Desenvolvimento

```bash
# API + Web em modo watch (portas 3000 e 3001)
pnpm dev
```

A API roda em `http://localhost:3001`. O frontend em `http://localhost:3000`.

## Testes

```bash
# Todos os testes
pnpm test

# Apenas um pacote
pnpm --filter @financas/api test
```

Os testes de integração usam o banco `financas_test` (nunca `financas`) e gerenciam seu próprio ciclo de conexão — seguros para rodar em paralelo.

## Convenções

- **Amounts:** valores monetários são inteiros em centavos. `1000` = R$ 10,00.
- **Logs:** cada request emite dois logs JSON (`incoming request` / `request completed`) com `reqId` UUID, método, URL, status e tempo de resposta — prontos para ingestão no Grafana/Loki.
- **Extensões `.js`** em imports locais — obrigatório com `moduleResolution: NodeNext`.

## Roadmap (M001)

- [x] S01 — Scaffold monorepo + infra (Turborepo, Fastify, Next.js, Docker)
- [x] S02 — Camada de dados MongoDB + repositório (14 testes de integração passando)
- [ ] S03 — Autenticação completa (JWT + Redis + rate limiting)
- [ ] S04 — API de contas e categorias
- [ ] S05 — API de transações manuais
- [ ] S06 — Frontend (auth + dashboard + lançamentos)

## Variáveis de ambiente

Crie `.env` em `packages/api/` (nunca comite este arquivo):

```env
MONGODB_URI=mongodb://localhost:27017/financas
REDIS_URL=redis://localhost:6379
JWT_SECRET=<segredo-forte>
JWT_REFRESH_SECRET=<outro-segredo-forte>
PORT=3001
```
