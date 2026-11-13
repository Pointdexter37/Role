import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

type Job = {
  title: string;
  company: string;
  location: string;
  mode: string;
  match: number;
  skills: string[];
  url: string;
  reason: string;
};

type ExperienceProfile = {
  years: number | null;
  level: "student / entry-level" | "early-career" | "mid-level" | "senior";
};
type ExperienceLevel = ExperienceProfile["level"];

type SourceJob = {
  title?: string;
  company_name?: string;
  company?: string;
  candidate_required_location?: string;
  location?: string;
  url?: string;
  description?: string;
  tags?: string[];
};

const skillNames = [
  "TypeScript", "JavaScript", "React", "Next.js", "Node.js", "Python",
  "Java", "C#", "Go", "PostgreSQL", "SQL", "MongoDB", "AWS", "Azure",
  "Docker", "Kubernetes", "GraphQL", "Tailwind", "Figma", "Git"
];

function cleanHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractSkills(value: string) {
  return skillNames.filter((skill) => new RegExp(`\\b${skill.replace(".", "\\.")}\\b`, "i").test(value));
}

function getExperienceProfile(resume: string): ExperienceProfile {
  const normalized = resume.toLowerCase();
  const explicitYears = [...normalized.matchAll(/(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?experience/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  const currentYear = new Date().getFullYear();
  const dateYears = [...normalized.matchAll(/\b(19|20)\d{2}\b/g)]
    .map((match) => Number(match[0]))
    .filter((year) => year >= 1990 && year <= currentYear);
  const estimatedYears = explicitYears.length
    ? Math.max(...explicitYears)
    : dateYears.length >= 2
      ? Math.min(20, Math.max(0, currentYear - Math.min(...dateYears)))
      : null;
  const years = estimatedYears === null ? null : Math.round(estimatedYears * 10) / 10;
  const hasStudentSignals = /\b(student|university|college|undergraduate|bachelor|intern|internship|fresher|graduate)\b/.test(normalized);
  const level = years !== null
    ? years < 2 ? "student / entry-level"
      : years < 4 ? "early-career"
        : years < 7 ? "mid-level"
          : "senior"
    : hasStudentSignals ? "student / entry-level" : "early-career";
  return { years, level };
}

function getSeniorityPenalty(title: string, profile: ExperienceProfile) {
  const normalized = title.toLowerCase();
  const isStaff = /\b(staff|principal|lead|director|architect|head|manager)\b/.test(normalized);
  const isSenior = /\b(senior|sr\.?|iii|iv)\b/.test(normalized);
  if (isStaff) return profile.level === "senior" ? 5 : 35;
  if (isSenior) return profile.level === "senior" ? 0 : profile.level === "mid-level" ? 8 : 25;
  if (/\b(junior|jr\.?|entry|associate|intern)\b/.test(normalized)) {
    return profile.level === "senior" ? 8 : -5;
  }
  return 0;
}

function getRoleTokens(role: string) {
  return role.toLowerCase().split(/[^a-z0-9+#.]+/).filter((token) => token.length > 2);
}

function isTooSenior(title: string, level: ExperienceLevel) {
  const penalty = getSeniorityPenalty(title, { years: null, level });
  return level !== "senior" && penalty >= (level === "mid-level" ? 30 : 20);
}

async function extractResume(formData: FormData) {
  const text = String(formData.get("resumeText") ?? "").trim();
  const file = formData.get("resume");
  if (text) return text;
  if (!(file instanceof File) || file.size === 0) return "";

  const buffer = Buffer.from(await file.arrayBuffer());
  if (file.name.toLowerCase().endsWith(".pdf")) return (await pdfParse(buffer)).text;
  if (file.name.toLowerCase().endsWith(".docx")) return (await mammoth.extractRawText({ buffer })).value;
  return buffer.toString("utf8");
}

async function getJobs(role: string, location: string): Promise<SourceJob[]> {
  const queries = encodeURIComponent(role || "software engineer");
  const locationQuery = encodeURIComponent(location || "");
  const [remotiveResponse, arbeitnowResponse] = await Promise.all([
    fetch(`https://remotive.com/api/remote-jobs?search=${queries}`, { next: { revalidate: 900 } }),
    fetch(`https://www.arbeitnow.com/api/job-board-api?search=${queries}&location=${locationQuery}`, { next: { revalidate: 900 } })
  ]);
  const remotive = remotiveResponse.ok ? await remotiveResponse.json() : { jobs: [] };
  const arbeitnow = arbeitnowResponse.ok ? await arbeitnowResponse.json() : { data: [] };
  return [...(remotive.jobs ?? []), ...(arbeitnow.data ?? [])];
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const role = String(formData.get("role") ?? "").trim();
    const location = String(formData.get("location") ?? "").trim();
    const requestedLevel = String(formData.get("experienceLevel") ?? "").trim() as ExperienceLevel;
    const resume = await extractResume(formData);
    if (!role && !resume) return NextResponse.json({ error: "Add a target role or resume before searching." }, { status: 400 });

    const resumeSkills = extractSkills(resume);
    const detectedExperience = getExperienceProfile(resume);
    const validLevels: ExperienceLevel[] = ["student / entry-level", "early-career", "mid-level", "senior"];
    const experience = validLevels.includes(requestedLevel) ? { ...detectedExperience, level: requestedLevel } : detectedExperience;
    const roleTokens = getRoleTokens(role);
    const jobs = await getJobs(role, location);
    const results: Job[] = jobs
      .filter((job) => job.title && job.url)
      .filter((job) => !isTooSenior(job.title ?? "", experience.level))
      .map((job) => {
        const title = job.title ?? "Untitled role";
        const description = cleanHtml(job.description ?? "");
        const searchable = `${title} ${description} ${(job.tags ?? []).join(" ")}`;
        const matchedSkills = resumeSkills.filter((skill) => new RegExp(`\\b${skill.replace(".", "\\.")}\\b`, "i").test(searchable));
        const titleText = title.toLowerCase();
        const titleMatches = roleTokens.filter((token) => titleText.includes(token)).length;
        const roleMatch = role ? Math.min(25, titleMatches * 10) : 10;
        const locationMatch = location ? (searchable.toLowerCase().includes(location.toLowerCase()) ? 10 : 0) : 10;
        const seniorityPenalty = getSeniorityPenalty(title, experience);
        const match = Math.min(98, Math.max(15, 45 + roleMatch + locationMatch + matchedSkills.length * 5 - seniorityPenalty));
        const seniorityNote = seniorityPenalty >= 20
          ? `This is above your detected ${experience.level} level, so it was ranked lower.`
          : "";
        return {
          title,
          company: job.company_name ?? job.company ?? "Company",
          location: job.candidate_required_location ?? job.location ?? "See listing",
          mode: "Remote",
          match,
          skills: matchedSkills.slice(0, 5),
          url: job.url!,
          reason: seniorityNote || (matchedSkills.length
            ? `Matches ${matchedSkills.slice(0, 3).join(", ")} from your resume.`
            : "Review the requirements closely; this role matched your target search.")
        };
      })
      .sort((a, b) => b.match - a.match)
      .filter((job, index, all) => all.findIndex((candidate) => candidate.url === job.url) === index)
      .slice(0, 12);

    const suggestions = [
      ...(resume.length < 500 ? [["Add detail", "Your resume text is short. Add measurable accomplishments and project context so matches can be more precise."]] : []),
      ...(resumeSkills.length < 3 ? [["Surface skills", "Add a dedicated skills section with the tools and technologies you use most."]] : []),
      ["Quantify impact", "Add numbers to two or three accomplishments, such as latency reduced, revenue influenced, or users supported."],
      ["Tailor your headline", `Make your target clear with a headline such as “${role || "Software Engineer"} · ${resumeSkills.slice(0, 2).join(" · ") || "Relevant skills"}”.`]
    ].slice(0, 4);
    return NextResponse.json({
      jobs: results,
      suggestions,
      resumeText: resume,
      experience: { level: experience.level, years: experience.years },
      sourceCount: jobs.length
    });
  } catch (error) {
    console.error("Job search failed", error);
    return NextResponse.json({ error: "The job sources could not be reached. Try again shortly." }, { status: 502 });
  }
}
