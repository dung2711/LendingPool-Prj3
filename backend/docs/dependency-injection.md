# Hướng dẫn Dependency Injection (DI) theo kiểu Function trong dự án

Tài liệu này mô tả cách áp dụng **Dependency Injection (DI)** trong dự án theo hướng **không dùng class/container OOP**, mà dùng **function-based DI** (tạo dependency bằng hàm factory và truyền phụ thuộc tường minh).

---

## Mục tiêu & nguyên tắc

- **Tường minh**: Dependency được truyền qua tham số, tránh “import trực tiếp ở mọi nơi” gây hard-coupling.
- **Không dùng class**: Ưu tiên **function factories** và object literal.
- **Khởi tạo ở biên (composition root)**: Chỉ khởi tạo tài nguyên “nặng” (DB, logger, clients) ở entrypoint của app.
- **Dễ test**: Có thể thay thế dependency bằng fake/in-memory bằng cách truyền object cùng shape.
- **Rõ ràng luồng dữ liệu**: Tách bạch “tạo dependency” và “logic nghiệp vụ”.

---

## Composition root là gì?

**Composition root** là nơi bạn “lắp ráp” toàn bộ dependency cho một ứng dụng (app) rồi truyền chúng vào các hàm xử lý.

Trong dự án này, composition root thường nằm ở các file entrypoint như:

- `src/apps/http-server/index.ts`
- `src/apps/worker/index.ts`
- `src/apps/matching-engine/index.ts`
- `src/apps/price-worker/index.ts`

Ví dụ từ `src/apps/http-server/index.ts`:

- Load & validate env
- Configure logger
- Create postgres service
- Connect postgres
- Start server và dùng các dependency đó trong request handlers

---

## Mẫu DI chuẩn trong dự án (khuyến nghị)

### 1) Định nghĩa "Deps" (hợp đồng dependency)

Một module nghiệp vụ nên định nghĩa rõ nó cần gì. Có 2 cách:

**Cách 1: Định nghĩa type riêng (khuyến nghị cho service phức tạp)**

```ts
// Ví dụ từ order.service.ts
export function createOrdersService(deps: {
  prisma: PrismaClient;
  logger: Logger;
  channel: ChannelWrapper;
  orderQueueName: string;
  priceService: PriceService;
}) {
  // ...
}
```

**Cách 2: Inline type (cho service đơn giản)**

```ts
// Ví dụ từ health.service.ts
export function createHealthService(deps: { logger: Logger }) {
  // ...
}
```

**Gợi ý:**

- **Chỉ khai báo những thứ module thực sự cần** (interface tối thiểu).
- **Không truyền "env" tràn lan** nếu không cần; prefer truyền những cấu hình đã "bẻ nhỏ" thành các giá trị cần dùng.
- **Sử dụng `Pick<>` hoặc `Partial<>`** khi chỉ cần một phần của type lớn:

```ts
env: Pick<
  HttpServerEnv,
  | 'JWT_REFRESH_TOKEN_TTL_SECONDS'
  | 'PASSWORD_PEPPER'
  | 'GOOGLE_CLIENT_ID'
  | 'APPLE_CLIENT_ID'
>;
```

### 2) Tạo factory `createXxx(...)` nhận `deps` và trả ra API (object các hàm)

**Ví dụ đơn giản:**

```ts
export function createHealthService(deps: { logger: Logger }) {
  function getHealth(): IHealthRes {
    deps.logger.info('Health checked');
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  return { getHealth };
}
```

**Ví dụ phức tạp với nhiều hàm:**

```ts
export function createOrdersService(deps: {
  prisma: PrismaClient;
  logger: Logger;
  channel: ChannelWrapper;
  orderQueueName: string;
  priceService: PriceService;
}) {
  const { prisma, logger, channel, orderQueueName, priceService } = deps;

  async function createOrder(input: ICreateOrderReq, currentUser: IReqUser) {
    // Logic tạo order...
    logger.info('Order created', { orderId });
  }

  async function listOrders(query: IListOrdersQuery, currentUser: IReqUser) {
    // Logic list orders...
  }

  async function closeOrder(orderId: bigint, input: ICloseOrderReq, currentUser: IReqUser) {
    // Logic close order...
  }

  return {
    createOrder,
    listOrders,
    closeOrder,
  };
}

// Export type để dùng ở controller
export type OrdersService = ReturnType<typeof createOrdersService>;
```

### 3) Lắp ráp ở composition root và truyền xuống

**Ví dụ từ `src/apps/http-server/index.ts`:**

```ts
// 1. Khởi tạo infrastructure dependencies
const env = validateHttpServerEnv();
await configureLogger(env, 'http-server');
const logger = getAppLogger('http-server');
const dbService = createPostgresService({ env, logger });
await dbService.connect();
const redisService = createRedisService({ env, logger });
await redisService.connect();

// 2. Lấy clients từ services
const prisma = dbService.getClient();
const redis = redisService.getClient();

// 3. Tạo các services phụ thuộc vào infrastructure
const priceService = createPriceService({ redis, logger });

// 4. Tạo các business services
const ordersService = createOrdersService({
  prisma,
  logger,
  channel: rabbitChannel,
  orderQueueName: env.ORDER_QUEUE_NAME,
  priceService, // Service dependency
});

// 5. Tạo controllers với services
const ordersController = createOrdersController({
  ordersService,
  positionService,
  authMiddleware,
});
```

### 4) Controller/Route chỉ gọi service

**Ví dụ từ `order.controller.ts`:**

```ts
export function createOrdersController({
  ordersService,
  positionService,
  authMiddleware,
}: {
  ordersService: OrdersService;
  positionService: PositionService;
  authMiddleware: AuthMiddleware;
}) {
  return new Elysia({ prefix: '/orders' })
    .use(authMiddleware)
    .get(
      '/',
      async ({ query, currentUser }) =>
        await ordersService.listOrders(query, currentUser),
      {
        query: ZListOrdersQuery,
        response: ZListOrdersRes,
      },
    )
    .post(
      '/',
      async ({ body, currentUser }) =>
        await ordersService.createOrder(body, currentUser),
      {
        body: ZCreateOrderReq,
        response: ZCreateOrderRes,
      },
    );
}
```

**Đặc điểm:**

- Controller chỉ làm nhiệm vụ routing và validation
- Logic nghiệp vụ nằm trong service
- Controller nhận services đã được tạo sẵn từ composition root

---

## DI theo “function injection” (cấp hàm) vs “service injection” (cấp module)

Có 2 cách phổ biến, tùy độ lớn module:

### A) Service injection (khuyến nghị cho phần lớn case)

- Tạo một service (object) bằng `createXxxService(deps)`
- Handler dùng service đó

Ưu điểm:

- Ít phải truyền deps lặp lại
- Hợp lý khi module có nhiều hàm liên quan

### B) Function injection (khi hàm đơn lẻ, hoặc muốn cực tường minh)

```ts
type Deps = { logger: Logger; postgres: Postgres };

export async function placeOrder(deps: Deps, input: Input) {
  deps.logger.info('...');
}
```

Ưu điểm:

- Tường minh tuyệt đối
- Rất dễ test từng hàm

Nhược điểm:

- Nhiều tham số nếu chain nhiều hàm

---

## Quy ước đặt tên & tổ chức thư mục

- **Factory tạo dependency/tài nguyên**: `createXxx...` (ví dụ `createPostgresService`)
- **Khởi tạo/config toàn cục**: `configureXxx...` (ví dụ `configureLogger`)
- **Getter logger theo ngữ cảnh**: `getAppLogger(scope)`
- **Deps type**: `XxxDeps`, `XxxServiceDeps`

Khuyến nghị structure trong module:

```
src/modules/<domain>/
  service.ts        // createDomainService(deps)
  handlers.ts       // createHandlers(deps) hoặc functions nhận deps
  types.ts          // types/interfaces của module
```

---

## Ví dụ cụ thể theo từng tầng

Dưới đây là các ví dụ thực tế từ codebase, minh họa cách áp dụng DI ở các tầng khác nhau.

---

### 1. Tầng App/Entrypoint (Composition Root)

**File:** `src/apps/http-server/index.ts`

Đây là nơi khởi tạo tất cả dependencies và lắp ráp chúng lại với nhau:

```28:109:src/apps/http-server/index.ts
const env = validateHttpServerEnv();
await configureLogger(env, 'http-server');
const logger = getAppLogger('http-server');
const dbService = createPostgresService({ env, logger });
await dbService.connect();
const redisService = createRedisService({ env, logger });
await redisService.connect();
const rabbitMq = createRabbitMQService({ env, logger });
await rabbitMq.connect();

const idUtil = new IdUtil();
const prisma = dbService.getClient();
const redis = redisService.getClient();
const rabbitChannel = rabbitMq.getChannel();
const priceService = createPriceService({ redis, logger });

const tokenService = createTokenService({ env });
const currentUserCache = createCache<IReqUser>({
  redis,
  namespace: CacheNs.USER,
  ttl: CacheTtl.FIVE_MINUTES,
});
const revokedSessionCache = createCache<string>({
  redis,
  namespace: CacheNs.REVOKED_SESSION,
  ttl: env.JWT_ACCESS_TOKEN_TTL_SECONDS,
});

const authMiddleware = createAuthMiddleware({
  prisma,
  tokenService,
  currentUserCache,
  revokedSessionCache,
});

const assetService = createAssetService({ logger, prisma, idUtil });
const assetCategoryService = createAssetCategoryService({
  logger,
  prisma,
  idUtil,
});

const authService = createAuthService({
  prisma,
  logger,
  idUtil,
  tokenService,
  referralService: createReferralService({ prisma, idUtil }),
  currentUserCache,
  revokedSessionCache,
  env,
  passwordHasher: Bun.password,
  ggClient: env.GOOGLE_CLIENT_ID
    ? new OAuth2Client(env.GOOGLE_CLIENT_ID)
    : null,
});
const userService = createUserService({ prisma });
const ordersService = createOrdersService({
  prisma,
  logger,
  channel: rabbitChannel,
  orderQueueName: env.ORDER_QUEUE_NAME,
  priceService,
});
const positionService = createPositionService({ prisma });
const paymentService = createPaymentService({ prisma, logger });
```

**Đặc điểm:**

- Tất cả dependencies được khởi tạo ở đây (DB, Redis, RabbitMQ, Logger, ...)
- Các service được tạo từ dependencies đã khởi tạo
- Services có thể phụ thuộc vào services khác (ví dụ: `ordersService` phụ thuộc vào `priceService`)

---

### 2. Tầng Service

#### 2.1. Service đơn giản (chỉ cần logger)

**File:** `src/modules/health/health.service.ts`

```4:18:src/modules/health/health.service.ts
export function createHealthService(deps: { logger: Logger }) {
  function getHealth(): IHealthRes {
    const health: IHealthRes = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeMs: Math.round(process.uptime() * 1000),
    };

    deps.logger.info('Health checked', health);

    return health;
  }

  return { getHealth };
}
```

#### 2.2. Service phức tạp (nhiều dependencies)

**File:** `src/modules/orders/order.service.ts`

```28:34:src/modules/orders/order.service.ts
export function createOrdersService(deps: {
  prisma: PrismaClient;
  logger: Logger;
  channel: ChannelWrapper;
  orderQueueName: string;
  priceService: PriceService;
}) {
  const { prisma, logger, channel, orderQueueName, priceService } = deps;
```

Service này:

- Nhận nhiều dependencies: `prisma`, `logger`, `channel`, `orderQueueName`, `priceService`
- Sử dụng `priceService` (một service khác) để lấy giá thị trường
- Export type để controller có thể type-check:

```363:363:src/modules/orders/order.service.ts
export type OrdersService = ReturnType<typeof createOrdersService>;
```

#### 2.3. Service với nested dependencies

**File:** `src/modules/auth/auth.service.ts`

```36:64:src/modules/auth/auth.service.ts
export function createAuthService({
  prisma,
  logger,
  idUtil,
  tokenService,
  referralService,
  currentUserCache,
  revokedSessionCache,
  env,
  passwordHasher,
  ggClient,
}: {
  prisma: PrismaClient;
  logger: Logger;
  idUtil: IdUtil;
  tokenService: TokenService;
  referralService: ReferralService;
  currentUserCache: RedisCache<IReqUser>;
  revokedSessionCache: RedisCache<string>;
  env: Pick<
    HttpServerEnv,
    | 'JWT_REFRESH_TOKEN_TTL_SECONDS'
    | 'PASSWORD_PEPPER'
    | 'GOOGLE_CLIENT_ID'
    | 'APPLE_CLIENT_ID'
  >;
  passwordHasher: typeof Bun.password;
  ggClient: OAuth2Client | null;
}) {
```

**Đặc điểm:**

- Nhận nhiều dependencies bao gồm cả services khác (`tokenService`, `referralService`)
- Nhận một phần của `env` thay vì toàn bộ (minimal interface)
- Nhận các utilities như `passwordHasher` (Bun.password) để dễ test

---

### 3. Tầng Controller

#### 3.1. Controller đơn giản

**File:** `src/modules/health/health.controller.ts`

```6:22:src/modules/health/health.controller.ts
export function createHealthController(deps: { logger: Logger }) {
  const healthService = createHealthService(deps);

  return new Elysia({ prefix: '/health' }).get(
    '/',
    () => healthService.getHealth(),
    {
      response: {
        200: ZHealthRes,
      },
      detail: {
        description: 'Get the health of the application',
        tags: ['Health'],
      },
    },
  );
}
```

**Đặc điểm:**

- Controller nhận dependencies và tạo service bên trong
- Controller chỉ làm nhiệm vụ routing, không chứa logic nghiệp vụ

#### 3.2. Controller với nhiều services và middleware

**File:** `src/modules/orders/order.controller.ts`

```18:26:src/modules/orders/order.controller.ts
export function createOrdersController({
  ordersService,
  positionService,
  authMiddleware,
}: {
  ordersService: OrdersService;
  positionService: PositionService;
  authMiddleware: AuthMiddleware;
}) {
```

Controller này:

- Nhận các services đã được tạo sẵn từ composition root
- Nhận middleware để bảo vệ routes
- Sử dụng services trong route handlers:

```36:39:src/modules/orders/order.controller.ts
    .get(
      '/positions',
      async ({ query, currentUser }) =>
        await positionService.listPositions(query, currentUser),
```

#### 3.3. Controller với xử lý request context

**File:** `src/modules/auth/auth.controller.ts`

```30:36:src/modules/auth/auth.controller.ts
export function createAuthController({
  authService,
  authMiddleware,
}: {
  authService: AuthService;
  authMiddleware: AuthMiddleware;
}) {
```

Controller này extract thông tin từ request headers và truyền vào service:

```53:58:src/modules/auth/auth.controller.ts
      '/login-with-social',
      async ({ body, headers }) => {
        const clientIp = getClientIp(headers);
        const userAgent = getUserAgent(headers);
        return await authService.loginWithSocial(body, clientIp, userAgent);
      },
```

---

### 4. Tầng Middleware

**File:** `src/modules/auth/auth.middleware.ts`

```9:19:src/modules/auth/auth.middleware.ts
export function createAuthMiddleware({
  prisma,
  tokenService,
  currentUserCache,
  revokedSessionCache,
}: {
  prisma: PrismaClient;
  tokenService: TokenService;
  currentUserCache: RedisCache<IReqUser>;
  revokedSessionCache: RedisCache<string>;
}) {
```

**Đặc điểm:**

- Middleware là một factory function trả về Elysia plugin
- Nhận các dependencies cần thiết để xác thực user
- Sử dụng cache để tối ưu performance:

```43:48:src/modules/auth/auth.middleware.ts
        let currentUser: IReqUser;
        const cachedUser = await currentUserCache.get(data.sessionId);

        if (cachedUser) {
          currentUser = cachedUser;
        } else {
```

---

### 5. Tầng Utils/Shared Services

**File:** `src/shared/utils/redis-lua-script.service.ts`

```4:11:src/shared/utils/redis-lua-script.service.ts
export function createRedisLuaScriptService(deps: {
  redis: RedisClient;
  logger: Logger;
  namespace?: string;
}) {
  const { redis, logger } = deps;
  const namespace = deps.namespace ?? 'lua';
```

**Đặc điểm:**

- Utility service có thể được sử dụng ở nhiều nơi
- Có thể có optional parameters với default values
- Export type để dễ dàng type-check:

```93:95:src/shared/utils/redis-lua-script.service.ts
export type RedisLuaScriptService = ReturnType<
  typeof createRedisLuaScriptService
>;
```

---

### 6. Service Dependencies (Service sử dụng Service khác)

#### 6.1. Service phụ thuộc vào service khác

**File:** `src/modules/matching/services/price.service.ts`

```6:11:src/modules/matching/services/price.service.ts
export function createPriceService(deps: {
  redis: RedisClient;
  logger: Logger;
}) {
  const { redis, logger } = deps;
```

Service này được sử dụng bởi `ordersService`:

```58:58:src/apps/http-server/index.ts
const priceService = createPriceService({ redis, logger });
```

```101:107:src/apps/http-server/index.ts
const ordersService = createOrdersService({
  prisma,
  logger,
  channel: rabbitChannel,
  orderQueueName: env.ORDER_QUEUE_NAME,
  priceService,
});
```

**Luồng dependency:**

1. `priceService` được tạo từ `redis` và `logger`
2. `ordersService` được tạo và nhận `priceService` như một dependency
3. `ordersService` sử dụng `priceService` để lấy giá thị trường:

```145:148:src/modules/orders/order.service.ts
      const marketPrice =
        input.side === OrderSide.BUY
          ? await priceService.getAskPrice(input.symbol)
          : await priceService.getBidPrice(input.symbol);
```

#### 6.2. Service với nested service creation

Trong `authService`, `referralService` được tạo inline:

```91:91:src/apps/http-server/index.ts
  referralService: createReferralService({ prisma, idUtil }),
```

Điều này cho phép:

- Tạo service chỉ khi cần thiết
- Giữ composition root gọn gàng
- Dễ dàng thay thế bằng mock trong test

---

### 7. Ví dụ end-to-end hoàn chỉnh

Luồng từ App → Controller → Service → Utils:

```
src/apps/http-server/index.ts (Composition Root)
  ↓
  Tạo: logger, prisma, redis, rabbitMQ
  ↓
  Tạo: priceService(redis, logger)
  ↓
  Tạo: ordersService(prisma, logger, channel, priceService)
  ↓
  Tạo: createOrdersController({ ordersService, positionService, authMiddleware })
  ↓
  Đăng ký vào Elysia app
```

**Request flow:**

1. Request đến `/orders/` → `ordersController`
2. Controller gọi `ordersService.listOrders()`
3. Service sử dụng `prisma` để query DB
4. Service có thể sử dụng `priceService` nếu cần giá thị trường
5. Service log bằng `logger`
6. Response trả về cho client

---

## Anti-patterns (tránh)

- **Import singleton trực tiếp trong module nghiệp vụ** (ví dụ import `postgres` global):
  - Gây khó test, khó thay thế dependency, tạo coupling ngầm.
- **Khởi tạo DB/clients trong handler**:
  - Tạo overhead và khó quản lý lifecycle.
- **Truyền “toàn bộ env” xuống mọi nơi**:
  - Khiến module phụ thuộc vào cấu hình dư thừa và dễ dùng sai.
- **Giấu dependency trong closure quá sâu** mà không có type `Deps` rõ ràng:
  - Khó đọc, khó maintain.

---

## Lifecycle & shutdown (khuyến nghị)

Vì dự án chạy nhiều app/worker, dependency như Postgres cần lifecycle rõ:

- **connect** ở composition root trước khi bắt đầu xử lý.
- **close/disconnect** khi process shutdown (SIGINT/SIGTERM) nếu service hỗ trợ.

Nếu `createPostgresService` có `disconnect()` hoặc tương tự, hãy đăng ký handler:

```ts
process.on('SIGINT', async () => {
  await postgres.disconnect?.();
  process.exit(0);
});
```

---

## Testing với DI

Một trong những lợi ích lớn nhất của DI là dễ dàng test. Với function-based DI, bạn có thể dễ dàng tạo mock dependencies:

### Ví dụ test service

```ts
// test/unit/modules/orders/order.service.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { createOrdersService } from 'src/modules/orders/order.service';
import type { PrismaClient } from 'src/generated';

describe('OrdersService', () => {
  it('should create order successfully', async () => {
    // Tạo mock dependencies
    const mockPrisma = {
      userAccount: {
        findFirst: async () => ({
          id: BigInt(1),
          availableBalance: new Decimal(1000),
        }),
      },
      asset: {
        findUnique: async () => ({
          symbol: 'BTC/USD',
          isActive: true,
          minTradeSize: new Decimal(0.001),
          maxTradeSize: new Decimal(100),
          maxLeverage: 10,
          marginMultiplier: new Decimal(1),
          contractSize: new Decimal(1),
        }),
      },
      order: {
        create: async (data: any) => ({ id: BigInt(123), ...data.data }),
      },
      $transaction: async (fn: any) => await fn(mockPrisma),
    } as unknown as PrismaClient;

    const mockLogger = {
      info: () => {},
      error: () => {},
    };

    const mockChannel = {
      sendToQueue: async () => {},
    };

    const mockPriceService = {
      getAskPrice: async () => '50000',
      getBidPrice: async () => '49900',
    };

    // Tạo service với mock dependencies
    const ordersService = createOrdersService({
      prisma: mockPrisma,
      logger: mockLogger as Logger,
      channel: mockChannel as ChannelWrapper,
      orderQueueName: 'test-queue',
      priceService: mockPriceService as PriceService,
    });

    // Test
    const result = await ordersService.createOrder(
      {
        accountId: BigInt(1),
        symbol: 'BTC/USD',
        side: 'BUY',
        type: 'MARKET',
        quantity: '0.01',
        leverage: 5,
      },
      { id: 'user-1', userAccount: [{ id: BigInt(1) }] } as IReqUser,
    );

    expect(result.orderId).toBe('123');
  });
});
```

### Ví dụ test controller

```ts
// test/unit/modules/orders/order.controller.test.ts
import { describe, it, expect } from 'bun:test';
import { createOrdersController } from 'src/modules/orders/order.controller';

describe('OrdersController', () => {
  it('should handle list orders request', async () => {
    const mockOrdersService = {
      listOrders: async () => ({
        data: [],
        total: 0,
      }),
    };

    const mockPositionService = {
      listPositions: async () => ({ data: [], total: 0 }),
    };

    const mockAuthMiddleware = () => (app: any) => app;

    const controller = createOrdersController({
      ordersService: mockOrdersService as OrdersService,
      positionService: mockPositionService as PositionService,
      authMiddleware: mockAuthMiddleware as AuthMiddleware,
    });

    // Test controller routes...
  });
});
```

**Lợi ích:**

- Dễ dàng mock dependencies
- Test không phụ thuộc vào database thật, Redis thật, etc.
- Test chạy nhanh vì không cần setup infrastructure
- Có thể test từng layer độc lập

---

## Best Practices

### 1. Dependency Order

Khi tạo dependencies, tuân thủ thứ tự:

1. **Infrastructure** (DB, Redis, RabbitMQ, Logger)
2. **Shared Services** (Cache, Utils)
3. **Domain Services** (Business logic services)
4. **Controllers** (HTTP handlers)
5. **Middleware** (Auth, validation)

### 2. Type Safety

Luôn export type của service để dùng ở controller:

```ts
export type OrdersService = ReturnType<typeof createOrdersService>;
```

Sử dụng type này trong controller:

```ts
export function createOrdersController({
  ordersService,
}: {
  ordersService: OrdersService; // Type-safe!
}) {
  // ...
}
```

### 3. Minimal Dependencies

Chỉ truyền những gì thực sự cần:

```ts
// ❌ Bad: Truyền toàn bộ env
export function createAuthService({ env }: { env: HttpServerEnv }) {
  // Chỉ dùng env.JWT_REFRESH_TOKEN_TTL_SECONDS
}

// ✅ Good: Chỉ truyền những gì cần
export function createAuthService({
  refreshTokenTtl,
}: {
  refreshTokenTtl: number;
}) {
  // Rõ ràng hơn, dễ test hơn
}
```

Hoặc sử dụng `Pick<>`:

```ts
env: Pick<HttpServerEnv, 'JWT_REFRESH_TOKEN_TTL_SECONDS' | 'PASSWORD_PEPPER'>;
```

### 4. Service Composition

Services có thể phụ thuộc vào services khác, nhưng tránh circular dependencies:

```ts
// ✅ Good: A → B → C (linear)
const priceService = createPriceService({ redis, logger });
const ordersService = createOrdersService({ ..., priceService });

// ❌ Bad: A → B → A (circular)
const serviceA = createServiceA({ serviceB });
const serviceB = createServiceB({ serviceA }); // Circular!
```

### 5. Lifecycle Management

Luôn quản lý lifecycle của dependencies:

```ts
// Connect trước khi sử dụng
const dbService = createPostgresService({ env, logger });
await dbService.connect();

// Disconnect khi shutdown
process.on('SIGINT', async () => {
  await dbService.disconnect?.();
  process.exit(0);
});
```

---

## Checklist áp dụng DI cho module mới

- [ ] Module định nghĩa dependencies tối thiểu (inline hoặc type riêng)
- [ ] Có `createXxxService(deps)` hoặc hàm nhận `(deps, input)`
- [ ] Export type của service: `export type XxxService = ReturnType<typeof createXxxService>`
- [ ] Composition root lắp ráp dependency và truyền xuống
- [ ] Không import singleton/hạ tầng trực tiếp trong module nghiệp vụ
- [ ] Controller chỉ nhận services, không tạo services bên trong (trừ trường hợp đặc biệt như health)
- [ ] Dependencies được khởi tạo theo đúng thứ tự (infrastructure → services → controllers)
- [ ] Có thể dễ dàng mock dependencies để test
