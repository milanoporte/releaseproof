"use client";

import { AlertCircle, CheckCircle2, Circle, Loader2 } from "lucide-react";
import type { TransactionLifecycleState } from "@/lib/contracts/types";
import { AddressDisplay } from "./AddressDisplay";

const labels: Record<TransactionLifecycleState["stage"], string> = {
  idle: "Ready",
  awaiting_signature: "Confirm in MetaMask",
  submitted: "Transaction submitted",
  pending_consensus: "Validators are reaching consensus",
  finalized: "Consensus finalized; checking execution",
  execution_succeeded: "Execution succeeded",
  execution_failed: "Execution failed",
};

export function TransactionStatus({ state }: { state: TransactionLifecycleState }) {
  if (state.stage === "idle") return null;
  const failed = state.stage === "execution_failed";
  const succeeded = state.stage === "execution_succeeded";
  const Icon = failed ? AlertCircle : succeeded ? CheckCircle2 : state.stage === "submitted" ? Circle : Loader2;

  return (
    <div className={`mt-4 rounded-lg border p-4 ${failed ? "border-destructive/50 bg-destructive/10" : succeeded ? "border-emerald-500/40 bg-emerald-500/10" : "border-accent/30 bg-accent/5"}`}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${!failed && !succeeded ? "animate-spin text-accent" : failed ? "text-destructive" : "text-emerald-400"}`} />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{labels[state.stage]}</p>
          {state.hash && (
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span>Transaction</span>
              <AddressDisplay address={state.hash} maxLength={18} showCopy />
            </div>
          )}
          {(state.consensusStatus || state.executionStatus) && (
            <p className="mt-2 text-xs text-muted-foreground">
              Consensus: {state.consensusStatus || "pending"}
              {state.consensusResult ? ` · ${state.consensusResult}` : ""}
              {state.executionStatus ? ` · Execution: ${state.executionStatus}` : ""}
            </p>
          )}
          {state.failure && (
            <div className="mt-3 rounded bg-black/30 p-3">
              <p className="text-sm text-destructive-foreground">{state.failure.message}</p>
              {state.failure.payload !== undefined && (
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Raw rollback details</summary>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all">
                    {safeJson(state.failure.payload)}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2);
  } catch {
    return String(value);
  }
}
