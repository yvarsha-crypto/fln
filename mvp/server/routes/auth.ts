import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Teacher } from '../models/Teacher';
import { Volunteer } from '../models/Volunteer';
import { getJwtSecret } from '../middleware/auth';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const normEmail = email.toLowerCase().trim();

    // Try teacher first
    const teacher = await Teacher.findOne({ email: normEmail });
    if (teacher) {
      const isMatch = await teacher.comparePassword(password);
      if (!isMatch) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }
      const token = jwt.sign(
        {
          id: teacher._id.toString(),
          email: teacher.email,
          name: teacher.name,
          schoolId: teacher.schoolId,
          role: teacher.role
        },
        getJwtSecret(),
        { expiresIn: '24h' }
      );
      res.json({
        token,
        user: {
          id: teacher._id.toString(),
          email: teacher.email,
          name: teacher.name,
          schoolId: teacher.schoolId,
          role: teacher.role
        }
      });
      return;
    }

    // Try volunteer
    const volunteer = await Volunteer.findOne({ email: normEmail });
    if (volunteer) {
      const isMatch = await volunteer.comparePassword(password);
      if (!isMatch) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }
      const token = jwt.sign(
        {
          id: volunteer._id.toString(),
          email: volunteer.email,
          name: volunteer.name,
          schoolId: volunteer.assignedSchools?.[0] || '',
          assignedSchools: volunteer.assignedSchools,
          role: volunteer.role
        },
        getJwtSecret(),
        { expiresIn: '24h' }
      );
      res.json({
        token,
        user: {
          id: volunteer._id.toString(),
          email: volunteer.email,
          name: volunteer.name,
          schoolId: volunteer.assignedSchools?.[0] || '',
          assignedSchools: volunteer.assignedSchools,
          role: volunteer.role
        }
      });
      return;
    }

    res.status(401).json({ error: 'Invalid email or password.' });
  } catch (err: any) {
    console.error('Auth login error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/me', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice(7).trim();

  // Try JWT first
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any;
    let user = await Teacher.findById(decoded.id).select('-password');
    if (!user) {
      user = await Volunteer.findById(decoded.id).select('-password');
    }
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    res.json({ user });
    return;
  } catch {
    // Not a JWT — fall back to legacy email-as-token lookup
  }

  try {
    const norm = token.toLowerCase().trim();
    let user = await Teacher.findOne({ email: norm }).select('-password');
    if (!user) {
      user = await Volunteer.findOne({ email: norm }).select('-password');
    }
    if (!user) {
      res.status(401).json({ error: 'Invalid or expired token.' });
      return;
    }
    res.json({ user });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
});

export default router;
