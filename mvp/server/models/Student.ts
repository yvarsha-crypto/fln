import mongoose, { Schema, Document } from 'mongoose';

export interface IStudent extends Document {
  studentName: string;
  dateOfBirth: string;
  gender: 'male' | 'female' | 'other';
  aadhaarNumber: string;
  parentName: string;
  class: number;
  section: string;
  schoolCode?: string;
  districtCode?: string;
  districtName?: string;
  blockCode?: string;
  blockName?: string;
  stateCode?: string;
  stateName?: string;
  status: 'active' | 'inactive';
  createdBy?: string;
  createdAt?: Date;
  updatedBy?: string;
  updatedAt?: Date;
  legacyId?: string;
  name?: string;
  age?: number;
  classGroup?: string;
  schoolId?: string;
  teacherId?: string;
  currentLevel?: number;
  currentSubLevel?: number;
  targetLevel?: number;
  aadharMasked?: string;
  levelHistory?: { level: number; subLevel?: number; date: string; reason: string }[];
  streak?: number;
}

const studentSchema = new Schema<IStudent>({
  studentName: { type: String, required: true, minlength: 2, maxlength: 100 },
  dateOfBirth: { type: String, required: true },
  gender: { type: String, enum: ['male', 'female', 'other'], required: true },
  aadhaarNumber: { type: String, required: true },
  parentName: { type: String, required: true, minlength: 2, maxlength: 100 },
  class: { type: Number, required: true, min: 1, max: 12 },
  section: { type: String, required: true, minlength: 1, maxlength: 5 },
  schoolCode: String,
  districtCode: String,
  districtName: String,
  blockCode: String,
  blockName: String,
  stateCode: String,
  stateName: String,
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdBy: String,
  createdAt: { type: Date, default: Date.now },
  updatedBy: String,
  updatedAt: Date,
  legacyId: String,
  name: String,
  age: Number,
  classGroup: String,
  schoolId: String,
  teacherId: String,
  currentLevel: { type: Number, default: 1 },
  currentSubLevel: { type: Number, default: 0 },
  targetLevel: { type: Number, default: 2 },
  aadharMasked: String,
  levelHistory: [{ level: Number, subLevel: Number, date: String, reason: String }],
  streak: { type: Number, default: 0 }
}, {
  toJSON: {
    virtuals: true,
    transform(_doc, ret: Record<string, any>) {
      ret.studentId = ret._id.toString();
      if (ret.aadhaarNumber) {
        const norm = String(ret.aadhaarNumber);
        if (/^\d{12}$/.test(norm)) {
          ret.aadhaarNumber = 'X'.repeat(8) + norm.slice(-4);
        } else if (norm.length > 4) {
          ret.aadhaarNumber = 'X'.repeat(norm.length - 4) + norm.slice(-4);
        }
      }
      delete ret.__v;
      return ret;
    }
  }
});

studentSchema.index({ aadhaarNumber: 1, schoolCode: 1 }, { unique: true });
studentSchema.index({ schoolCode: 1, class: 1, section: 1 });
studentSchema.index({ status: 1 });

export const Student = mongoose.model<IStudent>('Student', studentSchema);
