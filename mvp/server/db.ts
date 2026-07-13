import fs from 'fs/promises';
import path from 'path';

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DB_DIR, 'db.json');

// Types & Interfaces corresponding to MongoDB Collections in SRS §10
export enum UserRole {
  SUPERADMIN = 'superadmin',
  ADMIN = 'admin',
  DISTRICT_ADMIN = 'district_admin',
  BLOCK_ADMIN = 'block_admin',
  SCHOOL = 'school',
  TEACHER = 'teacher',
  VOLUNTEER = 'volunteer'
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  stateCode?: string;
  districtCode?: string;
  blockCode?: string;
  schoolId?: string;
  assignedSchools?: string[]; // for Volunteers
  delayedAttemptsCount?: number;
  isBanned?: boolean;
}

export interface School {
  id: string;
  name: string;
  stateCode: string;
  districtCode: string;
  blockCode: string;
  strength: 'high' | 'low'; // High-strength vs. Low-strength (§1.2)
  teachersCount: number;
  isAccessLocked?: boolean;
  // Optional human-readable names (denormalized)
  districtName?: string;
  blockName?: string;
  stateName?: string;
}

export interface ClassGroup {
  id: string;
  schoolId: string;
  className: string; // e.g. "Class 2", "Class 3", "Class 4"
  section: string; // e.g. "A", "B"
  teacherId: string;
}

export interface Student {
  id: string;
  name: string;
  age: number;
  classGroup: string; // "Class 2" | "Class 3" | "Class 4"
  section: string;
  schoolId: string;
  teacherId?: string;
  currentLevel: number;
  currentSubLevel?: number;
  targetLevel: number;
  aadharMasked: string; // Mandatory, unique identifier masked (§13.2 R-6)
  levelHistory: { level: number; subLevel?: number; date: string; reason: string }[];
  streak: number;
  // Optional newer fields (v1.0 additions)
  studentId?: string; // MongoDB-style ObjectId
  studentName?: string;
  dateOfBirth?: string; // ISO YYYY-MM-DD
  gender?: 'male' | 'female' | 'other';
  aadhaarNumber?: string; // raw Aadhaar/BC (stored masked on responses)
  parentName?: string;
  class?: number; // numeric class 1-12
  schoolCode?: string; // denormalized school code
  districtCode?: string;
  districtName?: string;
  blockCode?: string;
  blockName?: string;
  stateCode?: string;
  stateName?: string;
  status?: 'active' | 'inactive';
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface Question {
  question_id: string;
  question: string;
  answer: string;
  answer_type: 'text' | 'number' | 'choice';
  choices?: string[];
  topic: string;
  subtopic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  source_level: number; // Mapping to mathematical level
  svgAsset?: string; // Standard pre-built SVG asset category
}

export interface Worksheet {
  id: string; // Exam ID
  classId: string;
  className: string;
  section: string;
  schoolId: string;
  generatedByRole: UserRole;
  generatedByEmail: string;
  cycle: 'Baseline' | 'Mid-year' | 'End-of-year';
  date: string;
  questions: Question[];
  locks: {
    locked: boolean;
    lockedByRole: UserRole | null;
    lockedByEmail: string | null;
    timestamp: string | null;
  };
  timing: {
    examDate: string; // e.g. "2026-07-06"
    printWindowStart: string; // ISO String
    printWindowEnd: string; // ISO String
    examWindowStart: string; // ISO String
    examWindowEnd: string; // ISO String
    submissionWindowEnd: string; // ISO String
  };
  delayLogs: {
    delayedAttemptsCount: number;
    submittingTeachers: string[];
  };
}

export interface AnswerSubmission {
  id: string;
  worksheetId: string;
  studentId: string;
  studentName: string;
  schoolId: string;
  classId: string;
  submittedAt: string;
  isDelayed: boolean;
  answers: { [questionId: string]: string }; // Q1 -> A, Q2 -> 5, etc.
}

export interface EvaluationReport {
  id: string;
  studentId: string;
  worksheetId: string;
  score: number;
  totalQuestions: number;
  conceptMastery: { [topic: string]: 'Strong' | 'Needs Practice' | 'Satisfactory' };
  narrative: string; // Narrative summary for parent/teacher
  recommendedLevel: number;
  recommendedSubLevel?: number;
  timestamp: string;
}

export interface Ticket {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  userRole: UserRole;
  type: 'general' | 'curriculum';
  subject: string;
  description: string;
  status: 'Open' | 'Reviewed' | 'Resolved';
  createdAt: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  schoolId: string;
  schoolName: string;
  userId: string;
  userEmail: string;
  userRole: UserRole;
  activityType: 'download' | 'print' | 'conduct' | 'scan' | 'verify' | 'ticket';
  status: 'Success' | 'Failed' | 'Delayed';
  details: string;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  isUrgent: boolean;
  authorEmail: string;
  createdAt: string;
}

interface DatabaseSchema {
  users: User[];
  schools: School[];
  classes: ClassGroup[];
  students: Student[];
  questions: Question[];
  worksheets: Worksheet[];
  answerSubmissions: AnswerSubmission[];
  evaluationReports: EvaluationReport[];
  tickets: Ticket[];
  logbook: LogEntry[];
  announcements: Announcement[];
}

export class DBStore {
  private data: DatabaseSchema | null = null;

  async init() {
    try {
      await fs.mkdir(DB_DIR, { recursive: true });
    } catch (_) {}

    try {
      const content = await fs.readFile(DB_FILE, 'utf-8');
      this.data = JSON.parse(content) as DatabaseSchema;

      // Auto-merge any newly defined pre-seeded users, schools, classes, and students
      const seed = this.getSeedData();
      let modified = false;

      // Use local alias to avoid repeated null checks on this.data
      const d = this.data ?? (this.data = this.getSeedData());

      d.users = d.users ?? [];
      for (const u of seed.users) {
        if (!d.users.some(existing => existing.email.toLowerCase() === u.email.toLowerCase())) {
          d.users.push(u);
          modified = true;
        }
      }

      d.schools = d.schools ?? [];
      for (const s of seed.schools) {
        if (!d.schools.some(existing => existing.id === s.id)) {
          d.schools.push(s);
          modified = true;
        }
      }

      d.classes = d.classes ?? [];
      for (const c of seed.classes) {
        if (!d.classes.some(existing => existing.id === c.id)) {
          d.classes.push(c);
          modified = true;
        }
      }

      d.students = d.students ?? [];
      for (const std of seed.students) {
        if (!d.students.some(existing => existing.id === std.id)) {
          d.students.push(std);
          modified = true;
        }
      }

      d.announcements = d.announcements ?? [];
      d.tickets = d.tickets ?? [];
      d.logbook = d.logbook ?? [];

      if (modified) {
        await this.save();
      }
    } catch (_) {
      // If DB file does not exist, pre-seed data
      this.data = this.getSeedData();
      await this.save();
    }
  }

  private async save() {
    if (!this.data) return;
    await fs.writeFile(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  async reset() {
    this.data = this.getSeedData();
    await this.save();
  }

  // --- Collection Accessors ---

  async getUsers() { return this.data!.users; }
  async getSchools() { return this.data!.schools; }
  async getClasses() { return this.data!.classes; }
  async getStudents() { return this.data!.students; }
  async getQuestions() { return this.data!.questions; }
  async getWorksheets() { return this.data!.worksheets; }
  async getAnswerSubmissions() { return this.data!.answerSubmissions; }
  async getEvaluationReports() { return this.data!.evaluationReports; }
  async getTickets() { return this.data!.tickets; }
  async getLogbook() { return this.data!.logbook; }
  async getAnnouncements() { return this.data!.announcements; }

  // --- Write / Update Helpers ---

  async addUser(user: User) {
    this.data!.users.push(user);
    await this.save();
    return user;
  }

  async addStudent(student: Student) {
    this.data!.students.push(student);
    await this.save();
    return student;
  }

  async updateStudent(studentId: string, updates: Partial<Student>) {
    const s = this.data!.students.find(x => x.id === studentId);
    if (s) {
      Object.assign(s, updates);
      await this.save();
    }
    return s;
  }

  async addWorksheet(ws: Worksheet) {
    this.data!.worksheets.push(ws);
    await this.save();
    return ws;
  }

  async updateWorksheet(worksheetId: string, updates: Partial<Worksheet>) {
    const ws = this.data!.worksheets.find(x => x.id === worksheetId);
    if (ws) {
      Object.assign(ws, updates);
      await this.save();
    }
    return ws;
  }

  async addAnswerSubmission(sub: AnswerSubmission) {
    this.data!.answerSubmissions.push(sub);
    await this.save();
    return sub;
  }

  async addEvaluationReport(rep: EvaluationReport) {
    this.data!.evaluationReports.push(rep);
    await this.save();
    return rep;
  }

  async addTicket(t: Ticket) {
    this.data!.tickets.push(t);
    await this.save();
    return t;
  }

  async updateTicket(id: string, updates: Partial<Ticket>) {
    const t = this.data!.tickets.find(x => x.id === id);
    if (t) {
      Object.assign(t, updates);
      await this.save();
    }
    return t;
  }

  async updateUser(userId: string, updates: Partial<User>) {
    const u = this.data!.users.find(x => x.id === userId);
    if (u) {
      Object.assign(u, updates);
      await this.save();
    }
    return u;
  }

  async updateSchool(schoolId: string, updates: Partial<School>) {
    const s = this.data!.schools.find(x => x.id === schoolId);
    if (s) {
      Object.assign(s, updates);
      await this.save();
    }
    return s;
  }

  async addLog(log: LogEntry) {
    this.data!.logbook.unshift(log);
    await this.save();
    return log;
  }

  async addAnnouncement(ann: Announcement) {
    this.data!.announcements.unshift(ann);
    await this.save();
    return ann;
  }

  // --- Preloaded Question Pool (Mathematical Curriculum Questions Classes 2-4) ---
  private getSeedQuestions(): Question[] {
    return [
      // Level 1: Preschool & Intro Counting
      {
        question_id: 'L1_Q1',
        question: 'Count the apples in the picture. How many apples are there?',
        answer: '5',
        answer_type: 'number',
        topic: 'Number Sense',
        subtopic: 'Counting',
        difficulty: 'easy',
        source_level: 1,
        svgAsset: 'fruits'
      },
      {
        question_id: 'L1_Q2',
        question: 'Count the circles and write the total number.',
        answer: '3',
        answer_type: 'number',
        topic: 'Shapes',
        subtopic: 'Recognition',
        difficulty: 'easy',
        source_level: 1,
        svgAsset: 'shapes'
      },
      // Level 2: Class 1 Addition & Simple Shapes
      {
        question_id: 'L2_Q1',
        question: 'Calculate: 3 + 4 = ?',
        answer: '7',
        answer_type: 'number',
        topic: 'Number Operations',
        subtopic: 'Addition',
        difficulty: 'easy',
        source_level: 2,
        svgAsset: 'numbers'
      },
      {
        question_id: 'L2_Q2',
        question: 'Complete the pattern: Red Circle, Blue Circle, Red Circle, ?',
        answer: 'Blue Circle',
        answer_type: 'choice',
        choices: ['Red Circle', 'Blue Circle', 'Green Circle'],
        topic: 'Patterns',
        subtopic: 'Completing Patterns',
        difficulty: 'medium',
        source_level: 2,
        svgAsset: 'shapes'
      },
      // Level 3: Class 2 Measurement, Time, Simple Operations
      {
        question_id: 'L3_Q1',
        question: 'If a pencil is 8 centimeters long and we cut 3 centimeters off, how long is it now?',
        answer: '5',
        answer_type: 'number',
        topic: 'Measurement',
        subtopic: 'Length Subtraction',
        difficulty: 'medium',
        source_level: 3,
        svgAsset: 'tracing'
      },
      {
        question_id: 'L3_Q2',
        question: 'Look at the clock. If the short hand points to 3 and the long hand points to 12, what hour is it?',
        answer: '3',
        answer_type: 'number',
        topic: 'Calendar and Time',
        subtopic: 'Reading Hours',
        difficulty: 'easy',
        source_level: 3,
        svgAsset: 'numbers'
      },
      // Level 4: Class 3 Fractions, 2D/3D shapes, Money
      {
        question_id: 'L4_Q1',
        question: 'Ramu has a pizza cut into 4 equal slices. He eats 1 slice. What fraction of the pizza is left?',
        answer: '3/4',
        answer_type: 'choice',
        choices: ['1/4', '2/4', '3/4', '4/4'],
        topic: 'Fractions',
        subtopic: 'Fraction Representation',
        difficulty: 'medium',
        source_level: 4,
        svgAsset: 'shapes'
      },
      {
        question_id: 'L4_Q2',
        question: 'You buy a toy for 15 rupees and give the shopkeeper a 50-rupee note. How many rupees do you get back?',
        answer: '35',
        answer_type: 'number',
        topic: 'Money',
        subtopic: 'Transaction Change',
        difficulty: 'hard',
        source_level: 4,
        svgAsset: 'numbers'
      },
      // Level 5: Class 4 Double-digit operations, Multiplication, Decimals intro
      {
        question_id: 'L5_Q1',
        question: 'Multiply: 12 x 5 = ?',
        answer: '60',
        answer_type: 'number',
        topic: 'Number Operations',
        subtopic: 'Multiplication',
        difficulty: 'easy',
        source_level: 5,
        svgAsset: 'numbers'
      },
      {
        question_id: 'L5_Q2',
        question: 'In a class there are 5 benches. Each bench holds 4 students. How many students can sit in total?',
        answer: '20',
        answer_type: 'number',
        topic: 'Data Handling',
        subtopic: 'Simple Arithmetic Multiplication',
        difficulty: 'medium',
        source_level: 5,
        svgAsset: 'animals'
      },
      // Level 6: Higher level calendar, division, data charts
      {
        question_id: 'L6_Q1',
        question: 'Divide: 48 / 6 = ?',
        answer: '8',
        answer_type: 'number',
        topic: 'Number Operations',
        subtopic: 'Division',
        difficulty: 'medium',
        source_level: 6,
        svgAsset: 'numbers'
      },
      {
        question_id: 'L6_Q2',
        question: 'If July 1st is a Monday, what day of the week is July 8th?',
        answer: 'Monday',
        answer_type: 'choice',
        choices: ['Monday', 'Tuesday', 'Sunday', 'Wednesday'],
        topic: 'Calendar and Time',
        subtopic: 'Calendar Arithmetic',
        difficulty: 'hard',
        source_level: 6,
        svgAsset: 'numbers'
      }
    ];
  }

  // --- Comprehensive Pre-Seeded Workspace Data ---
  private getSeedData(): DatabaseSchema {
    const schools: School[] = [
      { id: 'gps-mt-001', name: 'GPS Model Town Ludhiana', stateCode: 'PB', districtCode: 'LDH', blockCode: 'LDH-01', strength: 'high', teachersCount: 2 },
      { id: 'gps-vl-002', name: 'GPS Rural Village Moga', stateCode: 'PB', districtCode: 'MOG', blockCode: 'MOG-02', strength: 'low', teachersCount: 0 },
      { id: 'gps-amb-003', name: 'GPS Cantt Ambala', stateCode: 'HR', districtCode: 'AMB', blockCode: 'AMB-01', strength: 'high', teachersCount: 1 },
      { id: 'gps-jai-004', name: 'GPS Govind Dev Jaipur', stateCode: 'RJ', districtCode: 'JAI', blockCode: 'JAI-01', strength: 'low', teachersCount: 1 },
      { id: 'gps-lko-005', name: 'GPS Hazratganj Lucknow', stateCode: 'UP', districtCode: 'LKO', blockCode: 'LKO-01', strength: 'high', teachersCount: 1 },
      { id: 'gps-bth-006', name: 'GPS Bathinda City', stateCode: 'PB', districtCode: 'BTH', blockCode: 'BTH-01', strength: 'high', teachersCount: 2 },
      { id: 'gps-asr-007', name: 'GPS Amritsar Golden', stateCode: 'PB', districtCode: 'ASR', blockCode: 'ASR-01', strength: 'low', teachersCount: 1 },
      { id: 'gps-pkl-008', name: 'GPS Panchkula Sector', stateCode: 'HR', districtCode: 'PKL', blockCode: 'PKL-01', strength: 'high', teachersCount: 2 },
      { id: 'gps-jai2-009', name: 'GPS Jaipur Rural North', stateCode: 'RJ', districtCode: 'JAI', blockCode: 'JAI-02', strength: 'low', teachersCount: 1 },
      { id: 'gps-uda-010', name: 'GPS Udaipur City', stateCode: 'RJ', districtCode: 'UDA', blockCode: 'UDA-01', strength: 'high', teachersCount: 2 },
      { id: 'gps-lko2-011', name: 'GPS Lucknow Aliganj', stateCode: 'UP', districtCode: 'LKO', blockCode: 'LKO-02', strength: 'high', teachersCount: 1 },
      { id: 'gps-knp-012', name: 'GPS Kanpur Cantt', stateCode: 'UP', districtCode: 'KNP', blockCode: 'KNP-01', strength: 'low', teachersCount: 1 },
      { id: 'gps-pb-ldh2-013', name: 'GPS Gill Village Ludhiana', stateCode: 'PB', districtCode: 'LDH', blockCode: 'LDH-02', strength: 'low', teachersCount: 1 },
      { id: 'gps-hr-amb2-014', name: 'GPS Ambala City South', stateCode: 'HR', districtCode: 'AMB', blockCode: 'AMB-02', strength: 'high', teachersCount: 2 }
    ];

    const users: User[] = [
      { id: 'u1', email: 'superadmin@fln.org', name: 'Jinal Gupta', role: UserRole.SUPERADMIN },
      { id: 'u2', email: 'admin.pb@fln.org', name: 'State Coordinator Punjab', role: UserRole.ADMIN, stateCode: 'PB' },
      { id: 'u2_hr', email: 'admin.hr@fln.org', name: 'State Coordinator Haryana', role: UserRole.ADMIN, stateCode: 'HR' },
      { id: 'u2_rj', email: 'admin.rj@fln.org', name: 'State Coordinator Rajasthan', role: UserRole.ADMIN, stateCode: 'RJ' },
      { id: 'u2_up', email: 'admin.up@fln.org', name: 'State Coordinator Uttar Pradesh', role: UserRole.ADMIN, stateCode: 'UP' },
      { id: 'u3', email: 'district.ldh@fln.org', name: 'Ludhiana District Officer', role: UserRole.DISTRICT_ADMIN, stateCode: 'PB', districtCode: 'LDH' },
      { id: 'u3_amb', email: 'district.amb@fln.org', name: 'Ambala District Officer', role: UserRole.DISTRICT_ADMIN, stateCode: 'HR', districtCode: 'AMB' },
      { id: 'u3_jai', email: 'district.jai@fln.org', name: 'Jaipur District Officer', role: UserRole.DISTRICT_ADMIN, stateCode: 'RJ', districtCode: 'JAI' },
      { id: 'u3_lko', email: 'district.lko@fln.org', name: 'Lucknow District Officer', role: UserRole.DISTRICT_ADMIN, stateCode: 'UP', districtCode: 'LKO' },
      { id: 'u4', email: 'block.ldh-01@fln.org', name: 'Ludhiana Block Admin 1', role: UserRole.BLOCK_ADMIN, stateCode: 'PB', districtCode: 'LDH', blockCode: 'LDH-01' },
      { id: 'u4_lko', email: 'block.lko-01@fln.org', name: 'Lucknow Block Admin 1', role: UserRole.BLOCK_ADMIN, stateCode: 'UP', districtCode: 'LKO', blockCode: 'LKO-01' },
      { id: 'u5', email: 'gps-mt-001@fln.org', name: 'GPS Model Town Principal', role: UserRole.SCHOOL, schoolId: 'gps-mt-001' },
      { id: 'u5_amb', email: 'gps-amb-003@fln.org', name: 'GPS Cantt Principal', role: UserRole.SCHOOL, schoolId: 'gps-amb-003' },
      { id: 'u5_jai', email: 'gps-jai-004@fln.org', name: 'GPS Govind Dev Principal', role: UserRole.SCHOOL, schoolId: 'gps-jai-004' },
      { id: 'u5_lko', email: 'gps-lko-005@fln.org', name: 'GPS Hazratganj Principal', role: UserRole.SCHOOL, schoolId: 'gps-lko-005' },
      { id: 'u6', email: 'gps-mt-001.t01@fln.org', name: 'Ritu Sharma (Teacher)', role: UserRole.TEACHER, schoolId: 'gps-mt-001' },
      { id: 'u6_amb', email: 'gps-amb-003.t01@fln.org', name: 'Meena Kumari (Teacher)', role: UserRole.TEACHER, schoolId: 'gps-amb-003' },
      { id: 'u6_jai', email: 'gps-jai-004.t01@fln.org', name: 'Ram Gopal (Teacher)', role: UserRole.TEACHER, schoolId: 'gps-jai-004' },
      { id: 'u6_lko', email: 'gps-lko-005.t01@fln.org', name: 'Suresh Kumar (Teacher)', role: UserRole.TEACHER, schoolId: 'gps-lko-005' },
      { id: 'u7', email: 'vol.rahul@fln.org', name: 'Rahul Kumar (Volunteer)', role: UserRole.VOLUNTEER, assignedSchools: ['gps-vl-002'] },
      { id: 'u7_amit', email: 'vol.amit@fln.org', name: 'Amit Saini (Volunteer)', role: UserRole.VOLUNTEER, assignedSchools: ['gps-vl-002', 'gps-jai-004'] },
      { id: 'u7_sneha', email: 'vol.up_sneha@fln.org', name: 'Sneha Verma (Volunteer)', role: UserRole.VOLUNTEER, assignedSchools: ['gps-lko-005'] },
      { id: 'u7_vipin', email: 'vol.hr_vipin@fln.org', name: 'Vipin Yadav (Volunteer)', role: UserRole.VOLUNTEER, assignedSchools: ['gps-amb-003'] },
      // District admins for new districts
      { id: 'u3_bth', email: 'district.bth@fln.org', name: 'Bathinda District Officer', role: UserRole.DISTRICT_ADMIN, stateCode: 'PB', districtCode: 'BTH' },
      { id: 'u3_asr', email: 'district.asr@fln.org', name: 'Amritsar District Officer', role: UserRole.DISTRICT_ADMIN, stateCode: 'PB', districtCode: 'ASR' },
      { id: 'u3_pkl', email: 'district.pkl@fln.org', name: 'Panchkula District Officer', role: UserRole.DISTRICT_ADMIN, stateCode: 'HR', districtCode: 'PKL' },
      { id: 'u3_uda', email: 'district.uda@fln.org', name: 'Udaipur District Officer', role: UserRole.DISTRICT_ADMIN, stateCode: 'RJ', districtCode: 'UDA' },
      { id: 'u3_knp', email: 'district.knp@fln.org', name: 'Kanpur District Officer', role: UserRole.DISTRICT_ADMIN, stateCode: 'UP', districtCode: 'KNP' },
      // Block admins for new blocks
      { id: 'u4_bth', email: 'block.bth-01@fln.org', name: 'Bathinda Block Admin', role: UserRole.BLOCK_ADMIN, stateCode: 'PB', districtCode: 'BTH', blockCode: 'BTH-01' },
      { id: 'u4_asr', email: 'block.asr-01@fln.org', name: 'Amritsar Block Admin', role: UserRole.BLOCK_ADMIN, stateCode: 'PB', districtCode: 'ASR', blockCode: 'ASR-01' },
      { id: 'u4_pkl', email: 'block.pkl-01@fln.org', name: 'Panchkula Block Admin', role: UserRole.BLOCK_ADMIN, stateCode: 'HR', districtCode: 'PKL', blockCode: 'PKL-01' },
      { id: 'u4_jai2', email: 'block.jai-02@fln.org', name: 'Jaipur Block Admin 2', role: UserRole.BLOCK_ADMIN, stateCode: 'RJ', districtCode: 'JAI', blockCode: 'JAI-02' },
      { id: 'u4_uda', email: 'block.uda-01@fln.org', name: 'Udaipur Block Admin', role: UserRole.BLOCK_ADMIN, stateCode: 'RJ', districtCode: 'UDA', blockCode: 'UDA-01' },
      { id: 'u4_lko2', email: 'block.lko-02@fln.org', name: 'Lucknow Block Admin 2', role: UserRole.BLOCK_ADMIN, stateCode: 'UP', districtCode: 'LKO', blockCode: 'LKO-02' },
      { id: 'u4_knp', email: 'block.knp-01@fln.org', name: 'Kanpur Block Admin', role: UserRole.BLOCK_ADMIN, stateCode: 'UP', districtCode: 'KNP', blockCode: 'KNP-01' },
      { id: 'u4_ldh2', email: 'block.ldh-02@fln.org', name: 'Ludhiana Block Admin 2', role: UserRole.BLOCK_ADMIN, stateCode: 'PB', districtCode: 'LDH', blockCode: 'LDH-02' },
      { id: 'u4_amb2', email: 'block.amb-02@fln.org', name: 'Ambala Block Admin 2', role: UserRole.BLOCK_ADMIN, stateCode: 'HR', districtCode: 'AMB', blockCode: 'AMB-02' },
      // Principals for new schools
      { id: 'u5_bth', email: 'gps-bth-006@fln.org', name: 'GPS Bathinda Principal', role: UserRole.SCHOOL, schoolId: 'gps-bth-006' },
      { id: 'u5_asr', email: 'gps-asr-007@fln.org', name: 'GPS Amritsar Principal', role: UserRole.SCHOOL, schoolId: 'gps-asr-007' },
      { id: 'u5_pkl', email: 'gps-pkl-008@fln.org', name: 'GPS Panchkula Principal', role: UserRole.SCHOOL, schoolId: 'gps-pkl-008' },
      { id: 'u5_jai2', email: 'gps-jai2-009@fln.org', name: 'GPS Jaipur Rural Principal', role: UserRole.SCHOOL, schoolId: 'gps-jai2-009' },
      { id: 'u5_uda', email: 'gps-uda-010@fln.org', name: 'GPS Udaipur Principal', role: UserRole.SCHOOL, schoolId: 'gps-uda-010' },
      { id: 'u5_lko2', email: 'gps-lko2-011@fln.org', name: 'GPS Aliganj Principal', role: UserRole.SCHOOL, schoolId: 'gps-lko2-011' },
      { id: 'u5_knp', email: 'gps-knp-012@fln.org', name: 'GPS Kanpur Principal', role: UserRole.SCHOOL, schoolId: 'gps-knp-012' },
      { id: 'u5_ldh2', email: 'gps-pb-ldh2-013@fln.org', name: 'GPS Gill Village Principal', role: UserRole.SCHOOL, schoolId: 'gps-pb-ldh2-013' },
      { id: 'u5_amb2', email: 'gps-hr-amb2-014@fln.org', name: 'GPS Ambala South Principal', role: UserRole.SCHOOL, schoolId: 'gps-hr-amb2-014' },
      // Teachers for new schools
      { id: 'u6_bth_a', email: 'gps-bth-006.t01@fln.org', name: 'Harpreet Kaur (Teacher)', role: UserRole.TEACHER, schoolId: 'gps-bth-006' },
      { id: 'u6_bth_b', email: 'gps-bth-006.t02@fln.org', name: 'Jaswant Singh (Teacher)', role: UserRole.TEACHER, schoolId: 'gps-bth-006' },
      { id: 'u6_asr', email: 'gps-asr-007.t01@fln.org', name: 'Gurvinder Singh (Teacher)', role: UserRole.TEACHER, schoolId: 'gps-asr-007' },
      { id: 'u6_pkl_a', email: 'gps-pkl-008.t01@fln.org', name: 'Kavita Sharma (Teacher)', role: UserRole.TEACHER, schoolId: 'gps-pkl-008' },
      { id: 'u6_pkl_b', email: 'gps-pkl-008.t02@fln.org', name: 'Rajesh Kumar (Teacher)', role: UserRole.TEACHER, schoolId: 'gps-pkl-008' },
      { id: 'u6_jai2', email: 'gps-jai2-009.t01@fln.org', name: 'Ravi Verma (Teacher)', role: UserRole.TEACHER, schoolId: 'gps-jai2-009' },
      { id: 'u6_uda_a', email: 'gps-uda-010.t01@fln.org', name: 'Madhu Saxena (Teacher)', role: UserRole.TEACHER, schoolId: 'gps-uda-010' },
      { id: 'u6_uda_b', email: 'gps-uda-010.t02@fln.org', name: 'Prakash Choudhary (Teacher)', role: UserRole.TEACHER, schoolId: 'gps-uda-010' },
      { id: 'u6_lko2', email: 'gps-lko2-011.t01@fln.org', name: 'Alok Mishra (Teacher)', role: UserRole.TEACHER, schoolId: 'gps-lko2-011' },
      { id: 'u6_knp', email: 'gps-knp-012.t01@fln.org', name: 'Sunita Devi (Teacher)', role: UserRole.TEACHER, schoolId: 'gps-knp-012' },
      { id: 'u6_ldh2', email: 'gps-pb-ldh2-013.t01@fln.org', name: 'Balwinder Kaur (Teacher)', role: UserRole.TEACHER, schoolId: 'gps-pb-ldh2-013' },
      { id: 'u6_amb2', email: 'gps-hr-amb2-014.t01@fln.org', name: 'Nisha Rani (Teacher)', role: UserRole.TEACHER, schoolId: 'gps-hr-amb2-014' },
      // Volunteers for new low-strength schools
      { id: 'u7_asr', email: 'vol.asr@fln.org', name: 'Mandeep Kaur (Volunteer)', role: UserRole.VOLUNTEER, assignedSchools: ['gps-asr-007'] },
      { id: 'u7_jai2_vol', email: 'vol.jai2@fln.org', name: 'Deepak Sharma (Volunteer)', role: UserRole.VOLUNTEER, assignedSchools: ['gps-jai2-009'] },
      { id: 'u7_knp_vol', email: 'vol.knp@fln.org', name: 'Anita Singh (Volunteer)', role: UserRole.VOLUNTEER, assignedSchools: ['gps-knp-012'] },
      { id: 'u7_ldh2_vol', email: 'vol.ldh2@fln.org', name: 'Gurpreet Kaur (Volunteer)', role: UserRole.VOLUNTEER, assignedSchools: ['gps-pb-ldh2-013'] }
    ];

    const classes: ClassGroup[] = [
      { id: 'c1', schoolId: 'gps-mt-001', className: 'Class 2', section: 'A', teacherId: 'u6' },
      { id: 'c2', schoolId: 'gps-mt-001', className: 'Class 3', section: 'A', teacherId: 'u6' },
      { id: 'c3', schoolId: 'gps-vl-002', className: 'Class 2', section: 'A', teacherId: '' },
      { id: 'c4', schoolId: 'gps-amb-003', className: 'Class 3', section: 'A', teacherId: 'u6_amb' },
      { id: 'c5', schoolId: 'gps-jai-004', className: 'Class 4', section: 'A', teacherId: 'u6_jai' },
      { id: 'c6', schoolId: 'gps-lko-005', className: 'Class 3', section: 'A', teacherId: 'u6_lko' },
      { id: 'c7', schoolId: 'gps-bth-006', className: 'Class 3', section: 'A', teacherId: 'u6_bth_a' },
      { id: 'c8', schoolId: 'gps-bth-006', className: 'Class 4', section: 'A', teacherId: 'u6_bth_b' },
      { id: 'c9', schoolId: 'gps-asr-007', className: 'Class 2', section: 'A', teacherId: 'u6_asr' },
      { id: 'c10', schoolId: 'gps-pkl-008', className: 'Class 3', section: 'A', teacherId: 'u6_pkl_a' },
      { id: 'c11', schoolId: 'gps-pkl-008', className: 'Class 4', section: 'A', teacherId: 'u6_pkl_b' },
      { id: 'c12', schoolId: 'gps-jai2-009', className: 'Class 2', section: 'A', teacherId: 'u6_jai2' },
      { id: 'c13', schoolId: 'gps-uda-010', className: 'Class 4', section: 'A', teacherId: 'u6_uda_a' },
      { id: 'c14', schoolId: 'gps-uda-010', className: 'Class 3', section: 'A', teacherId: 'u6_uda_b' },
      { id: 'c15', schoolId: 'gps-lko2-011', className: 'Class 2', section: 'A', teacherId: 'u6_lko2' },
      { id: 'c16', schoolId: 'gps-lko2-011', className: 'Class 3', section: 'A', teacherId: 'u6_lko2' },
      { id: 'c17', schoolId: 'gps-knp-012', className: 'Class 2', section: 'A', teacherId: 'u6_knp' },
      { id: 'c18', schoolId: 'gps-pb-ldh2-013', className: 'Class 2', section: 'A', teacherId: 'u6_ldh2' },
      { id: 'c19', schoolId: 'gps-hr-amb2-014', className: 'Class 3', section: 'A', teacherId: 'u6_amb2' },
      { id: 'c20', schoolId: 'gps-mt-001', className: 'Class 4', section: 'A', teacherId: 'u6' },
      { id: 'c21', schoolId: 'gps-vl-002', className: 'Class 3', section: 'B', teacherId: '' },
      { id: 'c22', schoolId: 'gps-mt-001', className: 'Class 4', section: 'B', teacherId: 'u6' }
    ];

    const students: Student[] = [];

    const seedQuestions = this.getSeedQuestions();

    // --- Preseeded Worksheet Variations ---
    const worksheets: Worksheet[] = [
      {
        id: 'WS_1001',
        classId: 'c1',
        className: 'Class 2',
        section: 'A',
        schoolId: 'gps-mt-001',
        generatedByRole: UserRole.TEACHER,
        generatedByEmail: 'gps-mt-001.t01@fln.org',
        cycle: 'Baseline',
        date: '2026-06-15',
        questions: [
          { ...seedQuestions[0], question_id: 's1_L1_Q1', question: '[For Amanpreet Singh - Level 2] Count the apples...' },
          { ...seedQuestions[2], question_id: 's1_L2_Q1', question: '[For Amanpreet Singh - Level 2] Calculate: 3 + 4...' },
          { ...seedQuestions[1], question_id: 's2_L1_Q2', question: '[For Simran Kaur - Level 3] Count the circles...' },
          { ...seedQuestions[4], question_id: 's2_L3_Q1', question: '[For Simran Kaur - Level 3] If a pencil is 8 centimeters...' }
        ],
        locks: {
          locked: true,
          lockedByRole: UserRole.TEACHER,
          lockedByEmail: 'gps-mt-001.t01@fln.org',
          timestamp: '2026-06-15T09:00:00Z'
        },
        timing: {
          examDate: '2026-06-15',
          printWindowStart: '2026-06-15T09:00:00Z',
          printWindowEnd: '2026-06-15T10:00:00Z',
          examWindowStart: '2026-06-15T10:00:00Z',
          examWindowEnd: '2026-06-15T10:45:00Z',
          submissionWindowEnd: '2026-06-15T11:45:00Z'
        },
        delayLogs: {
          delayedAttemptsCount: 0,
          submittingTeachers: []
        }
      },
      {
        id: 'WS_1002',
        classId: 'c4',
        className: 'Class 3',
        section: 'A',
        schoolId: 'gps-amb-003',
        generatedByRole: UserRole.TEACHER,
        generatedByEmail: 'gps-amb-003.t01@fln.org',
        cycle: 'Baseline',
        date: '2026-06-18',
        questions: [
          { ...seedQuestions[4], question_id: 's6_L3_Q1', question: '[For Sandeep Kumar - Level 3] If a pencil is 8cm...' },
          { ...seedQuestions[3], question_id: 's8_L2_Q2', question: '[For Rajesh Saini - Level 2] Complete pattern: Red...' }
        ],
        locks: {
          locked: true,
          lockedByRole: UserRole.TEACHER,
          lockedByEmail: 'gps-amb-003.t01@fln.org',
          timestamp: '2026-06-18T09:00:00Z'
        },
        timing: {
          examDate: '2026-06-18',
          printWindowStart: '2026-06-18T09:00:00Z',
          printWindowEnd: '2026-06-18T10:00:00Z',
          examWindowStart: '2026-06-18T10:00:00Z',
          examWindowEnd: '2026-06-18T10:45:00Z',
          submissionWindowEnd: '2026-06-18T11:45:00Z'
        },
        delayLogs: {
          delayedAttemptsCount: 0,
          submittingTeachers: []
        }
      },
      {
        id: 'WS_1003',
        classId: 'c2',
        className: 'Class 3',
        section: 'A',
        schoolId: 'gps-mt-001',
        generatedByRole: UserRole.TEACHER,
        generatedByEmail: 'gps-mt-001.t01@fln.org',
        cycle: 'Mid-year',
        date: '2026-07-02',
        questions: [
          { ...seedQuestions[4], question_id: 's3_L3_Q1', question: '[For Gurpreet Singh - Level 4] Pencil centimeter subtraction...' }
        ],
        locks: {
          locked: true,
          lockedByRole: UserRole.TEACHER,
          lockedByEmail: 'gps-mt-001.t01@fln.org',
          timestamp: '2026-07-02T09:00:00Z'
        },
        timing: {
          examDate: '2026-07-02',
          printWindowStart: '2026-07-02T09:00:00Z',
          printWindowEnd: '2026-07-02T10:00:00Z',
          examWindowStart: '2026-07-02T10:00:00Z',
          examWindowEnd: '2026-07-02T10:45:00Z',
          submissionWindowEnd: '2026-07-02T11:45:00Z'
        },
        delayLogs: {
          delayedAttemptsCount: 1,
          submittingTeachers: ['gps-mt-001.t01@fln.org']
        }
      },
      {
        id: 'WS_1004',
        classId: 'c6',
        className: 'Class 3',
        section: 'A',
        schoolId: 'gps-lko-005',
        generatedByRole: UserRole.TEACHER,
        generatedByEmail: 'gps-lko-005.t01@fln.org',
        cycle: 'Baseline',
        date: '2026-06-22',
        questions: [
          { ...seedQuestions[4], question_id: 's14_L3_Q1', question: '[For Rajiv Malhotra - Level 3] Count matching pattern steps...' },
          { ...seedQuestions[3], question_id: 's15_L2_Q2', question: '[For Neha Agrawal - Level 2] Deduce the missing pattern...' }
        ],
        locks: {
          locked: true,
          lockedByRole: UserRole.TEACHER,
          lockedByEmail: 'gps-lko-005.t01@fln.org',
          timestamp: '2026-06-22T09:00:00Z'
        },
        timing: {
          examDate: '2026-06-22',
          printWindowStart: '2026-06-22T09:00:00Z',
          printWindowEnd: '2026-06-22T10:00:00Z',
          examWindowStart: '2026-06-22T10:00:00Z',
          examWindowEnd: '2026-06-22T10:45:00Z',
          submissionWindowEnd: '2026-06-22T11:45:00Z'
        },
        delayLogs: {
          delayedAttemptsCount: 0,
          submittingTeachers: []
        }
      },
      {
        id: 'WS_1005',
        classId: 'c7',
        className: 'Class 3',
        section: 'A',
        schoolId: 'gps-bth-006',
        generatedByRole: UserRole.TEACHER,
        generatedByEmail: 'gps-bth-006.t01@fln.org',
        cycle: 'Baseline',
        date: '2026-07-01',
        questions: [
          { ...seedQuestions[0], question_id: 's18_L1_Q1', question: '[For Kavya Reddy - Level 8] Counting objects...' },
          { ...seedQuestions[4], question_id: 's40_L3_Q1', question: '[For Simranjit Kaur - Level 2] Pencil subtraction...' },
          { ...seedQuestions[6], question_id: 's28_L4_Q1', question: '[For Myra Choudhary - Level 6] Money change...' }
        ],
        locks: {
          locked: true,
          lockedByRole: UserRole.TEACHER,
          lockedByEmail: 'gps-bth-006.t01@fln.org',
          timestamp: '2026-07-01T09:00:00Z'
        },
        timing: {
          examDate: '2026-07-01',
          printWindowStart: '2026-07-01T09:00:00Z',
          printWindowEnd: '2026-07-01T10:00:00Z',
          examWindowStart: '2026-07-01T10:00:00Z',
          examWindowEnd: '2026-07-01T10:45:00Z',
          submissionWindowEnd: '2026-07-01T11:45:00Z'
        },
        delayLogs: {
          delayedAttemptsCount: 0,
          submittingTeachers: []
        }
      },
      {
        id: 'WS_1006',
        classId: 'c10',
        className: 'Class 3',
        section: 'A',
        schoolId: 'gps-pkl-008',
        generatedByRole: UserRole.TEACHER,
        generatedByEmail: 'gps-pkl-008.t01@fln.org',
        cycle: 'Baseline',
        date: '2026-07-03',
        questions: [
          { ...seedQuestions[3], question_id: 's22_L2_Q2', question: '[For Anika Gupta - Level 12] Pattern completion...' },
          { ...seedQuestions[7], question_id: 's30_L5_Q1', question: '[For Aadhya Iyer - Level 7] Multiplication...' }
        ],
        locks: {
          locked: true,
          lockedByRole: UserRole.TEACHER,
          lockedByEmail: 'gps-pkl-008.t01@fln.org',
          timestamp: '2026-07-03T09:00:00Z'
        },
        timing: {
          examDate: '2026-07-03',
          printWindowStart: '2026-07-03T09:00:00Z',
          printWindowEnd: '2026-07-03T10:00:00Z',
          examWindowStart: '2026-07-03T10:00:00Z',
          examWindowEnd: '2026-07-03T10:45:00Z',
          submissionWindowEnd: '2026-07-03T11:45:00Z'
        },
        delayLogs: {
          delayedAttemptsCount: 0,
          submittingTeachers: []
        }
      },
      {
        id: 'WS_1007',
        classId: 'c2',
        className: 'Class 3',
        section: 'A',
        schoolId: 'gps-mt-001',
        generatedByRole: UserRole.TEACHER,
        generatedByEmail: 'gps-mt-001.t01@fln.org',
        cycle: 'Mid-year',
        date: '2026-07-02',
        questions: [
          { ...seedQuestions[5], question_id: 's20_L4_Q1', question: '[For Pooja Verma - Level 10] Fraction pizza...' },
          { ...seedQuestions[6], question_id: 's24_L4_Q2', question: '[For Tanvi Bhatia - Level 15] Money change...' }
        ],
        locks: {
          locked: true,
          lockedByRole: UserRole.TEACHER,
          lockedByEmail: 'gps-mt-001.t01@fln.org',
          timestamp: '2026-07-02T09:00:00Z'
        },
        timing: {
          examDate: '2026-07-02',
          printWindowStart: '2026-07-02T09:00:00Z',
          printWindowEnd: '2026-07-02T10:00:00Z',
          examWindowStart: '2026-07-02T10:00:00Z',
          examWindowEnd: '2026-07-02T10:45:00Z',
          submissionWindowEnd: '2026-07-02T11:45:00Z'
        },
        delayLogs: {
          delayedAttemptsCount: 0,
          submittingTeachers: []
        }
      }
    ];

    const answerSubmissions: AnswerSubmission[] = [
      {
        id: 'sub_s1_1001',
        worksheetId: 'WS_1001',
        studentId: 's1',
        studentName: 'Amanpreet Singh',
        schoolId: 'gps-mt-001',
        classId: 'c1',
        submittedAt: '2026-06-15T11:10:00Z',
        isDelayed: false,
        answers: { 's1_L1_Q1': '5', 's1_L2_Q1': '7' }
      },
      {
        id: 'sub_s6_1002',
        worksheetId: 'WS_1002',
        studentId: 's6',
        studentName: 'Sandeep Kumar',
        schoolId: 'gps-amb-003',
        classId: 'c4',
        submittedAt: '2026-06-18T11:30:00Z',
        isDelayed: false,
        answers: { 's6_L3_Q1': '5' }
      },
      {
        id: 'sub_s14_1004',
        worksheetId: 'WS_1004',
        studentId: 's14',
        studentName: 'Rajiv Malhotra',
        schoolId: 'gps-lko-005',
        classId: 'c6',
        submittedAt: '2026-06-22T11:20:00Z',
        isDelayed: false,
        answers: { 's14_L3_Q1': '8' }
      },
      {
        id: 'sub_s18_1005',
        worksheetId: 'WS_1005',
        studentId: 's18',
        studentName: 'Kavya Reddy',
        schoolId: 'gps-bth-006',
        classId: 'c7',
        submittedAt: '2026-07-01T11:05:00Z',
        isDelayed: false,
        answers: { 's18_L1_Q1': '5', 's40_L3_Q1': '5', 's28_L4_Q1': '35' }
      },
      {
        id: 'sub_s22_1006',
        worksheetId: 'WS_1006',
        studentId: 's22',
        studentName: 'Anika Gupta',
        schoolId: 'gps-pkl-008',
        classId: 'c10',
        submittedAt: '2026-07-03T11:20:00Z',
        isDelayed: false,
        answers: { 's22_L2_Q2': 'Blue Circle', 's30_L5_Q1': '60' }
      },
      {
        id: 'sub_s20_1007',
        worksheetId: 'WS_1007',
        studentId: 's20',
        studentName: 'Pooja Verma',
        schoolId: 'gps-mt-001',
        classId: 'c2',
        submittedAt: '2026-07-02T11:15:00Z',
        isDelayed: false,
        answers: { 's20_L4_Q1': '3/4', 's24_L4_Q2': '35' }
      }
    ];

    const evaluationReports: EvaluationReport[] = [
      {
        id: 'rep_s1_1001',
        studentId: 's1',
        worksheetId: 'WS_1001',
        score: 100,
        totalQuestions: 2,
        conceptMastery: { 'Number Sense': 'Strong', 'Number Operations': 'Strong' },
        narrative: 'Amanpreet demonstrated absolute competence in counting objects and doing simple addition arithmetic.',
        recommendedLevel: 2,
        timestamp: '2026-06-15T11:15:00Z'
      },
      {
        id: 'rep_s6_1002',
        studentId: 's6',
        worksheetId: 'WS_1002',
        score: 100,
        totalQuestions: 1,
        conceptMastery: { 'Measurement': 'Strong' },
        narrative: 'Sandeep exhibits strong capacity to compute lengths and carry out simple subtraction comparisons.',
        recommendedLevel: 3,
        timestamp: '2026-06-18T11:35:00Z'
      },
      {
        id: 'rep_s14_1004',
        studentId: 's14',
        worksheetId: 'WS_1004',
        score: 100,
        totalQuestions: 1,
        conceptMastery: { 'Patterns': 'Strong' },
        narrative: 'Rajiv displays flawless sequencing and pattern recognition matching Level 3 descriptors.',
        recommendedLevel: 3,
        timestamp: '2026-06-22T11:30:00Z'
      },
      {
        id: 'rep_s18_1005',
        studentId: 's18',
        worksheetId: 'WS_1005',
        score: 67,
        totalQuestions: 3,
        conceptMastery: { 'Number Sense': 'Strong', 'Measurement': 'Strong', 'Money': 'Needs Practice' },
        narrative: 'Kavya shows strength in counting and measurement but needs more practice with money transactions.',
        recommendedLevel: 8,
        timestamp: '2026-07-01T11:15:00Z'
      },
      {
        id: 'rep_s22_1006',
        studentId: 's22',
        worksheetId: 'WS_1006',
        score: 100,
        totalQuestions: 2,
        conceptMastery: { 'Patterns': 'Strong', 'Number Operations': 'Strong' },
        narrative: 'Anika demonstrated flawless pattern recognition and multiplication skills.',
        recommendedLevel: 12,
        timestamp: '2026-07-03T11:25:00Z'
      },
      {
        id: 'rep_s20_1007',
        studentId: 's20',
        worksheetId: 'WS_1007',
        score: 100,
        totalQuestions: 2,
        conceptMastery: { 'Fractions': 'Strong', 'Money': 'Strong' },
        narrative: 'Pooja displays strong conceptual understanding of fractions and monetary calculations.',
        recommendedLevel: 10,
        timestamp: '2026-07-02T11:20:00Z'
      },
      {
        id: 'rep_s24_diag',
        studentId: 's24',
        worksheetId: 'diagnostic',
        score: 5,
        totalQuestions: 6,
        conceptMastery: { 'Number Sense': 'Strong', 'Shapes': 'Strong', 'Fractions': 'Strong' },
        narrative: 'Tanvi performed very well on the diagnostic, demonstrating strong number sense.',
        recommendedLevel: 15,
        recommendedSubLevel: 0,
        timestamp: '2026-07-01T10:00:00Z'
      }
    ];

    const logbook: LogEntry[] = [
      {
        id: 'log1',
        timestamp: '2026-07-05T10:30:00Z',
        schoolId: 'gps-mt-001',
        schoolName: 'GPS Model Town Ludhiana',
        userId: 'u6',
        userEmail: 'gps-mt-001.t01@fln.org',
        userRole: UserRole.TEACHER,
        activityType: 'print',
        status: 'Success',
        details: 'Downloaded printed worksheets for Amanpreet Singh and Simran Kaur'
      },
      {
        id: 'log2',
        timestamp: '2026-07-04T14:15:00Z',
        schoolId: 'gps-vl-002',
        schoolName: 'GPS Rural Village Moga',
        userId: 'u7',
        userEmail: 'vol.rahul@fln.org',
        userRole: UserRole.VOLUNTEER,
        activityType: 'scan',
        status: 'Success',
        details: 'Uploaded evaluation scan sheet for Manpreet Lal (Class 2)'
      },
      {
        id: 'log3',
        timestamp: '2026-07-03T11:00:00Z',
        schoolId: 'gps-amb-003',
        schoolName: 'GPS Cantt Ambala',
        userId: 'u6_amb',
        userEmail: 'gps-amb-003.t01@fln.org',
        userRole: UserRole.TEACHER,
        activityType: 'verify',
        status: 'Success',
        details: 'Onboarded and validated Aadhar details for student Sneha Sharma'
      },
      {
        id: 'log4',
        timestamp: '2026-07-02T09:45:00Z',
        schoolId: 'gps-jai-004',
        schoolName: 'GPS Govind Dev Jaipur',
        userId: 'u6_jai',
        userEmail: 'gps-jai-004.t01@fln.org',
        userRole: UserRole.TEACHER,
        activityType: 'conduct',
        status: 'Success',
        details: 'Completed diagnostic mathematical evaluation of Priya Patel'
      },
      {
        id: 'log5',
        timestamp: '2026-07-01T15:20:00Z',
        schoolId: 'gps-vl-002',
        schoolName: 'GPS Rural Village Moga',
        userId: 'u7_amit',
        userEmail: 'vol.amit@fln.org',
        userRole: UserRole.VOLUNTEER,
        activityType: 'scan',
        status: 'Success',
        details: 'Scanned baseline arithmetic worksheet for student Kabir Mehra'
      },
      {
        id: 'log6',
        timestamp: '2026-07-04T16:30:00Z',
        schoolId: 'gps-lko-005',
        schoolName: 'GPS Hazratganj Lucknow',
        userId: 'u6_lko',
        userEmail: 'gps-lko-005.t01@fln.org',
        userRole: UserRole.TEACHER,
        activityType: 'conduct',
        status: 'Success',
        details: 'Evaluated personalized worksheet patterns for student Rajiv Malhotra'
      },
      {
        id: 'log7',
        timestamp: '2026-07-03T10:15:00Z',
        schoolId: 'gps-lko-005',
        schoolName: 'GPS Hazratganj Lucknow',
        userId: 'u7_sneha',
        userEmail: 'vol.up_sneha@fln.org',
        userRole: UserRole.VOLUNTEER,
        activityType: 'verify',
        status: 'Success',
        details: 'Onboarded and validated Aadhar details for student Neha Agrawal'
      },
      {
        id: 'log8',
        timestamp: '2026-07-04T09:45:00Z',
        schoolId: 'gps-bth-006',
        schoolName: 'GPS Bathinda City',
        userId: 'u6_bth_a',
        userEmail: 'gps-bth-006.t01@fln.org',
        userRole: UserRole.TEACHER,
        activityType: 'conduct',
        status: 'Success',
        details: 'Conducted baseline diagnostic for Class 3 students in Bathinda'
      },
      {
        id: 'log9',
        timestamp: '2026-07-05T15:20:00Z',
        schoolId: 'gps-pkl-008',
        schoolName: 'GPS Panchkula Sector',
        userId: 'u6_pkl_a',
        userEmail: 'gps-pkl-008.t01@fln.org',
        userRole: UserRole.TEACHER,
        activityType: 'scan',
        status: 'Success',
        details: 'Scored and evaluated worksheets for Class 3 students (Anika Gupta, Aadhya Iyer)'
      },
      {
        id: 'log10',
        timestamp: '2026-07-06T08:15:00Z',
        schoolId: 'gps-asr-007',
        schoolName: 'GPS Amritsar Golden',
        userId: 'u7_asr',
        userEmail: 'vol.asr@fln.org',
        userRole: UserRole.VOLUNTEER,
        activityType: 'verify',
        status: 'Success',
        details: 'Onboarded new students Navjot Singh and Harleen Kaur at Amritsar low-strength school'
      },
      {
        id: 'log11',
        timestamp: '2026-07-05T10:00:00Z',
        schoolId: 'gps-jai2-009',
        schoolName: 'GPS Jaipur Rural North',
        userId: 'u6_jai2',
        userEmail: 'gps-jai2-009.t01@fln.org',
        userRole: UserRole.TEACHER,
        activityType: 'conduct',
        status: 'Success',
        details: 'Ran diagnostic assessment for Class 2 students Lakshya Sharma and Ritu Yadav'
      },
      {
        id: 'log12',
        timestamp: '2026-07-06T11:30:00Z',
        schoolId: 'gps-mt-001',
        schoolName: 'GPS Model Town Ludhiana',
        userId: 'u6',
        userEmail: 'gps-mt-001.t01@fln.org',
        userRole: UserRole.TEACHER,
        activityType: 'download',
        status: 'Delayed',
        details: 'SUBMISSION DELAYED: Answers for Gurpreet Singh uploaded after the 1-hour submission window closed.'
      },
      {
        id: 'log13',
        timestamp: '2026-07-06T14:00:00Z',
        schoolId: 'gps-uda-010',
        schoolName: 'GPS Udaipur City',
        userId: 'u6_uda_a',
        userEmail: 'gps-uda-010.t01@fln.org',
        userRole: UserRole.TEACHER,
        activityType: 'print',
        status: 'Success',
        details: 'Printed personalized worksheets for Class 4 students Arush Bhat and others'
      }
    ];

    const tickets: Ticket[] = [
      {
        id: 'tkt1',
        userId: 'u6',
        userEmail: 'gps-mt-001.t01@fln.org',
        userName: 'Ritu Sharma',
        userRole: UserRole.TEACHER,
        type: 'curriculum',
        subject: 'Ambiguous wording in Level 3 patterns question',
        description: 'The shapes used in the patterns question of Level 3 are hard for Class 2 children to identify. Recommend replacing with simpler fruit SVGs.',
        status: 'Open',
        createdAt: '2026-07-04T09:00:00Z'
      },
      {
        id: 'tkt2',
        userId: 'u6_amb',
        userEmail: 'gps-amb-003.t01@fln.org',
        userName: 'Meena Kumari',
        userRole: UserRole.TEACHER,
        type: 'curriculum',
        subject: 'Measurement Level 3 cuts question difficulty',
        description: 'The pencil cutting subtraction is highly appropriate but students need concrete centimeter rulers to visualize better. Can we suggest visual graphics?',
        status: 'Reviewed',
        createdAt: '2026-07-03T14:00:00Z'
      },
      {
        id: 'tkt3',
        userId: 'u6_bth_a',
        userEmail: 'gps-bth-006.t01@fln.org',
        userName: 'Harpreet Kaur',
        userRole: UserRole.TEACHER,
        type: 'general',
        subject: 'Delay in receiving printed worksheets for Bathinda school',
        description: 'The printed worksheets for Class 3 students in Bathinda have not arrived. Please check logistics.',
        status: 'Open',
        createdAt: '2026-07-05T14:30:00Z'
      },
      {
        id: 'tkt4',
        userId: 'u6_pkl_a',
        userEmail: 'gps-pkl-008.t01@fln.org',
        userName: 'Kavita Sharma',
        userRole: UserRole.TEACHER,
        type: 'curriculum',
        subject: 'Level 8 subtraction questions too advanced for Class 2',
        description: 'Some students placed at Level 8 are struggling with subtraction with borrowing. Suggest revisiting the difficulty curve.',
        status: 'Reviewed',
        createdAt: '2026-07-03T11:00:00Z'
      },
      {
        id: 'tkt5',
        userId: 'u7',
        userEmail: 'vol.rahul@fln.org',
        userName: 'Rahul Kumar',
        userRole: UserRole.VOLUNTEER,
        type: 'general',
        subject: 'Volunteer access to diagnostic tools in Moga village',
        description: 'Unable to generate diagnostic worksheets for students at GPS Rural Village Moga. Access restricted.',
        status: 'Open',
        createdAt: '2026-07-06T09:15:00Z'
      }
    ];

    const announcements: Announcement[] = [
      {
        id: 'ann1',
        title: 'Mid-Year Assessment Cycle Starts Next Week',
        message: 'All district coordinators and school principals are requested to complete student rosters and run onboarding diagnostics. The Mid-year paper generation will unlock on July 12th.',
        isUrgent: true,
        authorEmail: 'superadmin@fln.org',
        createdAt: '2026-07-05T12:00:00Z'
      },
      {
        id: 'ann2',
        title: 'Bathinda District Performance Alert',
        message: 'Bathinda district is flagged as lagging with only 38% average certification rate. All block admins must prioritize remedial interventions in low-strength schools.',
        isUrgent: true,
        authorEmail: 'admin.pb@fln.org',
        createdAt: '2026-07-06T08:00:00Z'
      },
      {
        id: 'ann3',
        title: 'New Teacher Onboarding Training Sessions',
        message: 'Virtual training sessions for newly onboarded teachers will be held on July 15-16, 2026. Attendance is mandatory for all teachers from new schools.',
        isUrgent: false,
        authorEmail: 'superadmin@fln.org',
        createdAt: '2026-07-04T10:00:00Z'
      }
    ];

    return {
      users,
      schools,
      classes,
      students,
      questions: seedQuestions,
      worksheets,
      answerSubmissions,
      evaluationReports,
      tickets,
      logbook,
      announcements
    };
  }
}

export const dbStore = new DBStore();
