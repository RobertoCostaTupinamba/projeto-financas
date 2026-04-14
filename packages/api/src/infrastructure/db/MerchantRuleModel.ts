import { Schema, model } from 'mongoose';

const merchantRuleSchema = new Schema({
  userId: { type: String, required: true },
  pattern: { type: String, required: true },
  categoryId: { type: String, required: true },
  matchType: { type: String, enum: ['exact', 'partial'], required: true },
  createdAt: { type: Date, default: Date.now },
});

export const MerchantRuleModel = model('MerchantRule', merchantRuleSchema);
