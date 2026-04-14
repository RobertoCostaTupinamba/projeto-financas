import { describe, it, expect, vi } from 'vitest';
import type { IMerchantRuleRepository, MerchantRule } from '@financas/shared';
import {
  normalizeMerchant,
  matchMerchant,
  levenshtein,
  PARTIAL_MATCH_THRESHOLD,
} from '../../../lib/merchant/MerchantMatcher.js';
import { SaveMerchantRuleUseCase } from '../../../use-cases/merchant-rules/SaveMerchantRuleUseCase.js';
import { GetMerchantRulesUseCase } from '../../../use-cases/merchant-rules/GetMerchantRulesUseCase.js';
import { DeleteMerchantRuleUseCase } from '../../../use-cases/merchant-rules/DeleteMerchantRuleUseCase.js';

function makeRule(overrides: Partial<MerchantRule> = {}): MerchantRule {
  return {
    id: 'rule1',
    userId: 'user1',
    pattern: 'uber eats',
    categoryId: 'cat1',
    matchType: 'exact',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeRepo(overrides: Partial<IMerchantRuleRepository> = {}): IMerchantRuleRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByUserId: vi.fn(),
    findByUserIdAndPattern: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

// ── normalizeMerchant ────────────────────────────────────────────────────────

describe('normalizeMerchant', () => {
  it('lowercases the input', () => {
    expect(normalizeMerchant('UBER EATS')).toBe('uber eats');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeMerchant('  uber eats  ')).toBe('uber eats');
  });

  it('collapses multiple internal spaces to one', () => {
    expect(normalizeMerchant('uber   eats')).toBe('uber eats');
  });

  it('handles all transformations together', () => {
    expect(normalizeMerchant('  UBER   EATS  ')).toBe('uber eats');
  });
});

// ── levenshtein ──────────────────────────────────────────────────────────────

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('returns string length when comparing against empty string', () => {
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('computes correct distance for simple substitution', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
});

// ── matchMerchant ────────────────────────────────────────────────────────────

describe('matchMerchant', () => {
  it('returns null when rules array is empty', () => {
    expect(matchMerchant('uber eats', [])).toBeNull();
  });

  it('returns exact match when normalized names are identical', () => {
    const rule = makeRule({ pattern: 'uber eats', matchType: 'exact' });
    const result = matchMerchant('uber eats', [rule]);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe('exact');
    expect(result!.rule).toBe(rule);
  });

  it('returns exact match case-insensitively', () => {
    const rule = makeRule({ pattern: 'uber eats' });
    const result = matchMerchant('UBER EATS', [rule]);
    expect(result?.matchType).toBe('exact');
  });

  it('returns partial match for "uber *eats br" against pattern "uber eats"', () => {
    // normalized: 'uber *eats br' (13 chars) vs 'uber eats' (9 chars)
    // levenshtein distance should be <= PARTIAL_MATCH_THRESHOLD * 13
    const rule = makeRule({ pattern: 'uber eats' });
    const result = matchMerchant('uber *eats br', [rule]);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe('partial');
    expect(result!.rule).toBe(rule);
  });

  it('does NOT match "ifood entrega" against pattern "uber eats"', () => {
    const rule = makeRule({ pattern: 'uber eats' });
    const result = matchMerchant('ifood entrega', [rule]);
    expect(result).toBeNull();
  });

  it('prefers exact match over partial when both rules are present', () => {
    const exactRule = makeRule({ id: 'rule-exact', pattern: 'ifood' });
    const partialRule = makeRule({ id: 'rule-partial', pattern: 'ifood pedido' });
    const result = matchMerchant('ifood', [exactRule, partialRule]);
    expect(result?.matchType).toBe('exact');
    expect(result?.rule.id).toBe('rule-exact');
  });

  it('PARTIAL_MATCH_THRESHOLD is 0.35', () => {
    expect(PARTIAL_MATCH_THRESHOLD).toBe(0.35);
  });
});

// ── SaveMerchantRuleUseCase ──────────────────────────────────────────────────

describe('SaveMerchantRuleUseCase', () => {
  it('normalizes pattern and calls repo.create', async () => {
    const rule = makeRule({ pattern: 'uber eats' });
    const repo = makeRepo({ create: vi.fn().mockResolvedValue(rule) });
    const uc = new SaveMerchantRuleUseCase(repo);

    const result = await uc.execute('user1', ' UBER EATS ', 'cat1', 'exact');

    expect(repo.create).toHaveBeenCalledWith({
      userId: 'user1',
      pattern: 'uber eats',
      categoryId: 'cat1',
      matchType: 'exact',
    });
    expect(result).toEqual(rule);
  });
});

// ── GetMerchantRulesUseCase ──────────────────────────────────────────────────

describe('GetMerchantRulesUseCase', () => {
  it('returns rules for userId', async () => {
    const rules = [makeRule(), makeRule({ id: 'rule2', pattern: 'ifood' })];
    const repo = makeRepo({ findByUserId: vi.fn().mockResolvedValue(rules) });
    const uc = new GetMerchantRulesUseCase(repo);

    const result = await uc.execute('user1');

    expect(result).toEqual(rules);
    expect(repo.findByUserId).toHaveBeenCalledWith('user1');
  });
});

// ── DeleteMerchantRuleUseCase ────────────────────────────────────────────────

describe('DeleteMerchantRuleUseCase', () => {
  it('calls repo.delete when rule belongs to userId', async () => {
    const rule = makeRule();
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(rule),
      delete: vi.fn().mockResolvedValue(undefined),
    });
    const uc = new DeleteMerchantRuleUseCase(repo);

    await uc.execute('user1', 'rule1');

    expect(repo.delete).toHaveBeenCalledWith('rule1');
  });

  it('throws RULE_NOT_FOUND when findById returns null', async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(null) });
    const uc = new DeleteMerchantRuleUseCase(repo);

    await expect(uc.execute('user1', 'nonexistent')).rejects.toThrow('RULE_NOT_FOUND');
  });

  it('throws FORBIDDEN when userId does not match rule owner', async () => {
    const rule = makeRule({ userId: 'owner' });
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(rule) });
    const uc = new DeleteMerchantRuleUseCase(repo);

    await expect(uc.execute('attacker', 'rule1')).rejects.toThrow('FORBIDDEN');
  });
});
