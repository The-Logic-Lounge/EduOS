// Edu OS seed — 100% SYNTHETIC data for a Pakistani free-IT-training NGO.
// Deterministic: mulberry32 PRNG + fixed ids, so every machine gets identical rows.
// Idempotent: every row carries a deterministic id and is inserted with
// createMany({ skipDuplicates: true }). Nothing is ever deleted or truncated.
//
// The point of this file is INTERNAL CONSISTENCY. Each student gets a hidden
// ARCHETYPE that exists only here (never in the DB); attendance, submissions,
// assessment scores and module progress are all derived from it, so a
// struggling student can never show up with 95% assessments.
//
// Run: node --env-file=.env prisma/seed.mjs

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Safety: Prisma falls back to the project's env file, which points at PRODUCTION. Running the
// seed by accident (e.g. importing this file) must never write there. Remote targets require
// an explicit SEED_TARGET=production-approved, set only by the approved rollout script.
{
  const url = process.env.DATABASE_URL ?? "";
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  if (!local && process.env.SEED_TARGET !== "production-approved") {
    console.error("refusing to seed a non-local database without SEED_TARGET=production-approved");
    process.exit(1);
  }
}
const db = new PrismaClient();

// ---------------------------------------------------------------- prng
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260903);
const clamp = (n, lo, hi) => (n < lo ? lo : n > hi ? hi : n);
const pad = (n, w) => String(n).padStart(w, "0");

// ---------------------------------------------------------------- dates
const DAY = 86400000;
const TODAY = new Date("2026-09-03T00:00:00.000Z");
const daysFromToday = (d) => new Date(TODAY.getTime() + d * DAY);

// ---------------------------------------------------------------- names
const FIRST = [
  "Ahmed", "Fatima", "Bilal", "Ayesha", "Usman", "Zainab", "Hassan", "Maryam",
  "Hamza", "Sana", "Ali", "Hira", "Omar", "Iqra", "Faisal", "Nimra",
  "Saad", "Rabia", "Talha", "Aiman", "Zeeshan", "Mahnoor", "Kashif", "Sadia",
  "Junaid", "Areeba", "Danish", "Komal", "Shahzaib", "Laiba", "Adnan", "Anum",
  "Waleed", "Sidra", "Imran", "Bushra", "Noman", "Amna", "Rehan", "Kiran",
];
const LAST = [
  "Raza", "Khan", "Ahmed", "Siddiqui", "Tariq", "Malik", "Ali", "Nawaz",
  "Sheikh", "Butt", "Qureshi", "Hussain", "Abbas", "Farooq", "Chaudhry",
  "Javed", "Iqbal", "Mahmood", "Rashid", "Zafar", "Aslam", "Bhatti", "Shah",
  "Anwar", "Yousaf", "Nasir", "Baig", "Sultan", "Rehman", "Gillani",
];
// i*7 % LAST.length decorrelates the pairing so we don't get 40 "Ahmed Raza"s.
const nameFor = (i) => `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;

const CITIES = [
  "Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Multan",
  "Peshawar", "Hyderabad", "Quetta", "Sialkot", "Gujranwala", "Bahawalpur",
];
const EDUCATION = [
  "Matric", "Intermediate (FSc)", "Intermediate (ICS)", "BSc", "BS Computer Science",
  "BCom", "BA", "MSc", "Diploma (DAE)", "BBA",
];

// ---------------------------------------------------------------- skills
const SKILLS = [
  ["Python Basics", "Programming"],
  ["Object-Oriented Programming", "Programming"],
  ["Algorithms", "Programming"],
  ["Dart", "Programming"],
  ["JavaScript", "Programming"],
  ["React", "Programming"],
  ["Pandas", "Data"],
  ["SQL", "Data"],
  ["Statistics", "Data"],
  ["Data Visualization", "Data"],
  ["Machine Learning", "Data"],
  ["Deep Learning", "Data"],
  ["Adobe Photoshop", "Design"],
  ["Adobe Illustrator", "Design"],
  ["UI/UX Design", "Design"],
  ["Brand Identity", "Design"],
  ["SEO", "Marketing"],
  ["Social Media Marketing", "Marketing"],
  ["Content Strategy", "Marketing"],
  ["Amazon FBA", "Marketing"],
  ["Git & GitHub", "Tools"],
  ["Excel", "Tools"],
  ["Communication", "Soft Skills"],
  ["Problem Solving", "Soft Skills"],
];
const skillId = (name) => `skl_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+$/, "")}`;

// ---------------------------------------------------------------- courses
const COURSES = [
  {
    code: "PY",
    title: "Python Programming",
    level: "Beginner",
    weeks: 12,
    description:
      "A hands-on introduction to programming with Python, from first script to a working command-line project.",
    skills: [["Python Basics", "ADVANCED"], ["Object-Oriented Programming", "INTERMEDIATE"], ["Problem Solving", "INTERMEDIATE"], ["Git & GitHub", "BEGINNER"]],
    modules: [
      { title: "Programming Fundamentals & Setup", hours: 8, objectives: ["Install Python and VS Code", "Write and run a first script", "Use variables and basic types"], skills: [["Python Basics", 3], ["Problem Solving", 1]] },
      { title: "Control Flow & Functions", hours: 10, objectives: ["Use conditionals and loops confidently", "Write reusable functions", "Debug logic errors"], skills: [["Python Basics", 3], ["Problem Solving", 2]] },
      { title: "Data Structures in Python", hours: 12, objectives: ["Work with lists, dicts, sets and tuples", "Choose the right structure for a task", "Reason about time cost"], skills: [["Python Basics", 2], ["Algorithms", 2]] },
      { title: "Object-Oriented Programming", hours: 12, objectives: ["Model a problem with classes", "Use inheritance and composition", "Write readable class APIs"], skills: [["Object-Oriented Programming", 3], ["Python Basics", 1]] },
      { title: "Files, APIs & Error Handling", hours: 10, objectives: ["Read and write files safely", "Call a REST API", "Handle exceptions without hiding bugs"], skills: [["Python Basics", 2], ["Git & GitHub", 1]] },
      { title: "Capstone: Building a CLI Tool", hours: 14, objectives: ["Plan a small project end to end", "Ship it to GitHub", "Present the work"], skills: [["Problem Solving", 3], ["Git & GitHub", 2]] },
    ],
  },
  {
    code: "DS",
    title: "Data Science",
    level: "Intermediate",
    weeks: 14,
    description:
      "Turn raw spreadsheets into decisions: pandas, statistics, SQL and visual storytelling.",
    skills: [["Pandas", "ADVANCED"], ["Data Visualization", "ADVANCED"], ["SQL", "INTERMEDIATE"], ["Statistics", "INTERMEDIATE"], ["Machine Learning", "BEGINNER"]],
    modules: [
      { title: "Data Analysis with Python", hours: 10, objectives: ["Load datasets with pandas", "Select, filter and aggregate", "Read a data dictionary"], skills: [["Pandas", 3], ["Python Basics", 1]] },
      { title: "Data Cleaning & Wrangling", hours: 12, objectives: ["Handle missing and dirty values", "Reshape and merge tables", "Document cleaning decisions"], skills: [["Pandas", 3], ["SQL", 1]] },
      { title: "Statistics for Data Science", hours: 12, objectives: ["Describe a distribution", "Reason about sampling and variance", "Run a basic hypothesis test"], skills: [["Statistics", 3], ["Problem Solving", 1]] },
      { title: "Data Visualization", hours: 10, objectives: ["Choose the right chart for a question", "Build clear matplotlib figures", "Avoid misleading axes"], skills: [["Data Visualization", 3], ["Pandas", 1]] },
      { title: "SQL for Analysts", hours: 12, objectives: ["Write joins and aggregations", "Use window functions", "Export a query for reporting"], skills: [["SQL", 3], ["Excel", 1]] },
      { title: "Introduction to Machine Learning", hours: 14, objectives: ["Frame a prediction problem", "Train and evaluate a baseline model", "Explain a model to a non-technical reader"], skills: [["Machine Learning", 3], ["Statistics", 1]] },
    ],
  },
  {
    code: "WD",
    title: "Web Development",
    level: "Beginner",
    weeks: 16,
    description:
      "Build and deploy real websites: HTML, CSS, JavaScript, React and a full-stack capstone.",
    skills: [["JavaScript", "ADVANCED"], ["React", "ADVANCED"], ["Git & GitHub", "INTERMEDIATE"], ["UI/UX Design", "BEGINNER"]],
    modules: [
      { title: "HTML & CSS Foundations", hours: 12, objectives: ["Write semantic HTML", "Lay out pages with flexbox and grid", "Make a page responsive"], skills: [["UI/UX Design", 2], ["Git & GitHub", 1]] },
      { title: "JavaScript Essentials", hours: 14, objectives: ["Use variables, functions and arrays", "Work with objects", "Debug in the browser console"], skills: [["JavaScript", 3], ["Problem Solving", 1]] },
      { title: "Modern JavaScript & the DOM", hours: 12, objectives: ["Manipulate the DOM", "Handle events", "Use async/await with fetch"], skills: [["JavaScript", 3], ["Algorithms", 1]] },
      { title: "React Fundamentals", hours: 16, objectives: ["Build components and props", "Manage state and effects", "Compose a small SPA"], skills: [["React", 3], ["JavaScript", 2]] },
      { title: "APIs, Auth & Databases", hours: 14, objectives: ["Design simple REST endpoints", "Store data in Postgres", "Protect routes with sessions"], skills: [["React", 2], ["SQL", 2]] },
      { title: "Deploying a Full-Stack App", hours: 10, objectives: ["Use Git branches properly", "Deploy to a host", "Set up environment variables safely"], skills: [["Git & GitHub", 3], ["React", 1]] },
    ],
  },
  {
    code: "GD",
    title: "Graphic Design",
    level: "Beginner",
    weeks: 10,
    description:
      "Visual craft for freelancers: composition, Photoshop, Illustrator and a client-ready portfolio.",
    skills: [["Adobe Photoshop", "ADVANCED"], ["Adobe Illustrator", "ADVANCED"], ["Brand Identity", "INTERMEDIATE"], ["UI/UX Design", "BEGINNER"]],
    modules: [
      { title: "Design Principles & Colour Theory", hours: 8, objectives: ["Apply hierarchy and balance", "Build a working colour palette", "Critique a layout"], skills: [["UI/UX Design", 2], ["Brand Identity", 1]] },
      { title: "Adobe Photoshop Essentials", hours: 14, objectives: ["Work non-destructively with layers", "Retouch and mask cleanly", "Export for print and web"], skills: [["Adobe Photoshop", 3]] },
      { title: "Vector Design with Illustrator", hours: 14, objectives: ["Draw with the pen tool", "Build scalable vector artwork", "Manage type and shapes"], skills: [["Adobe Illustrator", 3]] },
      { title: "Brand Identity & Logo Design", hours: 12, objectives: ["Run a discovery brief", "Design a logo system", "Deliver a mini brand guide"], skills: [["Brand Identity", 3], ["Adobe Illustrator", 2]] },
      { title: "Portfolio & Client Delivery", hours: 10, objectives: ["Package files for a client", "Present design decisions", "Publish a portfolio"], skills: [["Communication", 2], ["Brand Identity", 1]] },
    ],
  },
  {
    code: "DM",
    title: "Digital Marketing",
    level: "Beginner",
    weeks: 10,
    description:
      "Get a business found and sold online: SEO, social, paid ads and honest reporting.",
    skills: [["SEO", "ADVANCED"], ["Social Media Marketing", "ADVANCED"], ["Content Strategy", "INTERMEDIATE"], ["Excel", "BEGINNER"]],
    modules: [
      { title: "Digital Marketing Foundations", hours: 8, objectives: ["Map a customer journey", "Set measurable goals", "Pick the right channel"], skills: [["Content Strategy", 2]] },
      { title: "Search Engine Optimisation", hours: 12, objectives: ["Do keyword research", "Fix on-page issues", "Build a content plan"], skills: [["SEO", 3], ["Content Strategy", 1]] },
      { title: "Social Media Marketing", hours: 12, objectives: ["Plan a content calendar", "Write for each platform", "Grow an engaged audience"], skills: [["Social Media Marketing", 3]] },
      { title: "Paid Ads: Meta & Google", hours: 12, objectives: ["Structure a campaign", "Write and test ad creative", "Read the cost metrics"], skills: [["Social Media Marketing", 2], ["Excel", 1]] },
      { title: "Analytics & Reporting", hours: 10, objectives: ["Track the right events", "Build a monthly report", "Tell the truth with numbers"], skills: [["Excel", 2], ["Data Visualization", 2]] },
    ],
  },
  {
    code: "EC",
    title: "E-Commerce (Amazon)",
    level: "Intermediate",
    weeks: 12,
    description:
      "Run an Amazon private-label business from Pakistan: sourcing, listings, PPC and logistics.",
    skills: [["Amazon FBA", "ADVANCED"], ["SEO", "INTERMEDIATE"], ["Excel", "BEGINNER"], ["Communication", "BEGINNER"]],
    modules: [
      { title: "Amazon Marketplace Fundamentals", hours: 8, objectives: ["Understand seller models", "Open and secure an account", "Know the policy traps"], skills: [["Amazon FBA", 2]] },
      { title: "Product Hunting & Sourcing", hours: 14, objectives: ["Validate demand with data", "Negotiate with suppliers", "Cost a unit honestly"], skills: [["Amazon FBA", 3], ["Problem Solving", 1]] },
      { title: "Listing Optimisation & SEO", hours: 12, objectives: ["Research listing keywords", "Write converting copy", "Brief product photography"], skills: [["SEO", 2], ["Amazon FBA", 2]] },
      { title: "PPC & Advertising on Amazon", hours: 12, objectives: ["Launch sponsored campaigns", "Read ACoS and TACoS", "Cut wasted spend"], skills: [["Amazon FBA", 2], ["Excel", 1]] },
      { title: "Logistics, FBA & Scaling", hours: 10, objectives: ["Plan inventory and reorders", "Handle returns and reviews", "Scale a winning product"], skills: [["Amazon FBA", 3], ["Communication", 1]] },
    ],
  },
  {
    code: "FL",
    title: "Flutter App Development",
    level: "Intermediate",
    weeks: 14,
    description:
      "Ship cross-platform mobile apps with Dart and Flutter, all the way to the Play Store.",
    skills: [["Dart", "ADVANCED"], ["Object-Oriented Programming", "INTERMEDIATE"], ["Git & GitHub", "INTERMEDIATE"], ["UI/UX Design", "BEGINNER"]],
    modules: [
      { title: "Dart Programming Basics", hours: 12, objectives: ["Use Dart types and null safety", "Write classes and futures", "Structure a Dart project"], skills: [["Dart", 3], ["Object-Oriented Programming", 1]] },
      { title: "Flutter Widgets & Layouts", hours: 14, objectives: ["Compose widget trees", "Build responsive layouts", "Style with themes"], skills: [["Dart", 2], ["UI/UX Design", 2]] },
      { title: "State Management", hours: 12, objectives: ["Lift state correctly", "Use Provider or Riverpod", "Avoid rebuild storms"], skills: [["Dart", 3], ["Algorithms", 1]] },
      { title: "Networking & Local Storage", hours: 12, objectives: ["Consume a JSON API", "Cache data locally", "Handle offline states"], skills: [["Dart", 2], ["SQL", 1]] },
      { title: "Firebase & Authentication", hours: 12, objectives: ["Wire up Firebase Auth", "Store data in Firestore", "Keep keys out of the repo"], skills: [["Dart", 2], ["Git & GitHub", 1]] },
      { title: "Publishing to the Play Store", hours: 8, objectives: ["Sign a release build", "Prepare a store listing", "Ship an update safely"], skills: [["Git & GitHub", 2], ["Communication", 1]] },
    ],
  },
  {
    code: "AI",
    title: "AI & Machine Learning",
    level: "Advanced",
    weeks: 16,
    description:
      "From regression to neural networks — build, evaluate and deploy models that actually hold up.",
    skills: [["Machine Learning", "ADVANCED"], ["Deep Learning", "ADVANCED"], ["Statistics", "INTERMEDIATE"], ["Python Basics", "INTERMEDIATE"]],
    modules: [
      { title: "Python for AI", hours: 10, objectives: ["Use numpy and pandas fluently", "Vectorise instead of looping", "Set up a reproducible notebook"], skills: [["Python Basics", 2], ["Pandas", 2]] },
      { title: "Mathematics & Statistics for ML", hours: 14, objectives: ["Work with vectors and matrices", "Understand gradients", "Reason about bias and variance"], skills: [["Statistics", 3], ["Algorithms", 1]] },
      { title: "Supervised Learning", hours: 16, objectives: ["Train regression and classification models", "Cross-validate honestly", "Read a confusion matrix"], skills: [["Machine Learning", 3], ["Statistics", 1]] },
      { title: "Unsupervised Learning & Feature Engineering", hours: 14, objectives: ["Cluster unlabelled data", "Engineer useful features", "Reduce dimensionality"], skills: [["Machine Learning", 3], ["Pandas", 1]] },
      { title: "Deep Learning with Neural Networks", hours: 18, objectives: ["Build a network in PyTorch", "Train without overfitting", "Use transfer learning"], skills: [["Deep Learning", 3], ["Machine Learning", 2]] },
      { title: "Deploying AI Models", hours: 12, objectives: ["Serve a model behind an API", "Monitor drift", "Version models and data"], skills: [["Deep Learning", 2], ["Git & GitHub", 2]] },
    ],
  },
];
const courseByCode = Object.fromEntries(COURSES.map((c) => [c.code, c]));

// ---------------------------------------------------------------- batches
const BATCHES = [
  ["PY-12", "PY", "Python Programming — Morning", "Mon & Thu, 9:00–11:00 AM"],
  ["PY-13", "PY", "Python Programming — Evening", "Tue & Fri, 6:00–8:00 PM"],
  ["DS-04", "DS", "Data Science — Evening", "Mon & Thu, 6:00–8:30 PM"],
  ["DS-05", "DS", "Data Science — Weekend", "Sat & Sun, 10:00 AM–1:00 PM"],
  ["WD-09", "WD", "Web Development — Morning", "Mon & Wed, 9:00–11:30 AM"],
  ["WD-10", "WD", "Web Development — Evening", "Tue & Thu, 6:00–8:30 PM"],
  ["GD-06", "GD", "Graphic Design — Afternoon", "Wed & Sat, 2:00–4:30 PM"],
  ["DM-03", "DM", "Digital Marketing — Evening", "Mon & Wed, 7:00–9:00 PM"],
  ["EC-07", "EC", "E-Commerce (Amazon) — Evening", "Tue & Fri, 7:00–9:00 PM"],
  ["FL-02", "FL", "Flutter App Development — Evening", "Mon & Thu, 6:30–9:00 PM"],
  ["AI-01", "AI", "AI & Machine Learning — Weekend", "Sat & Sun, 2:00–5:00 PM"],
  ["WD-11", "WD", "Web Development — Weekend", "Sat & Sun, 9:00 AM–12:00 PM"],
];

// ---------------------------------------------------------------- archetypes
// Hidden. Never written to the DB — every visible row is DERIVED from these,
// which is what stops a "struggling" student from showing 95% assessments.
const ARCH = {
  star:       { scoreBase: 0.91, scoreTrend: 0.06,  noise: 0.05, att: 0.96, attTrend: 0.0,   missing: 0.00, late: 0.05, progress: 1.00 },
  steady:     { scoreBase: 0.76, scoreTrend: 0.03,  noise: 0.08, att: 0.88, attTrend: 0.0,   missing: 0.04, late: 0.14, progress: 0.95 },
  declining:  { scoreBase: 0.85, scoreTrend: -0.34, noise: 0.06, att: 0.92, attTrend: -0.40, missing: 0.18, late: 0.20, progress: 0.70 },
  struggling: { scoreBase: 0.46, scoreTrend: -0.03, noise: 0.10, att: 0.68, attTrend: -0.08, missing: 0.35, late: 0.18, progress: 0.55 },
  irregular:  { scoreBase: 0.73, scoreTrend: 0.00,  noise: 0.10, att: 0.50, attTrend: 0.0,   missing: 0.22, late: 0.22, progress: 0.65 },
};
// 240 students: 34 star, 84 steady, 34 declining, 46 struggling, 42 irregular.
const ARCH_MIX = ["star", "steady", "declining", "steady", "struggling", "irregular", "steady", "star", "irregular", "steady", "struggling", "declining"];
const archFor = (i) => ARCH_MIX[(i * 5) % ARCH_MIX.length];

/** Score fraction for an archetype at timeline position t (0 = batch start, 1 = end). */
function scoreFrac(arch, t) {
  const a = ARCH[arch];
  return clamp(a.scoreBase + a.scoreTrend * t + (rnd() - 0.5) * a.noise, 0.05, 0.99);
}
function attendanceStatus(arch, t) {
  const a = ARCH[arch];
  const rate = clamp(a.att + a.attTrend * t, 0.15, 0.99);
  const r = rnd();
  if (r < rate) return "PRESENT";
  if (r < rate + 0.06) return "LATE";
  if (r < rate + 0.09) return "EXCUSED";
  return "ABSENT";
}
const gradeFor = (f) => (f >= 0.9 ? "A+" : f >= 0.8 ? "A" : f >= 0.7 ? "B" : f >= 0.6 ? "C" : "D");

// The one place a score becomes a level — mirrors lib/analytics.ts exactly.
function skillLevelFromScore(score) {
  if (score < 40) return null;
  if (score < 60) return "BEGINNER";
  if (score < 80) return "INTERMEDIATE";
  if (score < 93) return "ADVANCED";
  return "EXPERT";
}
const round1 = (n) => Math.round(n * 10) / 10;
const pct = (num, den) => (den > 0 ? round1((num / den) * 100) : 0);

// ---------------------------------------------------------------- insert helper
// ---------------------------------------------------------------- tenants
// Two institutes so tenant isolation is demonstrable, not theoretical. Every root row
// (user, student, instructor, course, batch, classroom) belongs to exactly one org.
const ORG_BQ = "org_bq";
const ORG_AKF = "org_akf";
const ORGS = [
  { id: ORG_BQ, name: "Bano Qabil — Karachi", slug: "bano-qabil" },
  { id: ORG_AKF, name: "Alkhidmat Skills Centre — Lahore", slug: "alkhidmat-lahore" },
];
const ROOT_MODELS = new Set(["user", "student", "instructor", "course", "batch", "classroom"]);

async function insert(model, rows, label) {
  // Root rows default to Bano Qabil; the second institute passes its org explicitly.
  if (ROOT_MODELS.has(model)) rows = rows.map((r) => ({ organizationId: ORG_BQ, ...r }));
  for (let i = 0; i < rows.length; i += 1000) {
    await db[model].createMany({ data: rows.slice(i, i + 1000), skipDuplicates: true });
  }
  console.log(`✓ ${label}: ${rows.length}`);
}

// ================================================================== main
async function main() {
  await insert("organization", ORGS, "organizations");
  const hash = await bcrypt.hash("password", 10); // hashed once — bcrypt is slow

  // ---------------- skills
  await insert(
    "skill",
    SKILLS.map(([name, category]) => ({ id: skillId(name), name, category })),
    "skills",
  );

  // ---------------- courses + modules + wiring
  const courseRows = [];
  const moduleRows = [];
  const courseSkillRows = [];
  const moduleSkillRows = [];
  for (const c of COURSES) {
    courseRows.push({
      id: `crs_${c.code}`,
      code: c.code,
      title: c.title,
      description: c.description,
      level: c.level,
      durationWeeks: c.weeks,
    });
    for (const [name, targetLevel] of c.skills) {
      courseSkillRows.push({ courseId: `crs_${c.code}`, skillId: skillId(name), targetLevel });
    }
    c.modules.forEach((m, i) => {
      const id = `mod_${c.code}_${i + 1}`;
      moduleRows.push({
        id,
        courseId: `crs_${c.code}`,
        order: i + 1,
        title: m.title,
        description: `${m.title} — module ${i + 1} of ${c.modules.length} in ${c.title}.`,
        objectives: m.objectives,
        durationHours: m.hours,
      });
      for (const [name, weight] of m.skills) {
        moduleSkillRows.push({ moduleId: id, skillId: skillId(name), weight });
      }
    });
  }
  await insert("course", courseRows, "courses");
  await insert("module", moduleRows, "modules");
  await insert("courseSkill", courseSkillRows, "course↔skill links");
  await insert("moduleSkill", moduleSkillRows, "module↔skill links");

  // ---------------- users: management
  const userRows = [];
  const MGMT = [
    ["admin@eduos.pk", "Dr. Shahid Mehmood"],
    ["director@eduos.pk", "Nadia Farhan"],
    ["registrar@eduos.pk", "Kamran Sheikh"],
  ];
  MGMT.forEach(([email, name], i) => {
    userRows.push({ id: `usr_mgmt_${i}`, email, passwordHash: hash, name, role: "MANAGEMENT" });
  });

  // ---------------- instructors (15)
  const instructorRows = [];
  for (let i = 0; i < 15; i++) {
    const name = i === 0 ? "Sir Kamran Aziz" : nameFor(i * 3 + 11);
    const email = i === 0 ? "instructor@eduos.pk" : `instructor${pad(i + 1, 2)}@eduos.pk`;
    const spec = COURSES[i % COURSES.length].title;
    userRows.push({ id: `usr_ins_${pad(i, 2)}`, email, passwordHash: hash, name, role: "INSTRUCTOR" });
    instructorRows.push({
      id: `ins_${pad(i, 2)}`,
      userId: `usr_ins_${pad(i, 2)}`,
      employeeNo: `EMP-${pad(100 + i, 4)}`,
      specialization: spec,
      bio: `Teaches ${spec} at Edu OS. ${3 + (i % 9)} years of industry experience before joining the institute.`,
      joinedAt: daysFromToday(-(400 + i * 37)),
    });
  }

  // ---------------- students (240)
  const N_STUDENTS = 240;
  const studentRows = [];
  const archOf = [];
  for (let i = 0; i < N_STUDENTS; i++) {
    const isDemo = i === 0;
    const name = isDemo ? "Ali Hassan" : nameFor(i);
    const email = isDemo ? "student@eduos.pk" : `student${pad(i + 1, 3)}@eduos.pk`;
    archOf[i] = isDemo ? "star" : archFor(i);
    userRows.push({ id: `usr_stu_${pad(i, 3)}`, email, passwordHash: hash, name, role: "STUDENT" });
    studentRows.push({
      id: `stu_${pad(i, 3)}`,
      userId: `usr_stu_${pad(i, 3)}`,
      rollNo: `BQ-2026-${pad(i + 1, 4)}`,
      phone: `+92 3${(i % 5) + 1}${pad(1000000 + ((i * 613) % 8999999), 7)}`,
      city: CITIES[(i * 5) % CITIES.length],
      education: EDUCATION[(i * 3) % EDUCATION.length],
      joinedAt: daysFromToday(-(90 + (i % 60))),
    });
  }

  await insert("user", userRows, "users (3 management, 15 instructors, 240 students)");
  await insert("instructor", instructorRows, "instructors");
  await insert("student", studentRows, "students");

  // ---------------- batches
  const batchRows = [];
  BATCHES.forEach(([code, courseCode, name, schedule], i) => {
    const completed = i >= 10;
    batchRows.push({
      id: `bat_${code}`,
      code,
      name,
      courseId: `crs_${courseCode}`,
      instructorId: `ins_${pad(i, 2)}`,
      startDate: daysFromToday(completed ? -112 : -70),
      endDate: daysFromToday(completed ? -14 : 14),
      schedule,
      capacity: 30,
      status: completed ? "COMPLETED" : "ACTIVE",
    });
  });
  await insert("batch", batchRows, "batches");

  // ---------------- classrooms
  const CLASSROOMS = [
    { name: "Room 101", building: "Main Block", capacity: 35, hasTech: true },
    { name: "Room 102", building: "Main Block", capacity: 35, hasTech: true },
    { name: "Lab A", building: "Tech Wing", capacity: 25, hasTech: true },
    { name: "Lab B", building: "Tech Wing", capacity: 25, hasTech: true },
    { name: "Seminar Hall", building: "Main Block", capacity: 60, hasTech: true },
    { name: "Room 201", building: "Annex", capacity: 20, hasTech: false },
  ];
  const classroomRows = CLASSROOMS.map((c, i) => ({
    id: `cls_${pad(i, 2)}`,
    ...c,
  }));
  await insert("classroom", classroomRows, "classrooms");

  // ---------------- schedule entries for active batches
  const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  const SLOTS = [
    { start: "08:00", end: "09:30" },
    { start: "09:30", end: "11:00" },
    { start: "11:00", end: "12:30" },
    { start: "14:00", end: "15:30" },
    { start: "15:30", end: "17:00" },
  ];
  const scheduleRows = [];
  const activeBatches = batchRows.filter((b) => b.status === "ACTIVE");
  activeBatches.forEach((batch, bi) => {
    const sessionsPerWeek = 3;
    for (let s = 0; s < sessionsPerWeek; s++) {
      const dayIdx = (bi * 3 + s) % DAYS.length;
      const slotIdx = (bi + s) % SLOTS.length;
      const roomIdx = (bi + s) % CLASSROOMS.length;
      scheduleRows.push({
        id: `sch_${batch.code}_${s}`,
        batchId: batch.id,
        instructorId: batch.instructorId,
        classroomId: classroomRows[roomIdx].id,
        day: DAYS[dayIdx],
        startTime: SLOTS[slotIdx].start,
        endTime: SLOTS[slotIdx].end,
      });
    }
  });
  await insert("schedule", scheduleRows, "schedule entries");

  // ---------------- enrollments (~25 per batch, 1–2 batches per student)
  const enrollmentRows = [];
  const enrollments = []; // { studentId, batchId, batchIdx, arch }
  const addEnrollment = (si, bi) => {
    const b = batchRows[bi];
    const arch = archOf[si];
    const id = `enr_${pad(si, 3)}_${BATCHES[bi][0]}`;
    if (enrollments.some((e) => e.studentId === `stu_${pad(si, 3)}` && e.batchId === b.id)) return;
    const completed = b.status === "COMPLETED";
    // finalGrade is derived from the same archetype that drives the marks,
    // so the grade can never contradict the transcript.
    const avg = clamp(ARCH[arch].scoreBase + ARCH[arch].scoreTrend * 0.55, 0.05, 0.99);
    enrollmentRows.push({
      id,
      studentId: `stu_${pad(si, 3)}`,
      batchId: b.id,
      enrolledAt: new Date(b.startDate.getTime() - 5 * DAY),
      status: completed ? "COMPLETED" : "ACTIVE",
      finalGrade: completed ? gradeFor(avg) : null,
    });
    enrollments.push({ id, studentId: `stu_${pad(si, 3)}`, batchId: b.id, batchIdx: bi, arch });
  };

  addEnrollment(0, 0); // Ali Hassan → PY-12, so the Skill Passport demo looks good
  for (let i = 1; i < N_STUDENTS; i++) addEnrollment(i, i % BATCHES.length);
  for (let i = 0; i < N_STUDENTS; i += 4) addEnrollment(i, ((i % BATCHES.length) + 1 + (i % 3)) % BATCHES.length);
  await insert("enrollment", enrollmentRows, "enrollments");

  // ---------------- per-batch: sessions, assignments, assessments, progress
  const sessionRows = [];
  const attendanceRows = [];
  const assignmentRows = [];
  const submissionRows = [];
  const assessmentRows = [];
  const resultRows = [];
  const progressRows = [];

  BATCHES.forEach(([code, courseCode], bi) => {
    const batch = batchRows[bi];
    const mods = COURSES.find((c) => c.code === courseCode).modules;
    const nMods = mods.length;
    const roster = enrollments.filter((e) => e.batchIdx === bi);
    const start = batch.startDate.getTime();

    // 20 sessions, twice a week, all in the past.
    const N_SESSIONS = 20;
    for (let s = 0; s < N_SESSIONS; s++) {
      const t = s / (N_SESSIONS - 1);
      const dayOffset = 7 * Math.floor(s / 2) + (s % 2 === 0 ? 0 : 3);
      const mi = Math.min(nMods - 1, Math.floor((s / N_SESSIONS) * nMods));
      const conducted = !(s === 5 + (bi % 3) || (s === 15 && bi % 2 === 1));
      const sessionId = `ses_${code}_${pad(s, 2)}`;
      sessionRows.push({
        id: sessionId,
        batchId: batch.id,
        moduleId: `mod_${courseCode}_${mi + 1}`,
        date: new Date(start + dayOffset * DAY),
        topic: `${mods[mi].title} — part ${(s % 3) + 1}`,
        conducted,
        instructorPresent: conducted && !(s === 11 && bi % 4 === 0),
      });
      // A class that never ran has no attendance to take.
      if (!conducted) continue;
      for (const e of roster) {
        attendanceRows.push({
          id: `att_${code}_${pad(s, 2)}_${e.studentId.slice(4)}`,
          sessionId,
          studentId: e.studentId,
          status: attendanceStatus(e.arch, t),
        });
      }
    }

    // 3 assignments — weeks 3, 6, 9 — pinned to modules 2, 3, 4.
    [
      [1, 21, 0.25],
      [2, 42, 0.55],
      [3, 63, 0.85],
    ].forEach(([mi, dayOffset, t], ai) => {
      const m = mods[Math.min(mi, nMods - 1)];
      const assignmentId = `asg_${code}_${ai + 1}`;
      const maxScore = 50;
      assignmentRows.push({
        id: assignmentId,
        batchId: batch.id,
        moduleId: `mod_${courseCode}_${Math.min(mi, nMods - 1) + 1}`,
        title: `Assignment ${ai + 1}: ${m.title}`,
        description: `Apply what you learned in "${m.title}". ${m.objectives[0]}.`,
        maxScore,
        dueDate: new Date(start + dayOffset * DAY),
      });
      for (const e of roster) {
        const a = ARCH[e.arch];
        const id = `sub_${code}_${ai + 1}_${e.studentId.slice(4)}`;
        // A declining student misses more as the term goes on.
        const missChance = a.missing * (e.arch === "declining" ? 0.4 + 1.6 * t : 1);
        if (rnd() < missChance) {
          submissionRows.push({ id, assignmentId, studentId: e.studentId, score: null, status: "MISSING", submittedAt: null });
          continue;
        }
        const late = rnd() < a.late;
        const frac = scoreFrac(e.arch, t) * (late ? 0.94 : 1);
        submissionRows.push({
          id,
          assignmentId,
          studentId: e.studentId,
          score: Math.round(clamp(frac, 0.05, 1) * maxScore),
          status: late ? "LATE" : "GRADED",
          submittedAt: new Date(start + (dayOffset + (late ? 2 : -1)) * DAY),
        });
      }
    });

    // 3 assessments — QUIZ / MIDTERM / FINAL — each pinned to a module so
    // moduleWeakness() and recomputeStudentSkills() have something to chew on.
    [
      ["QUIZ", 0, 20, 25, 0.25],
      ["MIDTERM", 2, 42, 50, 0.55],
      ["FINAL", Math.min(4, nMods - 1), 66, 100, 0.85],
    ].forEach(([type, mi, dayOffset, maxScore, t]) => {
      const m = mods[mi];
      const assessmentId = `ass_${code}_${type}`;
      assessmentRows.push({
        id: assessmentId,
        batchId: batch.id,
        moduleId: `mod_${courseCode}_${mi + 1}`,
        title: `${type === "QUIZ" ? "Quiz 1" : type === "MIDTERM" ? "Mid-Term Exam" : "Final Exam"} — ${m.title}`,
        type,
        maxScore,
        scheduledAt: new Date(start + dayOffset * DAY),
      });
      for (const e of roster) {
        resultRows.push({
          id: `res_${code}_${type}_${e.studentId.slice(4)}`,
          assessmentId,
          studentId: e.studentId,
          score: Math.round(scoreFrac(e.arch, t) * maxScore),
        });
      }
    });

    // Module progress — how far each student has actually got.
    const batchProgress = batch.status === "COMPLETED" ? 1 : 0.8;
    for (const e of roster) {
      const done = Math.round(nMods * batchProgress * ARCH[e.arch].progress);
      for (let mi = 0; mi < nMods; mi++) {
        const status = mi < done ? "COMPLETED" : mi === done ? "IN_PROGRESS" : "NOT_STARTED";
        progressRows.push({
          id: `prg_${e.id.slice(4)}_${mi + 1}`,
          enrollmentId: e.id,
          moduleId: `mod_${courseCode}_${mi + 1}`,
          status,
          completedAt: status === "COMPLETED" ? new Date(start + (10 + mi * 12) * DAY) : null,
        });
      }
    }
  });

  await insert("classSession", sessionRows, "class sessions");
  await insert("attendance", attendanceRows, "attendance rows");
  await insert("assignment", assignmentRows, "assignments");
  await insert("submission", submissionRows, "submissions");
  await insert("assessment", assessmentRows, "assessments");
  await insert("assessmentResult", resultRows, "assessment results");
  await insert("moduleProgress", progressRows, "module progress rows");

  // ---------------- skills passport
  // Faithful re-implementation of recomputeStudentSkills() from lib/analytics.ts,
  // done in ONE bulk query for all 240 students instead of 240 round trips.
  const results = await db.assessmentResult.findMany({
    select: {
      studentId: true,
      score: true,
      assessment: {
        select: {
          maxScore: true,
          module: { select: { skills: { select: { skillId: true, weight: true } } } },
        },
      },
    },
  });
  const acc = new Map(); // studentId -> Map(skillId -> {got,max,n})
  for (const r of results) {
    const perStudent = acc.get(r.studentId) ?? new Map();
    for (const ms of r.assessment.module?.skills ?? []) {
      const row = perStudent.get(ms.skillId) ?? { got: 0, max: 0, n: 0 };
      row.got += r.score * ms.weight;
      row.max += r.assessment.maxScore * ms.weight;
      row.n += 1;
      perStudent.set(ms.skillId, row);
    }
    acc.set(r.studentId, perStudent);
  }
  const studentSkillRows = [];
  for (const [studentId, perStudent] of acc) {
    for (const [sid, r] of perStudent) {
      const score = Math.round(pct(r.got, r.max));
      const level = skillLevelFromScore(score);
      if (!level) continue; // below 40% is not yet a skill you can claim
      studentSkillRows.push({
        id: `ssk_${studentId.slice(4)}_${sid.slice(4)}`,
        studentId,
        skillId: sid,
        level,
        score,
        evidenceCount: r.n,
      });
    }
  }
  await insert("studentSkill", studentSkillRows, "student skills (derived from assessment evidence)");

  await seedSecondInstitute(hash);
  await seedGapEvidence();

  // Databases seeded before tenancy have null-org root rows: they are all Bano Qabil's.
  for (const m of ROOT_MODELS) {
    const { count } = await db[m].updateMany({ where: { organizationId: null }, data: { organizationId: ORG_BQ } });
    if (count) console.log(`✓ backfilled ${count} ${m} rows → ${ORG_BQ}`);
  }

  console.log("\nDemo logins (password: password)");
  console.log("  student@eduos.pk     Ali Hassan — star student, batch PY-12 (Python Programming)");
  console.log("  instructor@eduos.pk  Sir Kamran Aziz — teaches PY-12");
  console.log("  admin@eduos.pk       Dr. Shahid Mehmood — management");
  console.log("  admin@alkhidmat.pk   Ayesha Siddiqui — management, Alkhidmat (second tenant)");
}

// ================================================================== second tenant
// A small but complete institute: course → modules → batch → sessions → enrollments →
// attendance, results and progress, so every consistency invariant holds for it too.
async function seedSecondInstitute(hash) {
  const o = ORG_AKF;
  await insert("user", [
    { id: "usr_akf_mgmt", email: "admin@alkhidmat.pk", passwordHash: hash, name: "Ayesha Siddiqui", role: "MANAGEMENT", organizationId: o },
    { id: "usr_akf_ins", email: "instructor@alkhidmat.pk", passwordHash: hash, name: "Sir Bilal Ahmed", role: "INSTRUCTOR", organizationId: o },
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `usr_akf_stu_${i}`, email: `student${i + 1}@alkhidmat.pk`, passwordHash: hash,
      name: nameFor(500 + i * 7), role: "STUDENT", organizationId: o,
    })),
  ], "second tenant users");
  await insert("instructor", [{
    id: "ins_akf_0", userId: "usr_akf_ins", employeeNo: "AKF-EMP-0001", specialization: "Computer & Web Basics",
    bio: "Teaches Computer & Web Basics at Alkhidmat Skills Centre.", joinedAt: daysFromToday(-300), organizationId: o,
  }], "second tenant instructor");
  await insert("student", Array.from({ length: 6 }, (_, i) => ({
    id: `stu_akf_${i}`, userId: `usr_akf_stu_${i}`, rollNo: `AKF-2026-${pad(i + 1, 4)}`,
    phone: `+92 30${pad(1000000 + i * 4111, 7)}`, city: "Lahore", education: EDUCATION[i % EDUCATION.length],
    joinedAt: daysFromToday(-60), organizationId: o,
  })), "second tenant students");
  await insert("course", [{
    id: "crs_AKF", code: "AKF-CW", title: "Computer & Web Basics",
    description: "Computer literacy, the web and a first HTML page.", level: "Beginner", durationWeeks: 8, organizationId: o,
  }], "second tenant course");
  const mods = ["Computer Fundamentals", "Internet & Email", "First Web Page"];
  await insert("module", mods.map((title, i) => ({
    id: `mod_AKF_${i + 1}`, courseId: "crs_AKF", order: i + 1, title,
    description: `${title} — module ${i + 1} of ${mods.length}.`, durationHours: 6,
  })), "second tenant modules");
  await insert("classroom", [{ id: "cls_akf_0", name: "AKF Lab 1", building: "Alkhidmat Centre", capacity: 20, hasTech: true, organizationId: o }], "second tenant classroom");
  await insert("batch", [{
    id: "bat_AKF-01", code: "AKF-01", name: "Computer & Web Basics — Morning", courseId: "crs_AKF", instructorId: "ins_akf_0",
    startDate: daysFromToday(-42), endDate: daysFromToday(14), schedule: "Mon & Wed, 10:00 AM–12:00 PM",
    capacity: 20, status: "ACTIVE", organizationId: o,
  }], "second tenant batch");
  await insert("schedule", [
    { id: "sch_AKF-01_0", batchId: "bat_AKF-01", instructorId: "ins_akf_0", classroomId: "cls_akf_0", day: "MONDAY", startTime: "10:00", endTime: "12:00" },
    { id: "sch_AKF-01_1", batchId: "bat_AKF-01", instructorId: "ins_akf_0", classroomId: "cls_akf_0", day: "WEDNESDAY", startTime: "10:00", endTime: "12:00" },
  ], "second tenant schedule");
  const sessions = Array.from({ length: 6 }, (_, i) => ({
    id: `ses_AKF_${i}`, batchId: "bat_AKF-01", moduleId: `mod_AKF_${Math.min(3, Math.floor(i / 2) + 1)}`,
    date: daysFromToday(-40 + i * 7), topic: `Session ${i + 1}`,
  }));
  await insert("classSession", sessions, "second tenant sessions");
  await insert("enrollment", Array.from({ length: 6 }, (_, i) => ({
    id: `enr_akf_${i}`, studentId: `stu_akf_${i}`, batchId: "bat_AKF-01", enrolledAt: daysFromToday(-42), status: "ACTIVE",
  })), "second tenant enrollments");
  await insert("attendance", sessions.flatMap((ses, si) => Array.from({ length: 6 }, (_, i) => ({
    id: `att_akf_${si}_${i}`, sessionId: ses.id, studentId: `stu_akf_${i}`,
    status: (si + i) % 5 === 0 ? "ABSENT" : "PRESENT",
  }))), "second tenant attendance");
  await insert("assessment", [
    { id: "asm_AKF_1", batchId: "bat_AKF-01", moduleId: "mod_AKF_1", title: "Fundamentals Quiz", type: "QUIZ", maxScore: 20, scheduledAt: daysFromToday(-28) },
    { id: "asm_AKF_2", batchId: "bat_AKF-01", moduleId: "mod_AKF_2", title: "Internet Midterm", type: "MIDTERM", maxScore: 50, scheduledAt: daysFromToday(-14) },
  ], "second tenant assessments");
  await insert("assessmentResult", Array.from({ length: 6 }, (_, i) => [
    { id: `res_akf_1_${i}`, assessmentId: "asm_AKF_1", studentId: `stu_akf_${i}`, score: 12 + i },
    { id: `res_akf_2_${i}`, assessmentId: "asm_AKF_2", studentId: `stu_akf_${i}`, score: 28 + i * 3 },
  ]).flat(), "second tenant results");
  await insert("moduleProgress", Array.from({ length: 6 }, (_, i) => mods.map((_, m) => ({
    id: `mp_akf_${i}_${m + 1}`, enrollmentId: `enr_akf_${i}`, moduleId: `mod_AKF_${m + 1}`,
    status: m === 0 ? "COMPLETED" : m === 1 ? "IN_PROGRESS" : "NOT_STARTED",
    completedAt: m === 0 ? daysFromToday(-28) : null,
  }))).flat(), "second tenant module progress");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

// ================================================================== gap evidence
// Per-question answers for Gap Finder. Runs AFTER everything else and reads the totals that
// are actually stored (here or in production), then splits each one across the assessment's
// questions with its own PRNG — so sum(question marks) === AssessmentResult.score, always,
// and the main generator's sequence (and therefore every existing row) is untouched.
// Idempotent: questions are only written where null; responses use createMany skipDuplicates.
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Real questions and answer keys for the assessments the finale demo scans live. Concept strings
// must match the module objectives so the seeded per-question evidence lines up.
const DEMO_QUESTIONS = {
  "ass_PY-12_QUIZ": [
    { id: "q1", concept: "Install Python and VS Code", marks: 9,
      q: "How do you check, from the terminal, which Python version is installed? Write the command.",
      a: "python --version (or python3 --version / py --version on Windows) prints the installed version, e.g. Python 3.12.1." },
    { id: "q2", concept: "Write and run a first script", marks: 8,
      q: "Write a script hello.py that asks for the user's name and greets them, and the command to run it.",
      a: "name = input(\"Your name: \"); print(\"Hello, \" + name) — run with: python hello.py" },
    { id: "q3", concept: "Use variables and basic types", marks: 8,
      q: "What is the type of each value: 42, 3.5, \"42\", True? What does int(\"42\") + 1 give?",
      a: "int, float, str, bool. int(\"42\") + 1 gives 43 (an int)." },
  ],
  "ass_PY-12_MIDTERM": [
    { id: "q1", concept: "Work with lists, dicts, sets and tuples", marks: 17,
      q: "What is the difference between a list and a tuple? Give one example of each and one situation where you would use a tuple.",
      a: "Lists are mutable, tuples are immutable. e.g. marks = [70, 85]; point = (3, 4). Use a tuple for fixed data such as coordinates or a dictionary key." },
    { id: "q2", concept: "Choose the right structure for a task", marks: 17,
      q: "During attendance you must check quickly whether a roll number was already marked present. Which data structure would you use, and why?",
      a: "A set: membership checks (roll in present) are O(1) on average and duplicates are ignored automatically." },
    { id: "q3", concept: "Reason about time cost", marks: 16,
      q: "What is the time cost of `x in my_list` versus `x in my_set` for 100,000 items? Explain why.",
      a: "List: O(n), it scans item by item. Set: O(1) average, it hashes x and jumps to the bucket." },
  ],
};

async function seedGapEvidence() {
  const assessments = await db.assessment.findMany({
    select: {
      id: true, maxScore: true, questions: true, moduleId: true,
      module: { select: { id: true, title: true, objectives: true, skills: { select: { skillId: true, weight: true } } } },
      results: { select: { studentId: true, score: true } },
    },
  });
  const responseRows = [];
  let questionsWritten = 0;

  for (const a of assessments) {
    const concepts = (a.module?.objectives?.length ? a.module.objectives : [a.module?.title ?? "Core concepts"]).slice(0, 4);
    const skills = (a.module?.skills ?? []).slice().sort((x, y) => y.weight - x.weight);
    const n = concepts.length;
    const base = Math.floor(a.maxScore / n);
    const marks = concepts.map((_, i) => base + (i < a.maxScore - base * n ? 1 : 0));
    const demo = DEMO_QUESTIONS[a.id];
    const questions = demo ? demo.map((d) => ({ ...d, module: a.module?.title ?? "", skillId: skills.length ? skills[demo.indexOf(d) % skills.length].skillId : null })) : concepts.map((concept, i) => ({
      id: `q${i + 1}`,
      q: `Explain or demonstrate: ${concept}.`,
      a: `A correct answer shows the student can ${concept.charAt(0).toLowerCase()}${concept.slice(1)}, with a working example.`,
      marks: marks[i],
      concept,
      skillId: skills.length ? skills[i % skills.length].skillId : null,
      module: a.module?.title ?? "",
    }));
    if (a.questions == null) {
      await db.assessment.update({ where: { id: a.id }, data: { questions } });
      questionsWritten++;
    }
    const qs = Array.isArray(a.questions) && a.questions.length ? a.questions : questions;
    // Concept difficulty is shared by everyone, so batch-level gaps exist, not just noise.
    const difficulty = qs.map((q) => ((hashStr(String(q.concept ?? q.q)) % 1000) / 1000) * 0.35 - 0.2);

    for (const r of a.results) {
      const rnd2 = mulberry32(hashStr(`${a.id}|${r.studentId}`));
      const frac = a.maxScore ? r.score / a.maxScore : 0;
      const weak = hashStr(`${r.studentId}|${a.moduleId}`) % qs.length; // one personal weak concept
      let m = qs.map((q, i) => {
        const dip = i === weak ? 0.15 + 0.4 * (1 - frac) : 0;
        const f = clamp(frac - difficulty[i] - dip + (rnd2() - 0.5) * 0.1, 0, 1);
        return Math.round(f * q.marks);
      });
      // Repair rounding so the per-question marks sum to the stored total exactly.
      let diff = r.score - m.reduce((s, x) => s + x, 0);
      for (let guard = 0; diff !== 0 && guard < 1000; guard++) {
        const i = guard % qs.length;
        // Prefer not to add marks to the weak concept, unless nothing else has room left.
        const j = diff > 0 && i === weak && guard < qs.length * 3 ? (i + 1) % qs.length : i;
        if (diff > 0 && m[j] < qs[j].marks) { m[j]++; diff--; }
        else if (diff < 0 && m[j] > 0) { m[j]--; diff++; }
      }
      qs.forEach((q, i) => {
        const ratio = q.marks ? m[i] / q.marks : 0;
        const concept = String(q.concept ?? q.module ?? "this topic");
        responseRows.push({
          id: `rsp_${a.id.slice(4)}_${r.studentId.slice(4)}_${q.id}`,
          assessmentId: a.id,
          studentId: r.studentId,
          questionId: String(q.id),
          answer: ratio >= 0.8
            ? `Correct approach to "${concept}", with a working example.`
            : ratio >= 0.4
              ? `Partly right on "${concept}" — the idea is there but the example is incomplete.`
              : `Confuses "${concept}" with a related idea; the example does not run.`,
          marks: m[i],
          maxMarks: q.marks,
          concept,
          skillId: q.skillId ?? null,
          feedback: null,
          source: "seed",
          gradedBy: "seed",
        });
      });
    }
  }
  await insert("assessmentResponse", responseRows, `per-question responses (${questionsWritten} question sets written)`);
}
