import { Schema, model } from 'mongoose';

const accountSchema = new Schema({
  userId: { type: String, required: true },
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ['CHECKING', 'SAVINGS', 'CREDIT_CARD'],
    required: true,
  },
  closingDay: { type: Number },
  dueDay: { type: Number },
  createdAt: { type: Date, default: Date.now },
});

export const AccountModel = model('Account', accountSchema);
