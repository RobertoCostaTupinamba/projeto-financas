import { IMerchantRuleRepository, MerchantRule, MatchType } from '@financas/shared';
import { normalizeMerchant } from '../../lib/merchant/MerchantMatcher.js';

export class SaveMerchantRuleUseCase {
  constructor(private readonly repo: IMerchantRuleRepository) {}

  async execute(userId: string, merchantPattern: string, categoryId: string, matchType: MatchType): Promise<MerchantRule> {
    const normalizedPattern = normalizeMerchant(merchantPattern);
    return this.repo.create({ userId, pattern: normalizedPattern, categoryId, matchType });
  }
}
