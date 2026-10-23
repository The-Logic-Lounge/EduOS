/**
 * Alibaba Cloud certification pathway. The Alibaba Cloud × Alkhidmat MoU (4 May 2026) promises
 * "globally recognised certification pathways" for the Bano Qabil centres; this maps a student's
 * evidence-backed Skill Passport onto one of those certifications.
 *
 * Sources (keep in sync with the UI copy):
 *  - Exam facts: alibabacloud.com/en/academy/certification/aca_generative_ai (USD 200, 50
 *    questions, 90 min, pass 70/100, English).
 *  - Domain weights: Alibaba Cloud's ACA LLM Engineer exam-outline update
 *    (help.aliyun.com/en/document_detail/3041689.html): 18/20/22/12/16/12.
 *  - The skill → domain mapping is EDUOS's own judgement of prerequisite evidence, not Alibaba's.
 */

export type Domain = { id: string; name: string; weight: number; skills: string[]; studyNote: string };
export type Certification = {
  id: string;
  name: string;
  vendor: string;
  priceUsd: number;
  questions: number;
  minutes: number;
  passMark: number;
  url: string;
  domains: Domain[];
};

export const ACA_GENAI: Certification = {
  id: "aca-genai",
  name: "ACA Generative AI Engineer",
  vendor: "Alibaba Cloud",
  priceUsd: 200,
  questions: 50,
  minutes: 90,
  passMark: 70,
  url: "https://www.alibabacloud.com/en/academy/certification/aca_generative_ai",
  domains: [
    { id: "concepts", name: "LLM concepts", weight: 18, skills: ["Machine Learning", "Deep Learning", "Statistics"],
      studyNote: "How large language models are trained and evaluated: tokens, embeddings, transformers." },
    { id: "prompting", name: "Prompt engineering", weight: 20, skills: ["Problem Solving", "Communication", "Python Basics"],
      studyNote: "Structured prompts, few-shot examples and JSON output — practise in Model Studio's playground." },
    { id: "rag", name: "Enhancing LLM applications (RAG)", weight: 22, skills: ["Python Basics", "SQL", "Pandas"],
      studyNote: "Retrieval-augmented generation: chunking, embeddings and search over your own data." },
    { id: "finetune", name: "Fine-tuning", weight: 12, skills: ["Machine Learning", "Deep Learning"],
      studyNote: "When to fine-tune versus prompt or retrieve; datasets and evaluation." },
    { id: "agents", name: "Agents", weight: 16, skills: ["Python Basics", "Algorithms", "Object-Oriented Programming"],
      studyNote: "Tool calling and multi-step agents; build one small agent with function calling." },
    { id: "safety", name: "Security & compliance", weight: 12, skills: [],
      studyNote: "Not covered by EDUOS courses yet: data privacy, prompt injection, content safety." },
  ],
};

export const CERTIFICATIONS = [ACA_GENAI];
