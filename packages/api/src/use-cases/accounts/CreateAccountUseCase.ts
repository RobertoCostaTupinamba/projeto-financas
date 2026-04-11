import { IAccountRepository, Account, AccountType } from '@financas/shared';

interface CreateAccountBody {
  name: string;
  type: AccountType;
  closingDay?: number;
  dueDay?: number;
}

export class CreateAccountUseCase {
  constructor(private readonly repo: IAccountRepository) {}

  async execute(userId: string, body: CreateAccountBody): Promise<Account> {
    return this.repo.create({ userId, ...body });
  }
}
