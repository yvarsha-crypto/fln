# FLN — Foundational Literacy & Numeracy Assessment Platform

A large-scale, personalized assessment system that helps teachers measure, track, and improve every student's Foundational Literacy and Numeracy (FLN) outcomes — from automatic question paper generation to scanning answer sheets and instant, profile-driven evaluation.

---

## Table of Contents
- [What is FLN?](#what-is-fln)
- [Why FLN Matters](#why-fln-matters)
- [Government Initiatives](#government-initiatives)
- [What This Software Does](#what-this-software-does)
- [How It Works (Workflow)](#how-it-works-workflow)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Contribution Guidelines](#contribution-guidelines)
- [Branching & PR Convention](#branching--pr-convention)
- [License](#license)

---

## What is FLN?

**Foundational Literacy and Numeracy (FLN)** refers to the basic ability to read with comprehension and perform simple arithmetic operations — the core skills every child needs before they can meaningfully engage with the rest of their school curriculum. It typically covers children from pre-school through Grade 3 (roughly ages 3–9), and includes skills like letter and word recognition, reading fluency, basic comprehension, number sense, and elementary arithmetic.

FLN is considered the "foundation" of all future learning — without it, a child cannot effectively progress through later grades, no matter how good the rest of the curriculum is.

## Why FLN Matters

India has one of the largest school-going populations in the world, but enrollment has not translated into actual learning. Large-scale assessments have repeatedly shown that a significant share of children in upper primary grades cannot read a simple grade-appropriate text or solve basic arithmetic problems. This learning gap compounds over time — children who fall behind in FLN tend to struggle increasingly with every subject built on top of it, leading to disengagement, grade repetition, and eventually dropout.

The National Education Policy (NEP) 2020 explicitly recognized this and stated that achieving universal foundational literacy and numeracy in primary school is the highest near-term priority for the Indian education system — without it, the rest of education policy has limited impact for a large portion of students.

This is the problem our project aims to help solve: giving schools and teachers a reliable, scalable, and personalized way to **assess** where each child stands on FLN, **act** on that data quickly, and **track** progress until every child clears the foundational bar.

## Government Initiatives

Some of the key national and state-level efforts this project aligns with:

- **NIPUN Bharat** (National Initiative for Proficiency in Reading with Understanding and Numeracy) — launched by the Ministry of Education in July 2021 under the Samagra Shiksha scheme, with the goal that every child achieves grade-level FLN competencies by the end of Grade 3, by 2026–27. It uses a five-tier implementation structure (national, state, district, block, school).
- **NEP 2020** — the policy mandate that established universal FLN as the top priority for the Indian school system.
- **DIKSHA & UDISE+** — existing national digital infrastructure for teacher resources and student/school data that FLN initiatives are encouraged to build on or align with.
- **State-led missions** — several states have their own FLN programs aligned with NIPUN Bharat (e.g., Mission Buniyaad in Delhi, Mission Ankur in Madhya Pradesh), often with localized assessment tools and workbooks.

This project is built to be usable by schools, teachers, and administrators operating within this broader policy ecosystem — generating assessments aligned with grade-wise FLN expectations ("Lakshyas") rather than a generic test.

## What This Software Does

The platform is built around **personalized, student-specific assessment**, not one-size-fits-all testing. Core capabilities:

- **Student Profiling** — every student has a profile that tracks their current FLN level, assessment history, and progress over time.
- **Teacher Dashboard** — central workspace for teachers to manage classes, generate assessments, scan results, and view analytics.
- **Automatic Question Paper Generation** — question papers are generated automatically based on grade level and the student's current FLN level, not just a static template.
  - For a **new class/new school** with no prior data, the system falls back to a **standard question paper** aligned with the generic FLN benchmark expected for that grade.
  - Once a student has a profile, future papers are **personalized**, while still meeting the minimum competency bar defined for that grade under FLN criteria.
- **Print & Distribute** — teachers can print a generic class paper or individual, name-tagged worksheets per student.
- **Scan & Auto-Evaluate** — after collecting completed sheets, the teacher scans them (via phone camera or a school scanner) and the system evaluates them automatically.
- **Instant Results & Certification**
  - If a student **clears** the FLN benchmark for their grade → they receive a certificate for that grade and progress forward.
  - If a student **does not clear** it → they receive a detailed analysis of which FLN level they're actually at, along with a scheduled re-assessment date for the appropriate (lower) level.
  - Students who clear a lower-level re-assessment go on to attempt the FLN qualifier for their original grade again — every subsequent paper is generated from their updated, personalized profile.

## How It Works (Workflow)

1. Teacher generates a question paper from the dashboard (standard paper for new classes, or personalized per student once profiles exist).
2. Paper is printed and distributed to students.
3. Students take the assessment on paper.
4. Teacher collects the answer sheets.
5. Teacher scans the sheets (phone or scanner) and uploads them into the app.
6. System auto-evaluates the sheet and updates the student's profile.
7. Teacher gets an instant result:
   - **Pass** → certificate issued, student advances.
   - **Fail** → FLN level diagnosis + scheduled re-assessment at the appropriate level.
8. Cycle repeats until the student clears the grade-level FLN qualifier.

## Tech Stack

This project is built on the **MERN stack**:
- **M**ongoDB — database
- **E**xpress.js — backend framework
- **R**eact — frontend
- **N**ode.js — backend runtime

(Specific libraries for OCR/scanning, PDF generation, etc. will be documented as they're added.)

## Getting Started

This is a full-stack MERN application. To get the app running on your machine, you'll need Node.js, MongoDB, and the steps below.

### Prerequisites

- **Node.js** ≥ 20
- **MongoDB** ≥ 6 (running locally on `mongodb://localhost:27017` or set `MONGODB_URI` env var)
- **Git**

### Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/vicharanashala/fln.git
cd fln/mvp

# 2. Install dependencies
npm install

# 3. Start MongoDB locally (or skip if it's already running)
#    macOS:   brew services start mongodb-community
#    Linux:   sudo systemctl start mongod
#    Windows: net start MongoDB

# 4. Seed required data into MongoDB (teachers + volunteers + sample students)
npm run seed:all
#    Creates:
#    • 16 teacher accounts (one per school; password: Teacher@123)
#    • 8 volunteer accounts (password: Volunteer@123)
#    • 60 sample students (3 per class, distributed across 20 classes)
#    All operations are idempotent — safe to re-run.

# 5. Start the dev server (frontend + API)
npm run dev
#    Opens on http://localhost:3000

# 6. Login as a teacher or volunteer, e.g.:
#    Teacher:  gps-mt-001.t01@fln.org / Teacher@123
#    Volunteer: vol.rahul@fln.org / Volunteer@123
```

### Data Storage Model

The app uses **two persistent stores** that work together:

| Store | Location | Contents |
|---|---|---|
| **MongoDB** (live) | `mongodb://localhost:27017/fln` | Teachers, registered students |
| **JSON file** (legacy, read-only) | `mvp/data/db.json` | Schools, classes, users, questions, worksheets, answer submissions, evaluation reports, tickets, logbook, announcements |

When you log in, the app reads users/teachers from both stores. When a teacher generates a diagnostic test or worksheet, the server reads the class roster from MongoDB (students) and the JSON file (classes, schools).

### Useful Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server (frontend + backend) |
| `npm test` | Run all tests (server + client) |
| `npm run seed:teachers` | Seed only teachers into MongoDB (idempotent) |
| `npm run seed:volunteers` | Seed only volunteers into MongoDB (idempotent) |
| `npm run seed:students` | Seed only sample students into MongoDB (idempotent) |
| `npm run seed:all` | Seed teachers + volunteers + sample students (idempotent) |
| `npm run build` | Build the production bundle |

### Environment Variables (optional)

```bash
# Custom MongoDB connection (default: mongodb://localhost:27017/fln)
MONGODB_URI=mongodb://localhost:27017/fln npm run dev

# Custom server port (default: 3000)
PORT=4000 npm run dev
```

### Troubleshooting

- **"MongoDB not available" warning on startup** — Make sure MongoDB is running. The app will still start, but v2 API routes that need MongoDB will return 503.
- **Empty student lists in dashboards** — Run `npm run seed:all` to populate sample students.
- **"Invalid email or password" when logging in as a teacher** — Teachers must be seeded first (`npm run seed:teachers`). The default password is `Teacher@123`.
- **"Invalid email or password" when logging in as a volunteer** — Volunteers must be seeded first (`npm run seed:volunteers`). The default password is `Volunteer@123`.

## Contribution Guidelines

This is an **open-source** project — contributions are welcome. Before contributing:

1. Check open issues or discuss the feature/fix you want to work on.
2. Fork the repo (or create a branch if you have write access).
3. Follow the branch naming and PR process below.
4. Keep PRs focused — one feature or one fix per PR.
5. Write clear commit messages describing *what* and *why*.

## Branching & PR Convention

All branches must follow this naming convention:

| Type | Branch Name Format | Example |
|------|--------------------|---------|
| Feature | `feat: <name of feature>` | `feat: auto question paper generation` |
| Fix | `fix: <name of fix>` | `fix: scanner upload crash on android` |

**Process:**
1. Create a branch using the convention above.
2. Make your changes and commit with clear messages.
3. Push the branch and **raise a Pull Request (PR)** against `main` (or the appropriate base branch).
4. PRs should reference the related issue (if any) and briefly describe the change.
5. At least one review/approval is required before merging (process may be refined as the team grows).

## License

This repository is open source. *(License file to be added — e.g., MIT/Apache 2.0. Update this section once finalized.)*
