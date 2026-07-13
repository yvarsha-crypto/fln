import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface ITeacher extends Document {
  email: string;
  password: string;
  name: string;
  schoolId: string;
  role: 'teacher';
  comparePassword(candidate: string): Promise<boolean>;
}

const teacherSchema = new Schema<ITeacher>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 8 },
  name: { type: String, required: true },
  schoolId: { type: String, required: true },
  role: { type: String, default: 'teacher', enum: ['teacher'] }
}, {
  toJSON: {
    transform(_doc, ret) {
      delete ret.password;
      delete ret.__v;
      return ret;
    }
  }
});

teacherSchema.pre('save', async function (this: any) {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

teacherSchema.methods.comparePassword = async function (candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

export const Teacher = mongoose.model<ITeacher>('Teacher', teacherSchema);
