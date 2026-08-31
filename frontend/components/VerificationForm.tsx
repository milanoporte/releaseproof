"use client";

import { FormEvent, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { TransactionLifecycleState, Verification } from "@/lib/contracts/types";
import { useReleaseProofContract, idleTransaction } from "@/lib/hooks/useReleaseProof";
import { useWallet } from "@/lib/genlayer/wallet";
import { error, success } from "@/lib/utils/toast";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { TransactionStatus } from "./TransactionStatus";

export function VerificationForm({ onComplete }: { onComplete: (value: Verification) => void }) {
  const contract = useReleaseProofContract();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const [verificationId, setVerificationId] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [commitSha, setCommitSha] = useState("");
  const [releaseRef, setReleaseRef] = useState("");
  const [criteria, setCriteria] = useState("");
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [lifecycle, setLifecycle] = useState<TransactionLifecycleState>(idleTransaction);
  const busy = step !== 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!contract) return error("Contract not configured", { description: "Set NEXT_PUBLIC_CONTRACT_ADDRESS after deploying ReleaseProof." });
    if (!wallet.address) return error("Connect MetaMask first");
    if (!wallet.isOnCorrectNetwork) return error("Switch MetaMask to GenLayer Studionet first");

    try {
      setStep(1);
      setLifecycle(idleTransaction);
      const created = await contract.createVerification({ verification_id: verificationId, repository_url: repositoryUrl, commit_sha: commitSha, release_ref: releaseRef, criteria }, setLifecycle);
      if (!created.success) throw new Error(created.failure?.message || "Creation execution failed.");

      setStep(2);
      setLifecycle(idleTransaction);
      const reviewed = await contract.requestVerification(verificationId, setLifecycle);
      if (!reviewed.success) throw new Error(reviewed.failure?.message || "Verification execution failed.");

      const value = await contract.getVerification(verificationId);
      queryClient.setQueryData(["releaseproof", "verification", verificationId], value);
      onComplete(value);
      success("Release verification finalized", { description: "Both transactions finalized with successful GenVM execution." });
    } catch (caught) {
      error(`Step ${step || 1} failed`, { description: caught instanceof Error ? caught.message : "Transaction failed." });
    } finally {
      setStep(0);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border bg-card/60 p-6 shadow-2xl shadow-purple-950/20">
      <div className="mb-6"><p className="text-xs uppercase tracking-[0.2em] text-accent">New verification</p><h2 className="mt-2 text-2xl font-bold">Verify a software release</h2><p className="mt-2 text-sm text-muted-foreground">Two wallet signatures are required: one stores the request, and one runs validator consensus.</p></div>
      <div className="grid gap-5">
        <div className="grid gap-2"><Label htmlFor="verification-id">Verification ID</Label><Input id="verification-id" maxLength={128} required value={verificationId} onChange={(e) => setVerificationId(e.target.value)} placeholder="release-v1-0-0" disabled={busy} /></div>
        <div className="grid gap-2"><Label htmlFor="repository-url">GitHub repository URL</Label><Input id="repository-url" type="url" maxLength={500} required pattern="https://github\\.com/.+/.+" value={repositoryUrl} onChange={(e) => setRepositoryUrl(e.target.value)} placeholder="https://github.com/owner/repository" disabled={busy} /></div>
        <div className="grid gap-2"><Label htmlFor="commit-sha">Commit SHA</Label><Input id="commit-sha" maxLength={40} minLength={40} required pattern="[0-9a-fA-F]{40}" value={commitSha} onChange={(e) => setCommitSha(e.target.value)} placeholder="0123456789abcdef0123456789abcdef01234567" disabled={busy} /><p className="text-xs text-muted-foreground">Verification is bound to this immutable commit.</p></div>
        <div className="grid gap-2"><Label htmlFor="release-ref">Release / tag <span className="text-muted-foreground">(optional)</span></Label><Input id="release-ref" maxLength={200} value={releaseRef} onChange={(e) => setReleaseRef(e.target.value)} placeholder="v1.0.0" disabled={busy} /></div>
        <div className="grid gap-2"><Label htmlFor="criteria">Acceptance criteria</Label><Textarea id="criteria" maxLength={8000} required value={criteria} onChange={(e) => setCriteria(e.target.value)} placeholder={'Mandatory requirements:\n- Installation documentation\n- Automated tests\n- MIT license'} disabled={busy} /></div>
      </div>
      {step > 0 && <div className="mt-5 rounded-lg border border-accent/30 bg-accent/5 p-3 text-sm font-medium">Step {step} of 2 — {step === 1 ? "Create verification" : "Run validator verification"}</div>}
      <TransactionStatus state={lifecycle} />
      <Button type="submit" className="mt-6 w-full" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{busy ? `Step ${step} of 2 in progress` : "Verify Release"}</Button>
    </form>
  );
}
