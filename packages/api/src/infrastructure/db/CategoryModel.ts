import { Schema, model } from 'mongoose';

const categorySchema = new Schema({
  userId: { type: String, required: true },
  name: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const CategoryModel = model('Category', categorySchema);
