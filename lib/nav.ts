import type { Role } from "@prisma/client";

export type NavItem = { href: string; label: string };

// One array per role. Each owner edits only their own — no merge conflicts.
export const STUDENT_NAV: NavItem[] = [
  { href: "/student", label: "Dashboard" },
  { href: "/student/courses", label: "My Courses" },
  { href: "/student/attendance", label: "Attendance" },
  { href: "/student/assessments", label: "Assessments" },
  { href: "/student/assignments", label: "Assignments" },
  { href: "/student/timetable", label: "Timetable" },
  { href: "/student/passport", label: "Skill Passport" },
  { href: "/student/career", label: "Career Path" },
];

export const INSTRUCTOR_NAV: NavItem[] = [
  { href: "/instructor", label: "Dashboard" },
  { href: "/instructor/batches", label: "My Batches" },
  { href: "/instructor/timetable", label: "Timetable" },
  { href: "/instructor/copilot", label: "AI Copilot" },
  { href: "/courses", label: "Courses" },
];

export const MANAGEMENT_NAV: NavItem[] = [
  { href: "/management", label: "Dashboard" },
  { href: "/management/students", label: "Students" },
  { href: "/management/instructors", label: "Instructors" },
  { href: "/management/courses", label: "Courses" },
  { href: "/management/intelligence", label: "AI Intelligence" },
  { href: "/management/ask", label: "Ask Edu OS" },
  { href: "/management/timetable", label: "Timetable" },
];

export const navFor = (role: Role): NavItem[] =>
  role === "STUDENT" ? STUDENT_NAV : role === "INSTRUCTOR" ? INSTRUCTOR_NAV : MANAGEMENT_NAV;
