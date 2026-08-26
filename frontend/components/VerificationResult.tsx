import { ExternalLink } from "lucide-react";
import type { Verification } from "@/lib/contracts/types";
import { Badge } from "./ui/badge";

export function VerificationResult({ verification }: { verification: Verification | null }) {
  if (!verification) return <section className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground"><h2 className="text-lg font-semibold text-foreground">Verification Result</h2><p className="mt-2">A finalized verification will appear here.</p></section>;
  const color = verification.verdict === "VERIFIED" ? "text-emerald-400" : verification.verdict === "FAILED" ? "text-red-400" : "text-amber-400";
  return (
    <section className="rounded-2xl border border-border bg-card/60 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.2em] text-accent">Verification Result</p><h2 className={`mt-2 text-3xl font-bold ${color}`}>{verification.verdict || verification.status}</h2></div><Badge variant="outline">{verification.status}</Badge></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="Score" value={`${verification.score}/100`} /><Field label="Reason code" value={verification.reason_code || "—"} /></div>
      <div className="mt-4"><Field label="Summary" value={verification.summary || "No assessment yet."} /></div>
      <div className="mt-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Repository</p><a className="mt-1 inline-flex items-center gap-1 break-all text-sm text-accent hover:underline" href={verification.repository_url} target="_blank" rel="noreferrer">{verification.repository_url}<ExternalLink className="h-3.5 w-3.5 shrink-0" /></a></div>
      <div className="mt-4"><Field label="Release reference" value={verification.release_ref || "Not supplied"} /></div>
      <div className="mt-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Acceptance criteria</p><pre className="mt-2 whitespace-pre-wrap rounded-lg bg-black/25 p-4 font-sans text-sm">{verification.criteria}</pre></div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) { return <div><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm">{value}</p></div>; }
