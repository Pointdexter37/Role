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
  postedAt: string | null;
  source: string;
  reliability: "High" | "Medium";
};

type ExperienceProfile = {
  years: number | null;
  level: "student / entry-level" | "early-career" | "mid-level" | "senior";
};
type ExperienceLevel = ExperienceProfile["level"];
type WorkArrangement = "any" | "remote" | "hybrid" | "onsite";

type SourceJob = {
  title?: string;
  company_name?: string;
  company?: string;
  candidate_required_location?: string;
  location?: string;
  url?: string;
  description?: string;
  tags?: string[];
  postedAt?: string | number;
  publication_date?: string;
  created_at?: string | number;
  source?: string;
  reliability?: "High" | "Medium";
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

function getRequiredYears(value: string) {
  const matches = [
    ...value.matchAll(/(\d+(?:\.\d+)?)\s*(?:\+|or more)?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:professional\s+)?experience/gi),
    ...value.matchAll(/(?:at least|minimum of)\s+(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/gi)
  ];
  const years = matches.map((match) => Number(match[1])).filter(Number.isFinite);
  return years.length ? Math.max(...years) : null;
}

function getWorkMode(value: string): Exclude<WorkArrangement, "any"> {
  const normalized = value.toLowerCase();
  if (/\b(remote|work from home|wfh|anywhere|distributed)\b/.test(normalized)) return "remote";
  if (/\bhybrid\b/.test(normalized)) return "hybrid";
  return "onsite";
}

function countryMatches(value: string, country: string) {
  if (!country) return true;
  const normalized = value.toLowerCase();
  const aliases: Record<string, string[]> = {
    India: ["india", "indian"],
    "United States": ["united states", "usa", "u.s.", "us"],
    Canada: ["canada", "canadian"],
    "United Kingdom": ["united kingdom", "uk", "england", "scotland", "wales"],
    Germany: ["germany", "german"],
    Australia: ["australia", "australian"],
    Singapore: ["singapore"],
    Worldwide: ["worldwide", "global", "anywhere"]
  };
  return (aliases[country] ?? [country.toLowerCase()]).some((alias) => normalized.includes(alias));
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

async function getJobs(role: string, country: string): Promise<SourceJob[]> {
  const queries = encodeURIComponent(role || "software engineer");
  const locationQuery = encodeURIComponent(country || "");
  const greenhouseCompanies = (process.env.GREENHOUSE_COMPANIES ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const leverCompanies = (process.env.LEVER_COMPANIES ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const requests = [
    fetch(`https://remotive.com/api/remote-jobs?search=${queries}`, { next: { revalidate: 900 } }).then(async (response) => {
      const data = response.ok ? await response.json() : { jobs: [] };
      return (data.jobs ?? []).map((job: SourceJob) => ({ ...job, postedAt: job.publication_date ?? job.postedAt, source: "Remotive", reliability: "Medium" as const }));
    }),
    fetch(`https://www.arbeitnow.com/api/job-board-api?search=${queries}&location=${locationQuery}`, { next: { revalidate: 900 } }).then(async (response) => {
      const data = response.ok ? await response.json() : { data: [] };
      return (data.data ?? []).map((job: SourceJob) => ({ ...job, postedAt: job.created_at ?? job.postedAt, source: "Arbeitnow", reliability: "Medium" as const }));
    }),
    ...greenhouseCompanies.map((company) => fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(company)}/jobs?content=true`, { next: { revalidate: 900 } }).then(async (response) => {
      if (!response.ok) return [];
      const data = await response.json();
      return (data.jobs ?? []).map((job: { title: string; location?: { name?: string }; absolute_url?: string; content?: string; updated_at?: string }) => ({
        title: job.title,
        company,
        location: job.location?.name,
        url: job.absolute_url,
        description: job.content,
        postedAt: job.updated_at,
        source: "Greenhouse",
        reliability: "High" as const
      }));
    })),
    ...leverCompanies.map((company) => fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`, { next: { revalidate: 900 } }).then(async (response) => {
      if (!response.ok) return [];
      const data = await response.json();
      return (data ?? []).map((job: { text: string; categories?: { location?: string }; hostedUrl?: string; applyUrl?: string; descriptionPlain?: string; createdAt?: number }) => ({
        title: job.text,
        company,
        location: job.categories?.location,
        url: job.hostedUrl ?? job.applyUrl,
        description: job.descriptionPlain,
        postedAt: job.createdAt,
        source: "Lever",
        reliability: "High" as const
      }));
    }))
  ];
  const responses = await Promise.allSettled(requests);
  return responses.flatMap((response) => response.status === "fulfilled" ? response.value : []);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const role = String(formData.get("role") ?? "").trim();
    const country = String(formData.get("country") ?? "").trim();
    const workArrangement = String(formData.get("workArrangement") ?? "any") as WorkArrangement;
    const requestedLevel = String(formData.get("experienceLevel") ?? "").trim() as ExperienceLevel;
    const resume = await extractResume(formData);
    if (!role && !resume) return NextResponse.json({ error: "Add a target role or resume before searching." }, { status: 400 });

    const resumeSkills = extractSkills(resume);
    const detectedExperience = getExperienceProfile(resume);
    const validLevels: ExperienceLevel[] = ["student / entry-level", "early-career", "mid-level", "senior"];
    const experience = validLevels.includes(requestedLevel) ? { ...detectedExperience, level: requestedLevel } : detectedExperience;
    const roleTokens = getRoleTokens(role);
    const jobs = await getJobs(role, country);
    const requirementLimit = experience.level === "student / entry-level" ? 2 : experience.level === "early-career" ? 3 : experience.level === "mid-level" ? 6 : Infinity;
    const results: Job[] = jobs
      .filter((job) => job.title && job.url)
      .filter((job) => !isTooSenior(job.title ?? "", experience.level))
      .filter((job) => {
        const searchable = `${job.title} ${cleanHtml(job.description ?? "")} ${(job.tags ?? []).join(" ")}`;
        const requiredYears = getRequiredYears(searchable);
        const mode = getWorkMode(searchable);
        const countryFit = countryMatches(searchable, country) || (mode === "remote" && countryMatches(searchable, "Worldwide"));
        return (requiredYears === null || requiredYears <= requirementLimit)
          && (workArrangement === "any" || mode === workArrangement)
          && countryFit;
      })
      .map((job) => {
        const title = job.title ?? "Untitled role";
        const description = cleanHtml(job.description ?? "");
        const searchable = `${title} ${description} ${(job.tags ?? []).join(" ")}`;
        const matchedSkills = resumeSkills.filter((skill) => new RegExp(`\\b${skill.replace(".", "\\.")}\\b`, "i").test(searchable));
        const titleText = title.toLowerCase();
        const titleMatches = roleTokens.filter((token) => titleText.includes(token)).length;
        const roleMatch = role ? Math.min(25, titleMatches * 10) : 10;
        const locationMatch = country ? (countryMatches(searchable, country) || (getWorkMode(searchable) === "remote" && countryMatches(searchable, "Worldwide")) ? 10 : 0) : 10;
        const seniorityPenalty = getSeniorityPenalty(title, experience);
        const requiredYears = getRequiredYears(searchable);
        const mode = getWorkMode(searchable);
        const match = Math.min(98, Math.max(15, 45 + roleMatch + locationMatch + matchedSkills.length * 5 - seniorityPenalty));
        const seniorityNote = seniorityPenalty >= 20
          ? `This is above your detected ${experience.level} level, so it was ranked lower.`
          : "";
        return {
          title,
          company: job.company_name ?? job.company ?? "Company",
          location: job.candidate_required_location ?? job.location ?? "See listing",
          mode: mode === "onsite" ? "On-site" : mode[0].toUpperCase() + mode.slice(1),
          match,
          skills: matchedSkills.slice(0, 5),
          url: job.url!,
          reason: seniorityNote || (requiredYears !== null
            ? `This listing asks for approximately ${requiredYears}+ years of experience.`
            : matchedSkills.length
            ? `Matches ${matchedSkills.slice(0, 3).join(", ")} from your resume.`
            : "Review the requirements closely; this role matched your target search."),
          postedAt: job.postedAt ? new Date(job.postedAt).toISOString() : null,
          source: job.source ?? "Job board",
          reliability: job.reliability ?? "Medium"
        };
      })
      .sort((a, b) => b.match - a.match)
      .filter((job, index, all) => all.findIndex((candidate) => {
        const key = `${candidate.title.toLowerCase()}|${candidate.company.toLowerCase()}|${candidate.location.toLowerCase()}`;
        const currentKey = `${job.title.toLowerCase()}|${job.company.toLowerCase()}|${job.location.toLowerCase()}`;
        return candidate.url === job.url || key === currentKey;
      }) === index)
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
