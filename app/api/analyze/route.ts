import { NextResponse } from "next/server";

type Suggestion = [string, string];
type TailoredBullet = string;

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced?.[1] ?? text;
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY is not configured." }, { status: 503 });
  }

  try {
    const body = await request.json() as { role?: string; resume?: string; jobs?: unknown[]; selectedJob?: unknown };
    const resume = String(body.resume ?? "").trim();
    if (!resume) return NextResponse.json({ error: "Resume text is required." }, { status: 400 });

    const prompt = `You are a practical resume coach. Analyze this resume for the target role "${body.role || "software engineer"}".
Return ONLY valid JSON in this exact shape: {"suggestions":[["Short title","Specific actionable advice"]],"tailoredBullets":["A rewritten bullet using only verified resume facts"]}
Give 3 to 5 suggestions. Be honest, concise, and do not invent experience. Mention missing keywords only when supported by the job list.
If a selected job is provided, give 2 to 4 tailored resume bullets. Preserve the user's actual achievements and use [ADD METRIC] only when a useful metric is missing.
Resume:
${resume.slice(0, 18000)}
Job list:
${JSON.stringify(body.jobs ?? []).slice(0, 12000)}
Selected job:
${JSON.stringify(body.selectedJob ?? {}).slice(0, 5000)}`;

    const model = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
        })
      }
    );
    if (!response.ok) {
      console.error("Gemini request failed", response.status, await response.text());
      return NextResponse.json({ error: "The AI provider could not analyze this resume." }, { status: 502 });
    }

    const result = await response.json() as GeminiResponse;
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return NextResponse.json({ error: "The AI provider returned an empty analysis." }, { status: 502 });
    const parsed = JSON.parse(extractJson(text)) as { suggestions?: Suggestion[]; tailoredBullets?: TailoredBullet[] };
    const suggestions = (parsed.suggestions ?? []).filter(
      (suggestion): suggestion is Suggestion => Array.isArray(suggestion) && suggestion.length === 2
    ).slice(0, 5);
    const tailoredBullets = (parsed.tailoredBullets ?? []).filter(
      (bullet): bullet is TailoredBullet => typeof bullet === "string" && bullet.trim().length > 0
    ).slice(0, 4);
    return NextResponse.json({ suggestions, tailoredBullets });
  } catch (error) {
    console.error("Resume analysis failed", error);
    return NextResponse.json({ error: "The resume analysis response was invalid." }, { status: 502 });
  }
}
