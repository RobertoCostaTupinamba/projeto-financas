import { IAccountRepository, Account } from '@financas/shared';

type UpdateAccountData = Partial<Pick<Account, 'name' | 'type' | 'closingDay' | 'dueDay'>>;

export class UpdateAccountUseCase {
  constructor(private readonly repo: IAccountRepository) {}

  async execute(userId: string, id: string, data: UpdateAccountData): Promise<Account> {
    const account = await this.repo.findById(id);
    if (!account) throw new Error('ACCOUNT_NOT_FOUND');
    if (account.userId !== userId) throw new Error('FORBIDDEN');
    const updated = await this.repo.update(id, data);
    return updated!;
  }
}
