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
    const resume = await extractResume(formData);
    if (!role && !resume) return NextResponse.json({ error: "Add a target role or resume before searching." }, { status: 400 });

    const resumeSkills = extractSkills(resume);
    const jobs = await getJobs(role, location);
    const results: Job[] = jobs
      .filter((job) => job.title && job.url)
      .map((job) => {
        const title = job.title ?? "Untitled role";
        const description = cleanHtml(job.description ?? "");
        const searchable = `${title} ${description} ${(job.tags ?? []).join(" ")}`;
        const matchedSkills = resumeSkills.filter((skill) => new RegExp(`\\b${skill.replace(".", "\\.")}\\b`, "i").test(searchable));
        const roleMatch = role ? (searchable.toLowerCase().includes(role.toLowerCase()) ? 25 : 0) : 10;
        const locationMatch = location ? (searchable.toLowerCase().includes(location.toLowerCase()) ? 10 : 0) : 10;
        const match = Math.min(98, Math.max(25, 45 + roleMatch + locationMatch + matchedSkills.length * 5));
        return {
          title,
          company: job.company_name ?? job.company ?? "Company",
          location: job.candidate_required_location ?? job.location ?? "See listing",
          mode: "Remote",
          match,
          skills: matchedSkills.slice(0, 5),
          url: job.url!,
          reason: matchedSkills.length
            ? `Matches ${matchedSkills.slice(0, 3).join(", ")} from your resume.`
            : "Review the requirements closely; this role matched your target search."
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
    return NextResponse.json({ jobs: results, suggestions, resumeText: resume, sourceCount: jobs.length });
  } catch (error) {
    console.error("Job search failed", error);
    return NextResponse.json({ error: "The job sources could not be reached. Try again shortly." }, { status: 502 });
  }
}
