export interface Verification {
  id: string;
  creator: string;
  repository_url: string;
  release_ref: string;
  criteria: string;
  status: "CREATED" | "VERIFIED" | "FAILED" | "INCONCLUSIVE";
  verdict: "" | "VERIFIED" | "FAILED" | "INCONCLUSIVE";
  score: number;
  reason_code: string;
  summary: string;
}

export interface CreateVerificationInput {
  verification_id: string;
  repository_url: string;
  release_ref: string;
  criteria: string;
}

export type TransactionStage = "idle" | "awaiting_signature" | "submitted" | "pending_consensus" | "finalized" | "execution_succeeded" | "execution_failed";
export interface TransactionFailure { message: string; payload?: unknown; }
export interface TransactionLifecycleState {
  stage: TransactionStage;
  hash?: `0x${string}`;
  consensusStatus?: string;
  consensusResult?: string;
  executionStatus?: string;
  receipt?: unknown;
  failure?: TransactionFailure;
}
export interface TransactionExecutionResult {
  success: boolean;
  hash: `0x${string}`;
  receipt: unknown;
  consensusStatus: string;
  consensusResult?: string;
  executionStatus?: string;
  failure?: TransactionFailure;
}
