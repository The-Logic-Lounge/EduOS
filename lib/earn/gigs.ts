/**
 * First-gig reference catalog.
 *
 * INDICATIVE REFERENCE RANGES COMPILED OCT 2026 — NOT LIVE MARKETPLACE DATA.
 * Starter prices are what a new seller with no reviews can realistically ask for a first
 * small order; they are not scraped and not a promise. Skill names must match Skill.name
 * in prisma/seed.mjs exactly (the matcher joins on name).
 */

export const CATALOG_NOTE = "Indicative reference ranges compiled Oct 2026 — not live marketplace data";

/** Assumption, not a live rate. One constant so the demo can change it in one place. */
export const PKR_PER_USD = 280;
export const PKR_NOTE = `PKR at an assumed ${PKR_PER_USD} per USD`;

export type Platform = "Fiverr" | "Upwork";

export type Gig = {
  id: string;
  title: string;
  /** Fiverr-style "I will …" phrase. */
  pitch: string;
  platforms: Platform[];
  /** [Skill.name, weight] — weight 3 = the gig is this skill, 1 = helps. */
  skills: [string, number][];
  priceUsd: [number, number];
  deliveryDays: number;
  clientAsk: string;
};

export const GIGS: Gig[] = [
  {
    id: "python-automation",
    title: "Python automation scripts",
    pitch: "automate your repetitive tasks with Python scripts",
    platforms: ["Fiverr", "Upwork"],
    skills: [["Python Basics", 3], ["Problem Solving", 2], ["Git & GitHub", 1], ["Object-Oriented Programming", 1]],
    priceUsd: [15, 50],
    deliveryDays: 3,
    clientAsk: "Automate a boring chore: rename or merge files, fill a spreadsheet, pull data from a website.",
  },
  {
    id: "data-cleaning",
    title: "Data cleaning & analysis",
    pitch: "clean and analyse your Excel or CSV data with Python",
    platforms: ["Fiverr", "Upwork"],
    skills: [["Pandas", 3], ["Excel", 2], ["Python Basics", 1], ["Data Visualization", 1]],
    priceUsd: [20, 60],
    deliveryDays: 3,
    clientAsk: "Clean a messy CSV or Excel export and return a tidy file with a short summary.",
  },
  {
    id: "sql-reports",
    title: "SQL queries & reports",
    pitch: "write SQL queries and build your business reports",
    platforms: ["Upwork", "Fiverr"],
    skills: [["SQL", 3], ["Excel", 2], ["Data Visualization", 1]],
    priceUsd: [25, 75],
    deliveryDays: 3,
    clientAsk: "Write the queries behind a monthly sales or inventory report.",
  },
  {
    id: "landing-page",
    title: "Landing page / WordPress site",
    pitch: "build a responsive landing page for your business",
    platforms: ["Fiverr", "Upwork"],
    skills: [["JavaScript", 2], ["UI/UX Design", 2], ["SEO", 1], ["Git & GitHub", 1]],
    priceUsd: [30, 100],
    deliveryDays: 5,
    clientAsk: "A one-page site for a small business: responsive, fast, with a contact form.",
  },
  {
    id: "react-fixes",
    title: "React front-end fixes",
    pitch: "fix bugs and build components in your React app",
    platforms: ["Upwork", "Fiverr"],
    skills: [["React", 3], ["JavaScript", 3], ["Git & GitHub", 1]],
    priceUsd: [25, 80],
    deliveryDays: 2,
    clientAsk: "Fix a broken component, a layout bug, or wire a form to an API.",
  },
  {
    id: "flutter-fixes",
    title: "Flutter app fixes",
    pitch: "fix bugs and add features to your Flutter app",
    platforms: ["Upwork", "Fiverr"],
    skills: [["Dart", 3], ["Object-Oriented Programming", 1], ["UI/UX Design", 1], ["Git & GitHub", 1]],
    priceUsd: [30, 100],
    deliveryDays: 4,
    clientAsk: "Fix a crashing screen, add a small feature, or update packages so the app builds again.",
  },
  {
    id: "logo-design",
    title: "Logo & brand identity",
    pitch: "design a modern logo and brand identity",
    platforms: ["Fiverr"],
    skills: [["Adobe Illustrator", 3], ["Brand Identity", 3], ["Communication", 1]],
    priceUsd: [15, 60],
    deliveryDays: 3,
    clientAsk: "A logo with two or three concepts, vector files, and a colour palette.",
  },
  {
    id: "social-design",
    title: "Social media post design",
    pitch: "design eye-catching social media posts",
    platforms: ["Fiverr"],
    skills: [["Adobe Photoshop", 3], ["Social Media Marketing", 2], ["Content Strategy", 1]],
    priceUsd: [10, 40],
    deliveryDays: 2,
    clientAsk: "A set of on-brand Instagram or Facebook posts for a small shop.",
  },
  {
    id: "seo-audit",
    title: "SEO audit & keyword plan",
    pitch: "do an SEO audit and keyword plan for your website",
    platforms: ["Fiverr", "Upwork"],
    skills: [["SEO", 3], ["Content Strategy", 2], ["Excel", 1]],
    priceUsd: [25, 80],
    deliveryDays: 4,
    clientAsk: "Audit a site's on-page SEO and hand back a prioritised keyword list.",
  },
  {
    id: "amazon-va",
    title: "Amazon VA / product listings",
    pitch: "write and optimise your Amazon product listings",
    platforms: ["Upwork", "Fiverr"],
    skills: [["Amazon FBA", 3], ["SEO", 2], ["Excel", 1], ["Communication", 1]],
    priceUsd: [15, 50],
    deliveryDays: 3,
    clientAsk: "Write or optimise product listings and research keywords for an Amazon seller.",
  },
  {
    id: "store-setup",
    title: "E-commerce store setup",
    pitch: "set up your Shopify or WooCommerce store",
    platforms: ["Fiverr", "Upwork"],
    skills: [["UI/UX Design", 2], ["SEO", 2], ["Content Strategy", 1], ["Adobe Photoshop", 1]],
    priceUsd: [50, 150],
    deliveryDays: 7,
    clientAsk: "Set up a Shopify or WooCommerce store: theme, products, pages and payments.",
  },
  {
    id: "ai-chatbot",
    title: "AI chatbot setup",
    pitch: "build an AI chatbot trained on your business FAQs",
    platforms: ["Upwork", "Fiverr"],
    skills: [["Python Basics", 2], ["Machine Learning", 2], ["Deep Learning", 1], ["Git & GitHub", 1]],
    priceUsd: [50, 150],
    deliveryDays: 5,
    clientAsk: "A FAQ chatbot for a website or WhatsApp, trained on the business's own documents.",
  },
];

export const gigById = (id: string) => GIGS.find((g) => g.id === id);

export const toPkr = (usd: number) => Math.round((usd * PKR_PER_USD) / 100) * 100;
