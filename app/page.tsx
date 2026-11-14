"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";

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

type SavedVersion = {
  id: string;
  name: string;
  text: string;
  createdAt: string;
};
type ApplicationStatus = "Saved" | "Applied" | "Interviewing" | "Rejected" | "Offer";
type SavedJob = Job & { status: ApplicationStatus; notes: string; followUpDate: string; savedAt: string };
type CareerSource = {
  name: string;
  description: string;
  url: string;
  action: string;
};

const careerSourceGroups: Array<{ tier: string; title: string; description: string; sources: CareerSource[] }> = [
  {
    tier: "TIER 1",
    title: "Apply at the source",
    description: "Use these first. Search India, graduate, intern, SDE-1, backend, Go, TypeScript, and 2027 batch roles.",
    sources: [
      { name: "Amazon", description: "India software and graduate roles", url: "https://www.amazon.jobs/en/locations/india", action: "Open careers" },
      { name: "Microsoft", description: "India early-career and engineering roles", url: "https://jobs.careers.microsoft.com/global/en/search?q=software%20engineer&lc=India", action: "Search jobs" },
      { name: "MongoDB", description: "Check Gurugram intern and graduate roles", url: "https://www.mongodb.com/careers", action: "Open careers" },
      { name: "Thoughtworks", description: "Graduate, apprenticeship, and engineering roles", url: "https://www.thoughtworks.com/careers", action: "Open careers" },
      { name: "Texas Instruments", description: "India engineering and graduate openings", url: "https://careers.ti.com/", action: "Open careers" },
      { name: "GE Vernova", description: "India technology and early-career jobs", url: "https://jobs.gecareers.com/vernova/global/en", action: "Search jobs" },
      { name: "Baker Hughes", description: "Technology and graduate programs", url: "https://careers.bakerhughes.com/", action: "Open careers" },
      { name: "HP", description: "India software and early-career roles", url: "https://jobs.hp.com/", action: "Search jobs" },
      { name: "Pitney Bowes", description: "Verify Noida Graduate Engineer Trainee roles, especially Go/backend", url: "https://www.pitneybowes.com/us/en/careers.html", action: "Verify opening" },
      { name: "TCS NextStep", description: "Register and enable fresher alerts", url: "https://nextstep.tcs.com/", action: "Register" },
      { name: "Wipro", description: "Fresher and graduate hiring", url: "https://careers.wipro.com/", action: "Open careers" },
      { name: "Infosys", description: "Graduate hiring and alerts", url: "https://career.infosys.com/", action: "Open careers" },
      { name: "Cognizant", description: "Check GenC and graduate programs", url: "https://careers.cognizant.com/in/en", action: "Search jobs" },
      { name: "Capgemini", description: "India graduate and engineering roles", url: "https://www.capgemini.com/in-en/careers/", action: "Open careers" },
      { name: "Accenture", description: "India entry-level technology roles", url: "https://www.accenture.com/in-en/careers", action: "Search jobs" }
    ]
  },
  {
    tier: "TIER 1",
    title: "Skills-first and startup platforms",
    description: "Complete your profile and assessments before applying. These are especially useful when your GitHub and projects show your ability.",
    sources: [
      { name: "LinkedIn Jobs", description: "Search Software Engineer, SDE-1, GET, Backend Engineer, and 2027 batch", url: "https://www.linkedin.com/jobs/", action: "Search jobs" },
      { name: "Cutshort", description: "Skills-first matching for product and engineering roles", url: "https://cutshort.io/jobs", action: "Build profile" },
      { name: "Wellfound", description: "Funded startups hiring backend, Go, and TypeScript talent", url: "https://wellfound.com/jobs", action: "Search startups" },
      { name: "Unstop", description: "Challenges, hackathons, and off-campus drives", url: "https://unstop.com/jobs", action: "Find drives" }
    ]
  },
  {
    tier: "TIER 2",
    title: "Supporting channels",
    description: "Use these for extra volume, internships, referrals, and smaller companies. Apply on the employer site whenever possible.",
    sources: [
      { name: "Internshala", description: "Internships that may convert to full-time", url: "https://internshala.com/internships/", action: "Find internships" },
      { name: "Naukri", description: "High-volume fresher and services hiring", url: "https://www.naukri.com/", action: "Set alerts" },
      { name: "Hirect", description: "Direct conversations with startup founders", url: "https://hirect.in/", action: "Explore roles" },
      { name: "Indeed", description: "Additional job volume and alerts", url: "https://in.indeed.com/", action: "Set alerts" },
      { name: "Foundit", description: "Additional India listings", url: "https://www.foundit.in/", action: "Set alerts" },
      { name: "r/developersIndia", description: "Referrals, hiring posts, and interview experiences", url: "https://www.reddit.com/r/developersIndia/", action: "Join community" }
    ]
  },
  {
    tier: "TIER 3",
    title: "Alert feeds only",
    description: "Use these to discover openings, then verify the role and apply through the company’s own page. Never pay for a job or referral.",
    sources: [
      { name: "Freshershunt", description: "Spot fresher and off-campus openings", url: "https://freshershunt.in/", action: "Check feed" },
      { name: "OffCampusJobs4u", description: "Use only as an opening alert", url: "https://offcampusjobs4u.com/", action: "Check feed" },
      { name: "Fresheroffcampus", description: "Verify batch and experience eligibility", url: "https://fresheroffcampus.com/", action: "Check feed" }
    ]
  }
];

export default function Home() {
  const [resumeText, setResumeText] = useState("");
  const [fileName, setFileName] = useState("");
  const [role, setRole] = useState("");
  const [country, setCountry] = useState("India");
  const [workArrangement, setWorkArrangement] = useState("any");
  const [experienceLevel, setExperienceLevel] = useState("student / entry-level");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [visibleJobs, setVisibleJobs] = useState<Job[]>([]);
  const [suggestions, setSuggestions] = useState<string[][]>([]);
  const [experience, setExperience] = useState<{ level: string; years: number | null } | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [tailoredBullets, setTailoredBullets] = useState<string[]>([]);
  const [tailoring, setTailoring] = useState(false);
  const [savedVersions, setSavedVersions] = useState<SavedVersion[]>([]);
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);

  useEffect(() => {
    const saved = window.localStorage.getItem("rolematch-resume-versions");
    if (saved) {
      try { setSavedVersions(JSON.parse(saved) as SavedVersion[]); } catch { window.localStorage.removeItem("rolematch-resume-versions"); }
    }
    const savedApplications = window.localStorage.getItem("rolematch-applications");
    if (savedApplications) {
      try { setSavedJobs(JSON.parse(savedApplications) as SavedJob[]); } catch { window.localStorage.removeItem("rolematch-applications"); }
    }
  }, []);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    if (file.type === "text/plain") {
      const reader = new FileReader();
      reader.onload = () => setResumeText(String(reader.result ?? ""));
      reader.readAsText(file);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void searchJobs();
  }

  async function searchJobs() {
    setLoading(true);
    setError("");
    const data = new FormData();
    data.append("role", role);
    data.append("country", country);
    data.append("workArrangement", workArrangement);
    data.append("experienceLevel", experienceLevel);
    data.append("resumeText", resumeText);
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (fileInput?.files?.[0]) data.append("resume", fileInput.files[0]);
    try {
      const response = await fetch("/api/search", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Search failed.");
      setVisibleJobs(result.jobs);
      setSuggestions(result.suggestions);
      setExperience(result.experience ?? null);
      if (result.resumeText) setResumeText(result.resumeText);
      setSearched(true);
      const analysis = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, resume: result.resumeText, jobs: result.jobs })
      });
      if (analysis.ok) {
        const analysisResult = await analysis.json();
        if (analysisResult.suggestions?.length) setSuggestions(analysisResult.suggestions);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  async function tailorForJob(job: Job) {
    setSelectedJob(job);
    setTailoredBullets([]);
    setTailoring(true);
    setError("");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, resume: resumeText, jobs: visibleJobs, selectedJob: job })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not tailor this resume.");
      setTailoredBullets(result.tailoredBullets ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not tailor this resume.");
    } finally {
      setTailoring(false);
    }
  }

  function saveVersion() {
    if (!resumeText.trim()) return;
    const version: SavedVersion = {
      id: crypto.randomUUID(),
      name: selectedJob ? `${selectedJob.title} version` : "Resume version",
      text: resumeText,
      createdAt: new Date().toISOString()
    };
    const next = [version, ...savedVersions].slice(0, 10);
    setSavedVersions(next);
    window.localStorage.setItem("rolematch-resume-versions", JSON.stringify(next));
  }

  function downloadResume() {
    const content = [resumeText, selectedJob && `\n\nTailored bullets for ${selectedJob.title} at ${selectedJob.company}:`, ...tailoredBullets.map((bullet) => `- ${bullet}`)].filter(Boolean).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    link.download = "rolematch-resume.txt";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function saveJob(job: Job) {
    if (savedJobs.some((savedJob) => savedJob.url === job.url)) return;
    const next = [{ ...job, status: "Saved" as ApplicationStatus, notes: "", followUpDate: "", savedAt: new Date().toISOString() }, ...savedJobs];
    setSavedJobs(next);
    window.localStorage.setItem("rolematch-applications", JSON.stringify(next));
  }

  function updateSavedJob(url: string, changes: Partial<SavedJob>) {
    const next = savedJobs.map((job) => job.url === url ? { ...job, ...changes } : job);
    setSavedJobs(next);
    window.localStorage.setItem("rolematch-applications", JSON.stringify(next));
  }

  function removeSavedJob(url: string) {
    const next = savedJobs.filter((job) => job.url !== url);
    setSavedJobs(next);
    window.localStorage.setItem("rolematch-applications", JSON.stringify(next));
  }

  return (
    <main>
      <nav className="nav container">
        <div className="brand"><span className="brand-mark">R</span> RoleMatch</div>
        <span className="nav-status"><span className="status-dot" /> Personal workspace</span>
      </nav>

      <section className="hero container">
        <p className="eyebrow">A PRACTICAL GUIDE FOR YOUR FIRST ROLE</p>
        <h1>Find work that fits<br /><em>where you are now.</em></h1>
        <p className="hero-copy">RoleMatch prioritizes India-based and remote opportunities that fit your resume, internship experience, and current career stage — not jobs that expect years you do not have yet.</p>
      </section>

      <section className="workspace container">
        <form className="panel search-panel" onSubmit={handleSubmit}>
          <div className="panel-heading">
            <div><span className="step">01</span><h2>Tell us about your search</h2></div>
            <span className="required">Required</span>
          </div>
          <label className="upload">
            <input type="file" accept=".txt,.pdf,.doc,.docx" onChange={handleFile} />
            <span className="upload-icon">↑</span>
            <span><strong>{fileName || "Drop your resume here"}</strong><small>PDF, DOCX, or TXT · Your resume stays private</small></span>
            <span className="browse">Browse</span>
          </label>
          <label className="field-label">Or paste your resume text</label>
          <textarea value={resumeText} onChange={(event) => setResumeText(event.target.value)} placeholder="Paste the text of your resume here..." rows={5} />
          <div className="field-grid">
            <label><span className="field-label">Target role</span><input value={role} onChange={(event) => setRole(event.target.value)} placeholder="e.g. Frontend Engineer" /></label>
            <label><span className="field-label">Preferred location</span><select value={country} onChange={(event) => setCountry(event.target.value)}><option>India</option><option value="Worldwide">Worldwide remote</option><option>United States</option><option>Canada</option><option>United Kingdom</option><option>Germany</option><option>Australia</option><option>Singapore</option></select></label>
          </div>
          <label><span className="field-label">Work arrangement</span><select value={workArrangement} onChange={(event) => setWorkArrangement(event.target.value)}><option value="any">Remote or on-site</option><option value="remote">Remote only</option><option value="hybrid">Hybrid only</option><option value="onsite">On-site only</option></select></label>
          <label><span className="field-label">Experience level</span><select value={experienceLevel} onChange={(event) => setExperienceLevel(event.target.value)}><option value="student / entry-level">Student / Entry-level</option><option value="early-career">Early-career (0–2 years)</option><option value="mid-level">Mid-level</option><option value="senior">Senior</option><option value="">Detect from resume</option></select></label>
          <button type="submit" className="primary-button" disabled={loading}>{loading ? "Searching live listings..." : "Find matching roles"} <span>→</span></button>
          {error && <p className="form-error">{error}</p>}
        </form>

        <aside className="panel insight-panel">
          <span className="step">HOW IT WORKS</span>
          <div className="insight-list">
            <div><span className="number">1</span><p><strong>Understand</strong><br />We identify your skills, internships, projects, and strengths.</p></div>
            <div><span className="number">2</span><p><strong>Match</strong><br />India-first and remote roles are ranked by resume fit and realistic experience.</p></div>
            <div><span className="number">3</span><p><strong>Plan</strong><br />Get a shortlist, resume improvements, and a simple application tracker.</p></div>
          </div>
          <div className="privacy-note"><span>✦</span> No account required. Add a Gemini key to enable AI-powered resume feedback; it is never exposed to the browser.</div>
        </aside>
      </section>

      {searched && <section className="results container">
        <div className="results-heading"><div><p className="eyebrow">YOUR SHORTLIST</p><h2>Roles worth your attention</h2>{experience && <p className="experience-note">India-first search with remote options · ranking based on <strong>{experience.level}{experience.years !== null ? ` · approximately ${experience.years} years` : ""}</strong></p>}</div><span className="result-count">{visibleJobs.length} matches</span></div>
        <div className="result-grid">
          <div className="job-list">
            {visibleJobs.length === 0 && <div className="panel empty-results"><h2>No close matches yet</h2><p>Try a broader role title, choose remote, or add more skills and project details to your resume.</p></div>}
            {visibleJobs.map((job) => <article className="job-card" key={job.url}>
              <div className="job-top"><div><h3>{job.title}</h3><p>{job.company} · {job.location}</p><p className="job-meta">{job.source} · {job.reliability} reliability{job.postedAt ? ` · Updated ${new Date(job.postedAt).toLocaleDateString()}` : ""}</p></div><span className="match">{job.match}% <small>match</small></span></div>
              <p className="reason">{job.reason}</p><div className="tags">{job.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>
              <div className="job-actions"><button type="button" className="secondary-button" onClick={() => void tailorForJob(job)}>Tailor resume</button><button type="button" className="secondary-button" onClick={() => saveJob(job)} disabled={savedJobs.some((savedJob) => savedJob.url === job.url)}>{savedJobs.some((savedJob) => savedJob.url === job.url) ? "Saved" : "Save job"}</button><a href={job.url} target="_blank" rel="noreferrer">View listing ↗</a></div>
            </article>)}
          </div>
          <div className="panel suggestions"><p className="eyebrow">RESUME SIGNALS</p><h2>Make your next application stronger</h2>
            {suggestions.map(([title, body]) => <div className="suggestion" key={title}><span>✦</span><p><strong>{title}</strong><br />{body}</p></div>)}
          </div>
        </div>
        <div className="workspace-tools panel">
          <div className="tools-heading"><div><p className="eyebrow">RESUME WORKSPACE</p><h2>{selectedJob ? `Tailor for ${selectedJob.title}` : "Save and tailor your resume"}</h2></div><div className="tool-buttons"><button type="button" className="secondary-button" onClick={saveVersion}>Save version</button><button type="button" className="primary-button compact-button" onClick={downloadResume}>Download .txt</button></div></div>
          {tailoring && <p className="workspace-status">Generating job-specific bullets...</p>}
          {selectedJob && !tailoring && tailoredBullets.length > 0 && <div className="tailored-bullets">{tailoredBullets.map((bullet) => <p key={bullet}>• {bullet}</p>)}</div>}
          {savedVersions.length > 0 && <div className="saved-versions"><span>Saved versions:</span>{savedVersions.slice(0, 4).map((version) => <button type="button" key={version.id} onClick={() => setResumeText(version.text)}>{version.name}</button>)}</div>}
        </div>
      </section>}
      {savedJobs.length > 0 && <section className="tracker container">
        <div className="results-heading"><div><p className="eyebrow">APPLICATION TRACKER</p><h2>Keep your search moving</h2></div><span className="result-count">{savedJobs.length} saved</span></div>
        <div className="tracker-list">{savedJobs.map((job) => <article className="tracker-card" key={job.url}>
          <div className="tracker-card-top"><div><h3>{job.title}</h3><p>{job.company} · {job.location}</p></div><button type="button" className="remove-button" onClick={() => removeSavedJob(job.url)}>Remove</button></div>
          <div className="tracker-fields"><label><span>Status</span><select value={job.status} onChange={(event) => updateSavedJob(job.url, { status: event.target.value as ApplicationStatus })}><option>Saved</option><option>Applied</option><option>Interviewing</option><option>Rejected</option><option>Offer</option></select></label><label><span>Follow-up date</span><input type="date" value={job.followUpDate} onChange={(event) => updateSavedJob(job.url, { followUpDate: event.target.value })} /></label><label className="notes-field"><span>Notes</span><input value={job.notes} onChange={(event) => updateSavedJob(job.url, { notes: event.target.value })} placeholder="Add a note..." /></label></div>
        </article>)}</div>
      </section>}
      <section className="career-guide container">
        <div className="results-heading"><div><p className="eyebrow">YOUR APPLICATION MAP</p><h2>Where to apply next</h2><p className="guide-intro">Start with direct company pages, then use skills-first platforms. For every role, check graduation year, experience requirements, location eligibility, and the closing date before applying.</p></div></div>
        <div className="guide-callout panel">
          <strong>Your weekly plan</strong>
          <span>1. Apply to 5–8 strong-fit roles.</span>
          <span>2. Message one engineer or recruiter after each application.</span>
          <span>3. Spend 30 minutes improving one GitHub project or resume bullet.</span>
          <span>4. Track every application here and follow up after 7–10 days.</span>
        </div>
        <div className="career-groups">
          {careerSourceGroups.map((group) => <section className="career-group" key={`${group.tier}-${group.title}`}>
            <div className="career-group-heading"><div><p className="eyebrow">{group.tier}</p><h3>{group.title}</h3></div><p>{group.description}</p></div>
            <div className="career-source-grid">
              {group.sources.map((source) => <article className="career-source" key={source.name}>
                <div><h4>{source.name}</h4><p>{source.description}</p></div>
                <a href={source.url} target="_blank" rel="noreferrer">{source.action} ↗</a>
              </article>)}
            </div>
          </section>)}
        </div>
      </section>
    </main>
  );
}
