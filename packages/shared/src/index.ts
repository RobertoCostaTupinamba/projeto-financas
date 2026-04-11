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
export interface Transaction {
  id: string;
  userId: string;
  accountId: string;
  categoryId?: string;
  amount: number; // stored in centavos (integer) — e.g. 1000 = R$10.00
  type: TransactionType;
  date: Date;
  description?: string;
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
  delete(id: string): Promise<void>;
}
export interface ITransactionRepository {
  create(data: CreateTransactionDto): Promise<Transaction>;
  findById(id: string): Promise<Transaction | null>;
  findByUserId(userId: string): Promise<Transaction[]>;
  findByAccountId(accountId: string): Promise<Transaction[]>;
  delete(id: string): Promise<void>;
}
