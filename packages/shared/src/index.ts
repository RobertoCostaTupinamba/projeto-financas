// ---- User ----
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}
export interface CreateUserDto {
  email: string;
  passwordHash: string;
}

// ---- Account ----
export type AccountType = 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD';
export interface Account {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  closingDay?: number;  // credit card only
  dueDay?: number;      // credit card only
  createdAt: Date;
}
export interface CreateAccountDto {
  userId: string;
  name: string;
  type: AccountType;
  closingDay?: number;
  dueDay?: number;
}

// ---- Transaction ----
export type TransactionType = 'INCOME' | 'EXPENSE';
export type TransactionStatus = 'confirmed' | 'pending_review';
export interface Transaction {
  id: string;
  userId: string;
  accountId: string;
  categoryId?: string;
  amount: number; // stored in centavos (integer) — e.g. 1000 = R$10.00
  type: TransactionType;
  status: TransactionStatus;
  date: Date;
  description?: string;
  importSessionId?: string;
  createdAt: Date;
}
export interface CreateTransactionDto {
  userId: string;
  accountId: string;
  categoryId?: string;
  amount: number;
  type: TransactionType;
  date: Date;
  description?: string;
  status?: TransactionStatus;
  importSessionId?: string;
}
export interface UpdateTransactionDto {
  amount?: number;
  type?: TransactionType;
  categoryId?: string;
  accountId?: string;
  date?: Date;
  description?: string;
}

// ---- Repository Interfaces ----
export interface IUserRepository {
  create(data: CreateUserDto): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
}
export interface IAccountRepository {
  create(data: CreateAccountDto): Promise<Account>;
  findById(id: string): Promise<Account | null>;
  findByUserId(userId: string): Promise<Account[]>;
  update(id: string, data: Partial<Pick<Account, 'name' | 'type' | 'closingDay' | 'dueDay'>>): Promise<Account | null>;
  delete(id: string): Promise<void>;
}

// ---- Category ----
export interface Category {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
}
export interface CreateCategoryDto {
  userId: string;
  name: string;
}
export interface UpdateCategoryDto {
  name: string;
}
export interface ICategoryRepository {
  create(data: CreateCategoryDto): Promise<Category>;
  findById(id: string): Promise<Category | null>;
  findByUserId(userId: string): Promise<Category[]>;
  update(id: string, data: UpdateCategoryDto): Promise<Category | null>;
  delete(id: string): Promise<void>;
}
export interface ITransactionRepository {
  create(data: CreateTransactionDto): Promise<Transaction>;
  findById(id: string): Promise<Transaction | null>;
  findByUserId(userId: string): Promise<Transaction[]>;
  findByAccountId(accountId: string): Promise<Transaction[]>;
  findByUserIdAndDateRange(userId: string, start: Date, end: Date): Promise<Transaction[]>;
  findPotentialDuplicates(userId: string, accountId: string, amount: number, dateFrom: Date, dateTo: Date): Promise<Transaction[]>;
  update(id: string, data: UpdateTransactionDto): Promise<Transaction | null>;
  delete(id: string): Promise<void>;
}
