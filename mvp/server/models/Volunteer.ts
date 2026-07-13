import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IVolunteer extends Document {
  email: string;
  password: string;
  name: string;
  assignedSchools: string[];
  role: 'volunteer';
  comparePassword(candidate: string): Promise<boolean>;
}

const volunteerSchema = new Schema<IVolunteer>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 8 },
  name: { type: String, required: true },
  assignedSchools: { type: [String], default: [] },
  role: { type: String, default: 'volunteer', enum: ['volunteer'] }
}, {
  toJSON: {
    transform(_doc, ret) {
      delete ret.password;
      delete ret.__v;
      return ret;
    }
  }
});

volunteerSchema.pre('save', async function (this: any) {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

volunteerSchema.methods.comparePassword = async function (candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

export const Volunteer = mongoose.model<IVolunteer>('Volunteer', volunteerSchema);