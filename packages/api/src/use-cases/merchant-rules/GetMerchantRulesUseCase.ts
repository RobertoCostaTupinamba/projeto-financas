import { IMerchantRuleRepository, MerchantRule } from '@financas/shared';

export class GetMerchantRulesUseCase {
  constructor(private readonly repo: IMerchantRuleRepository) {}

  async execute(userId: string): Promise<MerchantRule[]> {
    return this.repo.findByUserId(userId);
  }
}
