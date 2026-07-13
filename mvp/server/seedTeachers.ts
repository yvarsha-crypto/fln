import mongoose from 'mongoose';
import { Teacher } from './models/Teacher';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fln';

const TEACHERS_SEED = [
  { email: 'gps-mt-001.t01@fln.org', name: 'Ritu Sharma (Teacher)', schoolId: 'gps-mt-001' },
  { email: 'gps-amb-003.t01@fln.org', name: 'Meena Kumari (Teacher)', schoolId: 'gps-amb-003' },
  { email: 'gps-jai-004.t01@fln.org', name: 'Ram Gopal (Teacher)', schoolId: 'gps-jai-004' },
  { email: 'gps-lko-005.t01@fln.org', name: 'Suresh Kumar (Teacher)', schoolId: 'gps-lko-005' },
  { email: 'gps-bth-006.t01@fln.org', name: 'Harpreet Kaur (Teacher)', schoolId: 'gps-bth-006' },
  { email: 'gps-bth-006.t02@fln.org', name: 'Jaswant Singh (Teacher)', schoolId: 'gps-bth-006' },
  { email: 'gps-asr-007.t01@fln.org', name: 'Gurvinder Singh (Teacher)', schoolId: 'gps-asr-007' },
  { email: 'gps-pkl-008.t01@fln.org', name: 'Kavita Sharma (Teacher)', schoolId: 'gps-pkl-008' },
  { email: 'gps-pkl-008.t02@fln.org', name: 'Rajesh Kumar (Teacher)', schoolId: 'gps-pkl-008' },
  { email: 'gps-jai2-009.t01@fln.org', name: 'Ravi Verma (Teacher)', schoolId: 'gps-jai2-009' },
  { email: 'gps-uda-010.t01@fln.org', name: 'Madhu Saxena (Teacher)', schoolId: 'gps-uda-010' },
  { email: 'gps-uda-010.t02@fln.org', name: 'Prakash Choudhary (Teacher)', schoolId: 'gps-uda-010' },
  { email: 'gps-lko2-011.t01@fln.org', name: 'Alok Mishra (Teacher)', schoolId: 'gps-lko2-011' },
  { email: 'gps-knp-012.t01@fln.org', name: 'Sunita Devi (Teacher)', schoolId: 'gps-knp-012' },
  { email: 'gps-pb-ldh2-013.t01@fln.org', name: 'Balwinder Kaur (Teacher)', schoolId: 'gps-pb-ldh2-013' },
  { email: 'gps-hr-amb2-014.t01@fln.org', name: 'Nisha Rani (Teacher)', schoolId: 'gps-hr-amb2-014' },
];

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const DEFAULT_PASSWORD = 'Teacher@123';
    let created = 0;
    let skipped = 0;

    for (const t of TEACHERS_SEED) {
      const exists = await Teacher.findOne({ email: t.email });
      if (exists) {
        skipped++;
        continue;
      }
      await Teacher.create({ ...t, password: DEFAULT_PASSWORD });
      created++;
    }

    console.log(`Done. Created: ${created}, Skipped (already exist): ${skipped}`);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

seed();
