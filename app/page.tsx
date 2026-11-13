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
};

type SavedVersion = {
  id: string;
  name: string;
  text: string;
  createdAt: string;
};

export default function Home() {
  const [resumeText, setResumeText] = useState("");
  const [fileName, setFileName] = useState("");
  const [role, setRole] = useState("");
  const [country, setCountry] = useState("");
  const [workArrangement, setWorkArrangement] = useState("any");
  const [experienceLevel, setExperienceLevel] = useState("");
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

  useEffect(() => {
    const saved = window.localStorage.getItem("rolematch-resume-versions");
    if (saved) {
      try { setSavedVersions(JSON.parse(saved) as SavedVersion[]); } catch { window.localStorage.removeItem("rolematch-resume-versions"); }
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

  return (
    <main>
      <nav className="nav container">
        <div className="brand"><span className="brand-mark">R</span> RoleMatch</div>
        <span className="nav-status"><span className="status-dot" /> Personal workspace</span>
      </nav>

      <section className="hero container">
        <p className="eyebrow">YOUR NEXT ROLE, WITH A PLAN</p>
        <h1>Turn your resume into<br /><em>better opportunities.</em></h1>
        <p className="hero-copy">Upload your resume, tell us what you want next, and get a focused list of roles plus practical improvements to make your application stronger.</p>
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
            <label><span className="field-label">Preferred country</span><select value={country} onChange={(event) => setCountry(event.target.value)}><option value="">Any country</option><option>India</option><option>United States</option><option>Canada</option><option>United Kingdom</option><option>Germany</option><option>Australia</option><option>Singapore</option><option>Worldwide</option></select></label>
          </div>
          <label><span className="field-label">Work arrangement</span><select value={workArrangement} onChange={(event) => setWorkArrangement(event.target.value)}><option value="any">Remote or on-site</option><option value="remote">Remote only</option><option value="hybrid">Hybrid only</option><option value="onsite">On-site only</option></select></label>
          <label><span className="field-label">Experience level</span><select value={experienceLevel} onChange={(event) => setExperienceLevel(event.target.value)}><option value="">Detect from resume</option><option value="student / entry-level">Student / Entry-level</option><option value="early-career">Early-career</option><option value="mid-level">Mid-level</option><option value="senior">Senior</option></select></label>
          <button type="submit" className="primary-button" disabled={loading}>{loading ? "Searching live listings..." : "Find matching roles"} <span>→</span></button>
          {error && <p className="form-error">{error}</p>}
        </form>

        <aside className="panel insight-panel">
          <span className="step">HOW IT WORKS</span>
          <div className="insight-list">
            <div><span className="number">1</span><p><strong>Understand</strong><br />We identify your skills, experience, and strengths.</p></div>
            <div><span className="number">2</span><p><strong>Match</strong><br />We rank roles by fit, not just keywords.</p></div>
            <div><span className="number">3</span><p><strong>Improve</strong><br />You get specific suggestions to stand out.</p></div>
          </div>
          <div className="privacy-note"><span>✦</span> No account required. Add a Gemini key to enable AI-powered resume feedback; it is never exposed to the browser.</div>
        </aside>
      </section>

      {searched && <section className="results container">
        <div className="results-heading"><div><p className="eyebrow">YOUR SHORTLIST</p><h2>Roles worth your attention</h2>{experience && <p className="experience-note">Ranking based on detected level: <strong>{experience.level}{experience.years !== null ? ` · approximately ${experience.years} years` : ""}</strong></p>}</div><span className="result-count">{visibleJobs.length} matches</span></div>
        <div className="result-grid">
          <div className="job-list">
            {visibleJobs.map((job) => <article className="job-card" key={job.title}>
              <div className="job-top"><div><h3>{job.title}</h3><p>{job.company} · {job.location}</p></div><span className="match">{job.match}% <small>match</small></span></div>
              <p className="reason">{job.reason}</p><div className="tags">{job.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>
              <div className="job-actions"><button type="button" className="secondary-button" onClick={() => void tailorForJob(job)}>Tailor resume</button><a href={job.url} target="_blank" rel="noreferrer">View listing ↗</a></div>
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
    </main>
  );
}
