import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser, homeFor } from "@/lib/auth";
import { db } from "@/lib/db";
import { PublicPage } from "@/components/public/PublicPage";
import { Hero } from "@/components/public/Hero";
import { Features } from "@/components/public/Features";
import { Courses } from "@/components/public/Courses";
import { HowItWorks } from "@/components/public/HowItWorks";
import { Testimonials } from "@/components/public/Testimonials";
import { ContactSection } from "@/components/public/ContactSection";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Free IT Training & AI-Powered Institute OS",
  description:
    "Admissions to employability: Edu OS powers free IT training institutes with attendance, assessments, skill passports, and AI guidance.",
};

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect(homeFor(user.role));

  const courses = await db.course.findMany({
    orderBy: { code: "asc" },
    select: {
      code: true,
      title: true,
      description: true,
      level: true,
      durationWeeks: true,
      _count: { select: { modules: true } },
    },
  });

  return (
    <PublicPage>
      <Hero />
      <Features />
      <Courses courses={courses} />
      <HowItWorks />
      <Testimonials />
      <ContactSection />
    </PublicPage>
  );
}
