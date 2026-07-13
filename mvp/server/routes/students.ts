import { Router, Request, Response } from 'express';
import { Student } from '../models/Student';
import { requireAuth, requireTeacherOrVolunteer } from '../middleware/auth';

function userSchoolScope(user: any): string[] {
  if (!user) return [];
  if (user.role === 'volunteer') {
    return Array.isArray(user.assignedSchools) ? user.assignedSchools : [];
  }
  return user.schoolId ? [user.schoolId] : [];
}

const router = Router();

const NAME_REGEX = /^[\p{L} .'\-]{2,100}$/u;
const AADHAAR_REGEX = /^\d{12}$/;
const BIRTH_CERT_REGEX = /^[A-Z0-9]{8,25}$/;

function computeAgeYears(dobIso: string): number {
  const dob = new Date(dobIso);
  if (isNaN(dob.getTime())) return -1;
  return (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
}

function maskAadhaar(raw: string): string {
  if (!raw) return raw;
  if (AADHAAR_REGEX.test(raw)) return 'X'.repeat(8) + raw.slice(-4);
  if (raw.length > 4) return 'X'.repeat(raw.length - 4) + raw.slice(-4);
  return raw;
}

function unmaskAadhaar(raw: string): string {
  return raw.replace(/^X+/g, '');
}

// GET /students — List all students with search, filter, pagination
router.get('/', requireAuth, requireTeacherOrVolunteer, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const {
      search,
      status,
      class: classFilter,
      section,
      page = '1',
      limit = '25',
      sortBy = 'studentName',
      sortDir = 'asc'
    } = req.query as Record<string, string>;

    const query: any = { schoolCode: { $in: userSchoolScope(user) } };

    if (status && status !== 'all') {
      query.status = status;
    }

    if (classFilter) {
      const parsed = parseInt(classFilter, 10);
      if (!isNaN(parsed)) query.class = parsed;
    }

    if (section) {
      query.section = section;
    }

    if (search) {
      const s = String(search).trim();
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.$or = [
          { studentName: { $regex: escaped, $options: 'i' } },
          { name: { $regex: escaped, $options: 'i' } },
          { parentName: { $regex: escaped, $options: 'i' } },
          { aadhaarNumber: { $regex: escaped, $options: 'i' } },
          { aadharMasked: { $regex: escaped, $options: 'i' } },
          { _id: s.length === 24 ? s : '' }
        ];
      }
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const skip = (pageNum - 1) * limitNum;

    const sortObj: any = {};
    const allowedSortFields = ['studentName', 'name', 'dateOfBirth', 'class', 'section', 'parentName', 'status', 'createdAt'];
    const field = allowedSortFields.includes(sortBy) ? sortBy : 'studentName';
    sortObj[field] = sortDir === 'desc' ? -1 : 1;

    const [students, total] = await Promise.all([
      Student.find(query).sort(sortObj).skip(skip).limit(limitNum),
      Student.countDocuments(query)
    ]);

    res.json({
      students,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (err: any) {
    console.error('GET /students error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /students/search — Search students (alias for search params on GET /students)
router.get('/search', requireAuth, requireTeacherOrVolunteer, async (req: Request, res: Response) => {
  req.query = { ...req.query, search: req.query.q as string || req.query.search as string || '' };
  const { students, total } = await (async () => {
    const user = (req as any).user;
    const q = String(req.query.search || '').trim();
    const pageNum = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '25'), 10)));

    const query: any = { schoolCode: { $in: userSchoolScope(user) } };
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { studentName: { $regex: escaped, $options: 'i' } },
        { name: { $regex: escaped, $options: 'i' } },
        { parentName: { $regex: escaped, $options: 'i' } },
        { aadhaarNumber: { $regex: escaped, $options: 'i' } },
        { _id: q.length === 24 ? q : '' }
      ];
    }

    const [students, total] = await Promise.all([
      Student.find(query).skip((pageNum - 1) * limitNum).limit(limitNum),
      Student.countDocuments(query)
    ]);
    return { students, total };
  })();

  res.json({ students, total });
});

// POST /students — Create a new student
router.post('/', requireAuth, requireTeacherOrVolunteer, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const body = req.body || {};

    const studentName = String(body.studentName ?? body.name ?? '').trim();
    const aadhaarRaw = String(body.aadhaarNumber ?? body.aadharNumber ?? '');
    const aadhaarNumber = aadhaarRaw.replace(/\s+/g, '').toUpperCase();
    const section = String(body.section ?? '').trim();
    const parentName = String(body.parentName ?? '').trim();

    let klass = 0;
    if (typeof body.class === 'number') {
      klass = body.class;
    } else if (typeof body.class === 'string' && body.class) {
      const m = body.class.match(/\d+/);
      if (m) klass = parseInt(m[0], 10);
    }

    let dateOfBirth: string = body.dateOfBirth;
    if (!dateOfBirth && body.age) {
      const ageY = parseInt(String(body.age), 10);
      if (!isNaN(ageY)) {
        const today = new Date();
        dateOfBirth = `${today.getFullYear() - ageY}-01-01`;
      }
    }

    const gender: 'male' | 'female' | 'other' = (['male', 'female', 'other'] as const).includes(body.gender)
      ? body.gender
      : 'other';

    const schoolCode =
      user.role === 'volunteer'
        ? (Array.isArray(user.assignedSchools) ? user.assignedSchools[0] : '')
        : user.schoolId;
    if (!schoolCode) {
      res.status(403).json({ error: 'Your account is not assigned to a school.' });
      return;
    }

    // Validation
    if (!studentName) {
      res.status(400).json({ error: 'Student name is required.' });
      return;
    }
    if (studentName.length < 2 || studentName.length > 100) {
      res.status(400).json({ error: 'Student name must be 2–100 characters.' });
      return;
    }
    if (!dateOfBirth) {
      res.status(400).json({ error: 'Date of birth is required.' });
      return;
    }
    if (!aadhaarNumber) {
      res.status(400).json({ error: 'Aadhaar / Birth Certificate number is required.' });
      return;
    }
    if (!AADHAAR_REGEX.test(aadhaarNumber) && !BIRTH_CERT_REGEX.test(aadhaarNumber)) {
      res.status(400).json({
        error: 'Invalid Aadhaar / Birth Certificate. Use a 12-digit Aadhaar or 8–25 char alphanumeric Birth Certificate.'
      });
      return;
    }
    if (!parentName) {
      res.status(400).json({ error: 'Parent / Guardian name is required.' });
      return;
    }
    if (parentName.length < 2 || parentName.length > 100) {
      res.status(400).json({ error: 'Parent / Guardian name must be 2–100 characters.' });
      return;
    }
    if (!klass || klass < 1 || klass > 12) {
      res.status(400).json({ error: 'Class must be an integer 1–12.' });
      return;
    }
    if (!section || section.length < 1 || section.length > 5) {
      res.status(400).json({ error: 'Section is required.' });
      return;
    }

    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime())) {
      res.status(400).json({ error: 'Invalid date of birth format.' });
      return;
    }
    if (dob.getTime() > Date.now()) {
      res.status(400).json({ error: 'Date of birth must be in the past.' });
      return;
    }
    const ageY = computeAgeYears(dateOfBirth);
    if (ageY < 3 || ageY > 18) {
      res.status(400).json({ error: 'Student age must be between 3 and 18 years.' });
      return;
    }

    // Duplicate guard: unique (aadhaarNumber, schoolCode)
    const existing = await Student.findOne({ aadhaarNumber, schoolCode });
    if (existing) {
      res.status(409).json({
        error: 'A student with this Aadhaar / Birth Cert already exists in your school.'
      });
      return;
    }

    const now = new Date();
    const student = new Student({
      studentName,
      dateOfBirth,
      gender,
      aadhaarNumber,
      parentName,
      class: klass,
      section,
      schoolCode,
      status: 'active',
      createdBy: user.id,
      createdAt: now,
      name: studentName,
      age: Math.floor(ageY),
      classGroup: `Class ${klass}`,
      schoolId: schoolCode,
      aadharMasked: aadhaarNumber,
      currentLevel: 1,
      currentSubLevel: 0,
      targetLevel: 2,
      streak: 0
    });

    await student.save();

    res.status(201).json(student.toJSON());
  } catch (err: any) {
    if (err?.code === 11000) {
      res.status(409).json({
        error: 'A student with this Aadhaar / Birth Cert already exists in your school.'
      });
      return;
    }
    console.error('POST /students error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /students/upload — Bulk upload (CSV JSON array)
router.post('/upload', requireAuth, requireTeacherOrVolunteer, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const schoolCode = user.schoolId;
    if (!schoolCode) {
      res.status(403).json({ error: 'Not assigned to a school.' });
      return;
    }

    const { students: rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: 'students must be a non-empty array.' });
      return;
    }
    if (rows.length > 1000) {
      res.status(400).json({ error: 'Maximum 1000 students per bulk upload.' });
      return;
    }

    const results: { row: number; studentName: string; status: string; studentId?: string; error?: string }[] = [];
    let inserted = 0;
    let failed = 0;
    let duplicate = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const studentName = String(row.studentName || row.name || '').trim();
      const dateOfBirth = String(row.dateOfBirth || '').trim();
      const genderRaw = String(row.gender || '').trim().toLowerCase();
      const aadhaarRaw = String(row.aadhaarNumber || row.aadharNumber || '').trim();
      const aadhaarNumber = aadhaarRaw.replace(/\s+/g, '').toUpperCase();
      const parentName = String(row.parentName || row.parentGuardianName || '').trim();
      const section = String(row.section || '').trim();

      let klass = 0;
      if (typeof row.class === 'number') klass = row.class;
      else if (typeof row.class === 'string') {
        const m = row.class.match(/\d+/);
        if (m) klass = parseInt(m[0], 10);
      }

      const errors: string[] = [];
      if (!studentName) errors.push('Student name is required.');
      if (!dateOfBirth) errors.push('Date of birth is required.');
      if (!aadhaarNumber) errors.push('Aadhaar number is required.');
      if (!parentName) errors.push('Parent name is required.');
      if (!klass || klass < 1 || klass > 12) errors.push('Class must be 1-12.');
      if (!section) errors.push('Section is required.');

      if (errors.length > 0) {
        results.push({ row: i + 1, studentName, status: 'failed', error: errors[0] });
        failed++;
        continue;
      }

      const gender: 'male' | 'female' | 'other' = (['male', 'female', 'other'] as const).includes(genderRaw as any)
        ? genderRaw as any
        : 'other';

      const existing = await Student.findOne({ aadhaarNumber, schoolCode });
      if (existing) {
        results.push({ row: i + 1, studentName, status: 'duplicate', error: 'Already registered in your school.' });
        duplicate++;
        continue;
      }

      try {
        const student = new Student({
          studentName,
          dateOfBirth,
          gender,
          aadhaarNumber,
          parentName,
          class: klass,
          section,
          schoolCode,
          status: 'active',
          createdBy: user.id,
          createdAt: new Date(),
          name: studentName,
          classGroup: `Class ${klass}`,
          schoolId: schoolCode,
          aadharMasked: aadhaarNumber,
          currentLevel: 1,
          targetLevel: 2,
          streak: 0
        });
        await student.save();
        results.push({ row: i + 1, studentName, status: 'inserted', studentId: student._id.toString() });
        inserted++;
      } catch (saveErr: any) {
        if (saveErr?.code === 11000) {
          results.push({ row: i + 1, studentName, status: 'duplicate', error: 'Duplicate Aadhaar.' });
          duplicate++;
        } else {
          results.push({ row: i + 1, studentName, status: 'failed', error: saveErr.message });
          failed++;
        }
      }
    }

    res.json({ inserted, failed, duplicate, total: rows.length, results });
  } catch (err: any) {
    console.error('POST /students/upload error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT /students/:id — Update student
router.put('/:id', requireAuth, requireTeacherOrVolunteer, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const body = req.body || {};

    let student;
    try {
      student = await Student.findById(id);
    } catch {
      student = null;
    }
    if (!student) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    if (!userSchoolScope(user).includes(student.schoolCode)) {
      res.status(403).json({ error: 'You do not have access to this student.' });
      return;
    }

    const updates: any = {};

    if (body.studentName !== undefined) {
      const trimmed = String(body.studentName).trim();
      if (trimmed.length < 2 || trimmed.length > 100) {
        res.status(400).json({ error: 'Student name must be 2–100 characters.' });
        return;
      }
      updates.studentName = trimmed;
      updates.name = trimmed;
    }

    if (body.dateOfBirth !== undefined) {
      const dob = new Date(body.dateOfBirth);
      if (isNaN(dob.getTime())) {
        res.status(400).json({ error: 'Invalid date of birth.' });
        return;
      }
      if (dob.getTime() > Date.now()) {
        res.status(400).json({ error: 'Date of birth must be in the past.' });
        return;
      }
      const ageY = computeAgeYears(body.dateOfBirth);
      if (ageY < 3 || ageY > 18) {
        res.status(400).json({ error: 'Student age must be between 3 and 18.' });
        return;
      }
      updates.dateOfBirth = body.dateOfBirth;
      updates.age = Math.floor(ageY);
    }

    if (body.gender !== undefined) {
      if (!['male', 'female', 'other'].includes(body.gender)) {
        res.status(400).json({ error: 'Invalid gender.' });
        return;
      }
      updates.gender = body.gender;
    }

    if (body.aadhaarNumber !== undefined) {
      const norm = String(body.aadhaarNumber).replace(/\s+/g, '').toUpperCase();
      if (!AADHAAR_REGEX.test(norm) && !BIRTH_CERT_REGEX.test(norm)) {
        res.status(400).json({ error: 'Invalid Aadhaar / Birth Certificate.' });
        return;
      }
      const dup = await Student.findOne({
        aadhaarNumber: norm,
        schoolCode: { $in: [student.schoolCode, ...userSchoolScope(user)] },
        _id: { $ne: student._id }
      });
      if (dup) {
        res.status(409).json({ error: 'A student with this Aadhaar already exists in your school.' });
        return;
      }
      updates.aadhaarNumber = norm;
      updates.aadharMasked = norm;
    }

    if (body.parentName !== undefined) {
      const trimmed = String(body.parentName).trim();
      if (trimmed.length < 2 || trimmed.length > 100) {
        res.status(400).json({ error: 'Parent / Guardian name must be 2–100 characters.' });
        return;
      }
      updates.parentName = trimmed;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No editable fields provided.' });
      return;
    }

    updates.updatedBy = user.id;
    updates.updatedAt = new Date();

    const updated = await Student.findByIdAndUpdate(id, { $set: updates }, { new: true });
    if (!updated) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    res.json(updated.toJSON());
  } catch (err: any) {
    console.error('PUT /students/:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /students/:id — Soft-delete (deactivate)
router.delete('/:id', requireAuth, requireTeacherOrVolunteer, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    let student;
    try {
      student = await Student.findById(id);
    } catch {
      student = null;
    }
    if (!student) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    if (!userSchoolScope(user).includes(student.schoolCode)) {
      res.status(403).json({ error: 'You do not have access to this student.' });
      return;
    }

    student.status = 'inactive';
    student.updatedBy = user.id;
    student.updatedAt = new Date();
    await student.save();

    res.json({ studentId: student._id.toString(), status: 'inactive' });
  } catch (err: any) {
    console.error('DELETE /students/:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /students/:id/reactivate — Reactivate a deactivated student
router.post('/:id/reactivate', requireAuth, requireTeacherOrVolunteer, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    let student;
    try {
      student = await Student.findById(id);
    } catch {
      student = null;
    }
    if (!student) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    if (!userSchoolScope(user).includes(student.schoolCode)) {
      res.status(403).json({ error: 'You do not have access to this student.' });
      return;
    }

    student.status = 'active';
    student.updatedBy = user.id;
    student.updatedAt = new Date();
    await student.save();

    res.json({ studentId: student._id.toString(), status: 'active' });
  } catch (err: any) {
    console.error('POST /students/:id/reactivate error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
