import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Teacher } from './models/Teacher';
import { Student } from './models/Student';
import { Volunteer } from './models/Volunteer';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fln';
const DEFAULT_TEACHER_PASSWORD = 'Teacher@123';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DB_JSON_PATH = path.join(ROOT_DIR, 'data', 'db.json');

const TEACHERS_SEED: { email: string; name: string; schoolId: string }[] = [
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

const FIRST_NAMES = [
  'Aarav', 'Anaya', 'Arjun', 'Diya', 'Ishaan', 'Kavya', 'Mohan', 'Priya',
  'Rahul', 'Riya', 'Rohan', 'Saanvi', 'Suresh', 'Tara', 'Vihaan', 'Zara',
  'Aman', 'Bhavna', 'Chirag', 'Deepa', 'Esha', 'Farhan', 'Geeta', 'Hari',
  'Indira', 'Jatin', 'Kiran', 'Lata', 'Maya', 'Naveen', 'Om', 'Pooja',
  'Rakesh', 'Sneha', 'Tanvi', 'Uday', 'Vani', 'Yash', 'Zubin', 'Asha',
  'Bikram', 'Chhaya', 'Deepak', 'Fatima', 'Ganesh', 'Hema', 'Iqbal', 'Jaya',
  'Kunal', 'Lakshmi', 'Manoj', 'Nandini', 'Omkar', 'Pallavi', 'Raghav', 'Sunita',
  'Tushar', 'Urmila', 'Vikram', 'Yamini'
];

const FATHER_NAMES = [
  'Ram Singh', 'Shyam Lal', 'Hari Om', 'Krishan', 'Mohan Das',
  'Sohan Lal', 'Gopal', 'Ramesh', 'Suresh', 'Dinesh',
  'Mahesh', 'Rajesh', 'Mukesh', 'Hitesh', 'Naresh',
  'Prakash', 'Ashok', 'Vinod', 'Anand', 'Bharat'
];

const GENDERS: Array<'male' | 'female' | 'other'> = ['male', 'female', 'other'];

// Generate a deterministic 12-digit Aadhaar-like ID from a seed
function fakeAadhaar(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  }
  let s = '';
  let n = hash;
  for (let i = 0; i < 12; i++) {
    s += (n % 10).toString();
    n = Math.floor(n / 10) || (hash + i + 1);
  }
  return s;
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function ageYearsToDob(ageYears: number): string {
  const today = new Date();
  const yyyy = today.getFullYear() - ageYears;
  return `${yyyy}-01-01`;
}

function classNumberFromName(name: string): number {
  const m = name.match(/\d+/);
  return m ? parseInt(m[0], 10) : 2;
}

async function seedTeachers(): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  for (const t of TEACHERS_SEED) {
    const exists = await Teacher.findOne({ email: t.email });
    if (exists) {
      skipped++;
      continue;
    }
    await Teacher.create({ ...t, password: DEFAULT_TEACHER_PASSWORD });
    created++;
  }
  return { created, skipped };
}

interface ClassRow {
  id: string;
  className: string;
  section: string;
  schoolId: string;
  teacherId?: string;
}

interface SchoolRow {
  id: string;
  name: string;
  stateCode?: string;
  districtCode?: string;
  blockCode?: string;
}

interface DbJsonShape {
  schools: SchoolRow[];
  classes: ClassRow[];
}

function readDbJson(): DbJsonShape {
  const raw = fs.readFileSync(DB_JSON_PATH, 'utf-8');
  return JSON.parse(raw) as DbJsonShape;
}

async function seedStudents(opts: { perClass: number }): Promise<{ created: number; skipped: number }> {
  const db = readDbJson();
  let created = 0;
  let skipped = 0;

  for (const klass of db.classes) {
    const klassNum = classNumberFromName(klass.className);
    const school = db.schools.find(s => s.id === klass.schoolId);

    for (let i = 0; i < opts.perClass; i++) {
      const seed = `${klass.id}__${i}`;
      const firstName = pick(FIRST_NAMES, hashString(seed));
      const fatherName = pick(FATHER_NAMES, hashString(seed + 'father') + i);
      const gender = pick(GENDERS, hashString(seed + 'gender') + i);
      const age = 6 + (klassNum - 1) + (i % 3);
      const dob = ageYearsToDob(age);
      const aadhaar = fakeAadhaar(seed);

      const existing = await Student.findOne({ aadhaarNumber: aadhaar, schoolCode: klass.schoolId });
      if (existing) {
        skipped++;
        continue;
      }

      await Student.create({
        studentName: firstName,
        name: firstName,
        dateOfBirth: dob,
        gender,
        aadhaarNumber: aadhaar,
        parentName: fatherName,
        class: klassNum,
        section: klass.section,
        schoolCode: klass.schoolId,
        schoolId: klass.schoolId,
        classGroup: klass.className,
        teacherId: klass.teacherId || '',
        status: 'active',
        createdBy: klass.teacherId || 'system',
        createdAt: new Date(),
        currentLevel: 1,
        currentSubLevel: 0,
        targetLevel: 2,
        streak: 0,
        aadharMasked: aadhaar,
        levelHistory: [],
        districtCode: school?.districtCode,
        districtName: undefined,
        blockCode: school?.blockCode,
        blockName: undefined,
        stateCode: school?.stateCode,
        stateName: undefined
      });
      created++;
    }
  }

  return { created, skipped };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff;
  return h;
}

const DEFAULT_VOLUNTEER_PASSWORD = 'Volunteer@123';

async function seedVolunteers(): Promise<{ created: number; skipped: number }> {
  const raw = fs.readFileSync(DB_JSON_PATH, 'utf-8');
  const db = JSON.parse(raw) as { users: any[] };
  const volunteers = (db.users || []).filter((u) => u.role === 'volunteer');
  let created = 0;
  let skipped = 0;
  for (const v of volunteers) {
    const exists = await Volunteer.findOne({ email: v.email });
    if (exists) {
      skipped++;
      continue;
    }
    await Volunteer.create({
      email: v.email,
      name: v.name,
      assignedSchools: v.assignedSchools || [],
      password: DEFAULT_VOLUNTEER_PASSWORD
    });
    created++;
  }
  return { created, skipped };
}

async function main() {
  const arg = process.argv[2] || 'all';
  const perClass = parseInt(process.env.SEED_STUDENTS_PER_CLASS || '3', 10);

  try {
    console.log(`Connecting to MongoDB: ${MONGODB_URI}`);
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.\n');

    if (arg === 'teachers' || arg === 'all') {
      console.log('Seeding teachers...');
      const r = await seedTeachers();
      console.log(`  teachers: created=${r.created}, skipped=${r.skipped}`);
    }

    if (arg === 'volunteers' || arg === 'all') {
      console.log('Seeding volunteers...');
      const r = await seedVolunteers();
      console.log(`  volunteers: created=${r.created}, skipped=${r.skipped}`);
    }

    if (arg === 'students' || arg === 'all') {
      console.log(`Seeding sample students (${perClass} per class)...`);
      const r = await seedStudents({ perClass });
      console.log(`  students: created=${r.created}, skipped=${r.skipped}`);
    }

    console.log('\nDone. Run `npm run dev` to start the app.');
  } catch (err: any) {
    console.error('Seed failed:', err?.message || err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
