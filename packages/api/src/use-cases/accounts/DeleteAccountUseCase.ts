import { IAccountRepository } from '@financas/shared';

export class DeleteAccountUseCase {
  constructor(private readonly repo: IAccountRepository) {}

  async execute(userId: string, id: string): Promise<void> {
    const account = await this.repo.findById(id);
    if (!account) throw new Error('ACCOUNT_NOT_FOUND');
    if (account.userId !== userId) throw new Error('FORBIDDEN');
    await this.repo.delete(id);
  }
}
