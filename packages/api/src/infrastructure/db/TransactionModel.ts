import { Schema, model } from 'mongoose';

const transactionSchema = new Schema({
  userId: { type: String, required: true },
  accountId: { type: String, required: true },
  categoryId: { type: String },
  // Amount stored as integer centavos to avoid floating-point rounding errors
  amount: { type: Number, required: true },
  type: { type: String, enum: ['INCOME', 'EXPENSE'], required: true },
  date: { type: Date, required: true },
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export const TransactionModel = model('Transaction', transactionSchema);
