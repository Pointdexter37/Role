"use client";

import { ChangeEvent, FormEvent, useState } from "react";

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

export default function Home() {
  const [resumeText, setResumeText] = useState("");
  const [fileName, setFileName] = useState("");
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [visibleJobs, setVisibleJobs] = useState<Job[]>([]);
  const [suggestions, setSuggestions] = useState<string[][]>([]);
  const [experience, setExperience] = useState<{ level: string; years: number | null } | null>(null);

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
    data.append("location", location);
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
            <label><span className="field-label">Location</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. Remote or New York" /></label>
          </div>
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
              <a href={job.url} target="_blank" rel="noreferrer">View listing ↗</a>
            </article>)}
          </div>
          <div className="panel suggestions"><p className="eyebrow">RESUME SIGNALS</p><h2>Make your next application stronger</h2>
            {suggestions.map(([title, body]) => <div className="suggestion" key={title}><span>✦</span><p><strong>{title}</strong><br />{body}</p></div>)}
          </div>
        </div>
      </section>}
    </main>
  );
}
