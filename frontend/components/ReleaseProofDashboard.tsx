"use client";

import { useState } from "react";
import type { Verification } from "@/lib/contracts/types";
import { VerificationForm } from "./VerificationForm";
import { VerificationResult } from "./VerificationResult";

export function ReleaseProofDashboard() {
  const [result, setResult] = useState<Verification | null>(null);
  return <main className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:px-8"><div><h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Software claims,<br /><span className="text-accent">verified by consensus.</span></h1><p className="mb-8 mt-4 max-w-xl text-muted-foreground">ReleaseProof checks natural-language delivery requirements against live GitHub evidence using independent GenLayer validators.</p><VerificationForm onComplete={setResult} /></div><div className="lg:pt-32"><VerificationResult verification={result} /></div></main>;
}
