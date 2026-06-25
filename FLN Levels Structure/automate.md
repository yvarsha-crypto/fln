# FLN AI Automation Pipeline

## Overview
This document describes how to use the AI-powered tools to auto-generate, validate, and export FLN question content.

---

## Tool 1: `fln_app.html` — AI Question Generator

The main application. Open in any browser (no server required).

### Features
- Browse all 40 levels with board alignment data
- Generate questions for any level and sub-level
- Formats: MCQ, Fill-in-blank, Word problems, Visual, Mixed
- Generate answer keys with explanations
- Generate question variants (different numbers/contexts, same concept)
- Add teacher hints for struggling students
- Download questions as `.md` files

### How it works
The app calls the Anthropic Claude API (claude-sonnet-4-6) with a structured prompt that includes:
- The level concept, class, and difficulty tier
- Format requirements
- NIPUN Bharat alignment notes
- Indian context requirement (names, currency, foods)

---

## Tool 2: Batch Generation (planned)

To generate a full question bank for all 40 levels automatically:

```javascript
// Pseudocode — to be implemented in automate.js
for each level in 1..40:
  for each sublevel in [0, 1, 2]:
    for each format in [MCQ, Fill, Word]:
      questions = await callClaudeAPI(level, sublevel, format, count=5)
      saveToQuestionBank(level, sublevel, format, questions)
```

### Output format
Each generated question bank entry:
```json
{
  "id": "L04_001",
  "level": 4,
  "sublevel": 0,
  "type": "MCQ",
  "class": "Class 1",
  "board_coverage": ["NCERT", "CBSE", "ICSE", "All State Boards"],
  "nipun_competency": "NC2",
  "question": "How many stars are there? ★★★★★★",
  "options": ["5", "6", "7", "8"],
  "answer": "6",
  "hint": "Count each star one by one pointing with your finger."
}
```

---

## Tool 3: JSZip Export (planned)

To package generated question banks into per-level zip files:

```javascript
import JSZip from 'jszip';

async function exportLevelPack(levelNum) {
  const zip = new JSZip();
  const folder = zip.folder(`Level_${levelNum}`);
  folder.file('questions_main.md', await generateQuestions(levelNum, 0));
  folder.file('questions_easier.md', await generateQuestions(levelNum, 1));
  folder.file('questions_remediation.md', await generateQuestions(levelNum, 2));
  folder.file('answer_key.md', await generateAnswerKey(levelNum));
  const blob = await zip.generateAsync({type:'blob'});
  saveAs(blob, `FLN_Level_${levelNum}_Pack.zip`);
}
```

---

## Prompt Engineering Guidelines

When calling the Claude API for question generation, always include:

1. **Level metadata**: concept, class, difficulty tier
2. **Format specification**: exact type of questions needed
3. **Indian context**: use Indian names, ₹, familiar objects
4. **NIPUN competency tag**: so questions test the right skill
5. **Anti-repetition instruction**: no two questions of same pattern
6. **Answer format**: always include answer in [brackets] after each question

---

## API Parameters (current)

```javascript
{
  model: "claude-sonnet-4-6",
  max_tokens: 1000,
  messages: [{
    role: "user",
    content: `[structured prompt as above]`
  }]
}
```

---

## New Levels Added (v2.0)

The following levels were missing from the original structure and have been added:

| Level | Topic | Missing From (NCERT) |
|---|---|---|
| 24 | Shapes & Spatial Understanding | Class 1 |
| 25 | Measurement Introduction | Class 1 |
| 26 | Numbers 51–100 | Class 2 |
| 27 | Addition & Subtraction to 100 | Class 2 |
| 28 | Multiplication Introduction | Class 2 |
| 29 | Division Introduction | Class 2 |
| 30 | Fractions (Halves & Quarters) | Class 2 |
| 31 | Time | Class 2 |
| 32 | Measurement (Standard Units) | Class 2 |
| 33 | Numbers up to 1000 | Class 3 |
| 34 | 3-Digit Addition & Subtraction | Class 3 |
| 35 | Multiplication Tables | Class 3 |
| 36 | Division Facts | Class 3 |
| 37 | Fractions (Class 3) | Class 3 |
| 38 | Geometry | Class 3 |
| 39 | Perimeter & Area | Class 3 |
| 40 | Data Handling | Class 3 |
