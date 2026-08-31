import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { CreateVerificationInput, TransactionExecutionResult, TransactionLifecycleState, Verification } from "./types";
import { estimateWriteFeePreset, feePresetToTransactionFees } from "../genlayer/fees";
import { executeFinalizedWrite } from "../genlayer/transactions";

type LifecycleListener = (state: TransactionLifecycleState) => void;

function recordOf(value: unknown): Record<string, unknown> {
  if (value instanceof Map) return Object.fromEntries(value.entries());
  if (value && typeof value === "object") return value as Record<string, unknown>;
  throw new Error("Contract returned an unexpected value.");
}
const stringOf = (value: unknown) => value == null ? "" : String(value);

export class ReleaseProofContract {
  private readonly address: `0x${string}`;
  private readonly client: any;

  constructor(contractAddress: string, account?: string | null, endpoint?: string) {
    this.address = contractAddress as `0x${string}`;
    this.client = createClient({ chain: studionet, ...(account ? { account: account as `0x${string}` } : {}), ...(endpoint ? { endpoint } : {}) } as any);
  }

  async getVerification(id: string): Promise<Verification> {
    const raw = recordOf(await this.client.readContract({ address: this.address, functionName: "get_verification", args: [id] }));
    return {
      id: stringOf(raw.id), creator: stringOf(raw.creator), repository_url: stringOf(raw.repository_url), commit_sha: stringOf(raw.commit_sha),
      release_ref: stringOf(raw.release_ref), criteria: stringOf(raw.criteria), status: stringOf(raw.status) as Verification["status"],
      verdict: stringOf(raw.verdict) as Verification["verdict"], score: Number(raw.score) || 0,
      reason_code: stringOf(raw.reason_code), summary: stringOf(raw.summary),
    };
  }

  private async write(functionName: string, args: unknown[], listener?: LifecycleListener): Promise<TransactionExecutionResult> {
    const request = { address: this.address, functionName, args, value: 0n };
    const preset = await estimateWriteFeePreset(this.client, request, "standard");
    const fees = feePresetToTransactionFees(preset);
    return executeFinalizedWrite(this.client, () => this.client.writeContract({ ...request, ...(fees ? { fees } : {}) }), listener);
  }

  createVerification(input: CreateVerificationInput, listener?: LifecycleListener) {
    return this.write("create_verification", [input.verification_id, input.repository_url, input.commit_sha, input.release_ref, input.criteria], listener);
  }
  requestVerification(id: string, listener?: LifecycleListener) {
    return this.write("request_verification", [id], listener);
  }
}
