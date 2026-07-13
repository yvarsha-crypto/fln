import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Volunteer } from './models/Volunteer';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fln';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DB_JSON_PATH = path.join(ROOT_DIR, 'data', 'db.json');

const DEFAULT_PASSWORD = 'Volunteer@123';

interface JsonUser {
  id: string;
  email: string;
  name: string;
  role: string;
  assignedSchools?: string[];
}

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const raw = fs.readFileSync(DB_JSON_PATH, 'utf-8');
    const db = JSON.parse(raw) as { users: JsonUser[] };
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
        password: DEFAULT_PASSWORD
      });
      created++;
    }

    console.log(`Done. Created: ${created}, Skipped (already exist): ${skipped}`);
    console.log(`Default password for all seeded volunteers: ${DEFAULT_PASSWORD}`);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

seed();