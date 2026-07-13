import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Teacher } from '../models/Teacher';
import { Volunteer } from '../models/Volunteer';

const JWT_SECRET = process.env.JWT_SECRET || 'fln-dev-secret-change-in-production';

export interface AuthPayload {
  id: string;
  email: string;
  name: string;
  schoolId: string;
  assignedSchools?: string[];
  role: string;
}

export function getJwtSecret(): string {
  return JWT_SECRET;
}

async function lookupUserByEmail(email: string): Promise<AuthPayload | null> {
  const norm = email.toLowerCase().trim();
  const teacher = await Teacher.findOne({ email: norm });
  if (teacher) {
    return {
      id: teacher._id.toString(),
      email: teacher.email,
      name: teacher.name,
      schoolId: teacher.schoolId,
      role: teacher.role
    };
  }
  const volunteer = await Volunteer.findOne({ email: norm });
  if (volunteer) {
    return {
      id: volunteer._id.toString(),
      email: volunteer.email,
      name: volunteer.name,
      schoolId: volunteer.assignedSchools?.[0] || '',
      assignedSchools: volunteer.assignedSchools,
      role: volunteer.role
    };
  }
  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice(7).trim();

  // 1. Try JWT verification first (new v1/v2 login returns JWT).
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    (req as any).user = decoded;
    next();
    return;
  } catch {
    // not a valid JWT — fall through to legacy email lookup
  }

  // 2. Fallback: treat token as a plain email (legacy v1 sessions).
  //    Look up the teacher OR volunteer in MongoDB so role/school info is preserved.
  void (async () => {
    try {
      if (mongoose.connection.readyState !== 1) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }
      const user = await lookupUserByEmail(token);
      if (!user) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }
      (req as any).user = user;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  })();
}

export function requireTeacher(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user as AuthPayload | undefined;
  if (!user || user.role !== 'teacher') {
    res.status(403).json({ error: 'Forbidden. Teacher access required.' });
    return;
  }
  next();
}

export function requireTeacherOrVolunteer(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const user = (req as any).user as AuthPayload | undefined;
  if (!user || (user.role !== 'teacher' && user.role !== 'volunteer')) {
    res.status(403).json({ error: 'Forbidden. Teacher or Volunteer access required.' });
    return;
  }
  next();
}