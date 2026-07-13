import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../middleware/auth';

jest.mock('../models/Student', () => {
  const docs: any[] = [];
  let idCounter = 0;

  // Wrap a raw doc object into one that has a save() method that mutates the store
  function wrap(raw: any, idx: number) {
    const wrapped: any = { ...raw };
    wrapped.save = jest.fn().mockImplementation(function (this: any) {
      docs[idx] = { ...raw };
      return Promise.resolve();
    });
    // Copy properties over but keep the save
    Object.defineProperty(wrapped, 'toJSON', {
      value() {
        return { studentId: raw._id, ...raw, aadhaarNumber: 'XXXXXXXX' + (raw.aadhaarNumber || '').slice(-4) };
      }
    });
    return wrapped;
  }

  // Build a query-like chain starting from a filtered set of indexes
  function queryChain(ids: number[]) {
    return {
      sort: () => ({
        skip: (n: number) => ({
          limit: (lim: number) => Promise.resolve(ids.slice(n).slice(0, lim).map((i, _pos) => wrap(docs[i], i)))
        }),
        limit: (lim: number) => Promise.resolve(ids.slice(0, lim).map((i) => wrap(docs[i], i)))
      }),
      skip: (n: number) => ({
        limit: (lim: number) => Promise.resolve(ids.slice(n).slice(0, lim).map((i) => wrap(docs[i], i)))
      }),
      limit: (lim: number) => Promise.resolve(ids.slice(0, lim).map((i) => wrap(docs[i], i))),
      then: (resolve: any) => resolve(ids.map((i) => wrap(docs[i], i)))
    };
  }

  function matches(raw: any, query: any, schoolCodes: string[]) {
    if (!schoolCodes.includes(raw.schoolCode || '')) return false;
    for (const key of Object.keys(query)) {
      if (key === '$or') continue;
      if (key === 'schoolCode') continue;
      if (raw[key] !== query[key]) return false;
    }
    if (query.$or) {
      const orMatch = (query.$or as any[]).some((cond: any) => {
        for (const k of Object.keys(cond)) {
          const v = cond[k];
          if (typeof v === 'object' && v !== null && v.$regex) {
            const regex = new RegExp(v.$regex, v.$options || '');
            if (!regex.test(String(raw[k] || ''))) return false;
          } else {
            if (raw[k] !== v) return false;
          }
        }
        return true;
      });
      return orMatch;
    }
    return true;
  }

  function getSchoolCodes(query: any): string[] {
    const sc = query.schoolCode;
    if (!sc) return [];
    if (Array.isArray(sc)) return sc;
    if (sc.$in && Array.isArray(sc.$in)) return sc.$in;
    return [sc];
  }

  function findIndexes(query: any, schoolCodes: string[]): number[] {
    return docs.reduce((acc: number[], raw, i) => {
      if (matches(raw, query, schoolCodes)) acc.push(i);
      return acc;
    }, []);
  }

  const mockFind = (query: any = {}) => {
    const schoolCodes = getSchoolCodes(query);
    const ids = schoolCodes.length ? findIndexes(query, schoolCodes) : docs.map((_, i) => i);
    return queryChain(ids);
  };

  const mockFindOne = (query: any = {}) => {
    const schoolCodes = getSchoolCodes(query);
    const idx = docs.findIndex(raw => matches(raw, query, schoolCodes));
    if (idx === -1) return Promise.resolve(null);
    return Promise.resolve(wrap(docs[idx], idx));
  };

  const mockFindById = (id: string) => {
    const idx = docs.findIndex(raw => raw._id === id);
    if (idx === -1) return Promise.resolve(null);
    return Promise.resolve(wrap(docs[idx], idx));
  };

  const mockFindByIdAndUpdate = (id: string, update: any, _opts?: any) => {
    const idx = docs.findIndex(raw => raw._id === id);
    if (idx === -1) return Promise.resolve(null);
    const updated = { ...docs[idx], ...(update.$set || update) };
    docs[idx] = updated;
    return Promise.resolve(wrap(updated, idx));
  };

  const mockCountDocuments = (query: any = {}) => {
    if (Object.keys(query).length === 0) return Promise.resolve(docs.length);
    return Promise.resolve(findIndexes(query, getSchoolCodes(query)).length);
  };

  class MockStudent {
    data: any;
    _id: string;
    save: any;

    constructor(data: any) {
      idCounter++;
      this._id = 'mock-id-' + idCounter;
      this.data = { _id: this._id, ...data };
      this.save = jest.fn().mockImplementation(() => {
        docs.push(this.data);
        return Promise.resolve();
      });
    }

    toJSON() {
      return { studentId: this._id, ...this.data, aadhaarNumber: 'XXXXXXXX' + (this.data.aadhaarNumber || '').slice(-4) };
    }
  }

  (MockStudent as any).find = mockFind;
  (MockStudent as any).findOne = mockFindOne;
  (MockStudent as any).findById = mockFindById;
  (MockStudent as any).findByIdAndUpdate = mockFindByIdAndUpdate;
  (MockStudent as any).countDocuments = mockCountDocuments;
  (MockStudent as any)._reset = (initial: any[] = []) => {
    docs.length = 0;
    for (const d of initial) docs.push({ ...d });
    idCounter = 0;
  };

  return { Student: MockStudent };
});

import studentsRouter from '../routes/students';

let app: express.Application;
let teacherToken: string;

beforeAll(() => {
  teacherToken = jwt.sign(
    { id: 'teacher-1', email: 'teacher@school.com', name: 'Test Teacher', schoolId: 'gps-mt-001', role: 'teacher' },
    getJwtSecret(),
    { expiresIn: '1h' }
  );

  app = express();
  app.use(express.json());
  app.use('/api/v2/students', (req, _res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        (req as any).user = jwt.verify(authHeader.slice(7), getJwtSecret());
      } catch { /* ignore */ }
    }
    next();
  });
  app.use('/api/v2/students', studentsRouter);
});

beforeEach(() => {
  const { Student } = require('../models/Student');
  (Student as any)._reset();
});

const mockDoc = (overrides = {}) => ({
  _id: '507f1f77bcf86cd799439011',
  studentName: 'Aarav Kumar',
  dateOfBirth: '2017-04-12',
  gender: 'male',
  aadhaarNumber: '123412341234',
  parentName: 'Sunita Kumar',
  class: 3,
  section: 'A',
  schoolCode: 'gps-mt-001',
  status: 'active',
  createdBy: 'teacher-1',
  createdAt: new Date(),
  ...overrides
});

const validStudent = {
  studentName: 'Aarav Kumar',
  dateOfBirth: '2017-04-12',
  gender: 'male',
  aadhaarNumber: '123412341234',
  parentName: 'Sunita Kumar',
  class: 3,
  section: 'A'
};

describe('POST /api/v2/students', () => {
  it('creates a student and returns 201', async () => {
    const res = await request(app)
      .post('/api/v2/students')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send(validStudent);

    expect(res.status).toBe(201);
    expect(res.body.studentId).toBeDefined();
    expect(res.body.studentName).toBe('Aarav Kumar');
    expect(res.body.aadhaarNumber).toMatch(/^X/);
  });

  it('rejects duplicate aadhaar with 409', async () => {
    const { Student } = require('../models/Student');
    (Student as any)._reset([mockDoc()]);

    const res = await request(app)
      .post('/api/v2/students')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send(validStudent);

    expect(res.status).toBe(409);
  });

  it('rejects without auth', async () => {
    const res = await request(app)
      .post('/api/v2/students')
      .send(validStudent);
    expect(res.status).toBe(401);
  });

  it('validates required fields', async () => {
    const res = await request(app)
      .post('/api/v2/students')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v2/students', () => {
  it('lists students with pagination', async () => {
    const { Student } = require('../models/Student');
    (Student as any)._reset([
      mockDoc({ _id: 'a1', studentName: 'Alpha', aadhaarNumber: '111111111111' }),
      mockDoc({ _id: 'a2', studentName: 'Beta', aadhaarNumber: '222222222222' })
    ]);

    const res = await request(app)
      .get('/api/v2/students')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.students).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(res.body.page).toBe(1);
  });

  it('filters by search query', async () => {
    const { Student } = require('../models/Student');
    (Student as any)._reset([mockDoc({ _id: 'a1', studentName: 'Alpha' })]);

    const res = await request(app)
      .get('/api/v2/students')
      .query({ search: 'Alpha' })
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.students).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });
});

describe('GET /api/v2/students/search', () => {
  it('searches by query', async () => {
    const { Student } = require('../models/Student');
    (Student as any)._reset([mockDoc({ _id: 'b1', studentName: 'Beta' })]);

    const res = await request(app)
      .get('/api/v2/students/search?q=Beta')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.students).toHaveLength(1);
  });
});

describe('PUT /api/v2/students/:id', () => {
  it('updates a student', async () => {
    const { Student } = require('../models/Student');
    (Student as any)._reset([mockDoc({ _id: '507f1f77bcf86cd799439011' })]);

    const res = await request(app)
      .put('/api/v2/students/507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ studentName: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body.studentName).toBe('Updated Name');
  });

  it('returns 404 for non-existent id', async () => {
    const res = await request(app)
      .put('/api/v2/students/nonexistent')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ studentName: 'Updated' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v2/students/:id', () => {
  it('soft-deletes a student', async () => {
    const { Student } = require('../models/Student');
    (Student as any)._reset([mockDoc({ _id: '507f1f77bcf86cd799439011' })]);

    const res = await request(app)
      .delete('/api/v2/students/507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('inactive');
  });
});

describe('POST /api/v2/students/:id/reactivate', () => {
  it('reactivates a student', async () => {
    const { Student } = require('../models/Student');
    (Student as any)._reset([mockDoc({ _id: '507f1f77bcf86cd799439011', status: 'inactive' })]);

    const res = await request(app)
      .post('/api/v2/students/507f1f77bcf86cd799439011/reactivate')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
  });
});

describe('POST /api/v2/students/upload', () => {
  it('bulk uploads students', async () => {
    const rows = [
      { studentName: 'Student One', dateOfBirth: '2016-05-10', gender: 'male', aadhaarNumber: '111111111111', parentName: 'Parent One', class: 3, section: 'A' },
      { studentName: 'Student Two', dateOfBirth: '2017-08-15', gender: 'female', aadhaarNumber: '222222222222', parentName: 'Parent Two', class: 3, section: 'A' }
    ];

    const res = await request(app)
      .post('/api/v2/students/upload')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ students: rows });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(2);
    expect(res.body.results).toHaveLength(2);
  });

  it('rejects empty array', async () => {
    const res = await request(app)
      .post('/api/v2/students/upload')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ students: [] });

    expect(res.status).toBe(400);
  });

  it('detects duplicates in bulk upload', async () => {
    const { Student } = require('../models/Student');
    (Student as any)._reset([mockDoc({ aadhaarNumber: '123412341234' })]);

    const rows = [{
      studentName: 'Dup', dateOfBirth: '2016-05-10', gender: 'male',
      aadhaarNumber: '123412341234', parentName: 'Parent', class: 3, section: 'A'
    }];

    const res = await request(app)
      .post('/api/v2/students/upload')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ students: rows });

    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(1);
    expect(res.body.inserted).toBe(0);
  });
});
