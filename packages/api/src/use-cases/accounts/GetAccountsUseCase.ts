import { IAccountRepository, Account } from '@financas/shared';

export class GetAccountsUseCase {
  constructor(private readonly repo: IAccountRepository) {}

  async execute(userId: string): Promise<Account[]> {
    return this.repo.findByUserId(userId);
  }
}
