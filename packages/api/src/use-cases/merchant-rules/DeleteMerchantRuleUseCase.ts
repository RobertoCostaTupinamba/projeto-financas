import { IMerchantRuleRepository } from '@financas/shared';

export class DeleteMerchantRuleUseCase {
  constructor(private readonly repo: IMerchantRuleRepository) {}

  async execute(userId: string, id: string): Promise<void> {
    const rule = await this.repo.findById(id);
    if (!rule) throw new Error('RULE_NOT_FOUND');
    if (rule.userId !== userId) throw new Error('FORBIDDEN');
    await this.repo.delete(id);
  }
}
