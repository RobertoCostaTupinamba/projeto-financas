import { Schema, model } from 'mongoose';

const transactionSchema = new Schema({
  userId: { type: String, required: true },
  accountId: { type: String, required: true },
  categoryId: { type: String },
  // Amount stored as integer centavos to avoid floating-point rounding errors
  amount: { type: Number, required: true },
  type: { type: String, enum: ['INCOME', 'EXPENSE'], required: true },
  status: { type: String, enum: ['confirmed', 'pending_review'], default: 'confirmed', required: true },
  date: { type: Date, required: true },
  description: { type: String },
  importSessionId: { type: String },
  importBucket: { type: String, enum: ['new', 'probable_duplicate'] },
  createdAt: { type: Date, default: Date.now },
});

export const TransactionModel = model('Transaction', transactionSchema);
