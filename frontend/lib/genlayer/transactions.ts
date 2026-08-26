"use client";

import { TransactionStatus } from "genlayer-js/types";
import type {
  TransactionExecutionResult,
  TransactionFailure,
  TransactionLifecycleState,
} from "../contracts/types";

type LifecycleListener = (state: TransactionLifecycleState) => void;

const STATUS_NAMES: Record<string, string> = {
  "0": "UNINITIALIZED",
  "1": "PENDING",
  "2": "PROPOSING",
  "3": "COMMITTING",
  "4": "REVEALING",
  "5": "ACCEPTED",
  "6": "UNDETERMINED",
  "7": "FINALIZED",
  "8": "CANCELED",
  "9": "APPEAL_REVEALING",
  "10": "APPEAL_COMMITTING",
  "11": "READY_TO_FINALIZE",
  "12": "VALIDATORS_TIMEOUT",
  "13": "LEADER_TIMEOUT",
};

const EXECUTION_NAMES: Record<string, string> = {
  "0": "NOT_VOTED",
  "1": "FINISHED_WITH_RETURN",
  "2": "FINISHED_WITH_ERROR",
};

const SUCCESSFUL_EXECUTION_RESULTS = new Set(["SUCCESS", "FINISHED_WITH_RETURN"]);
const FAILED_EXECUTION_RESULTS = new Set([
  "ERROR",
  "FAILURE",
  "FINISHED_WITH_ERROR",
  "ROLLBACK",
  "ROLLED_BACK",
  "REVERT",
  "REVERTED",
]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return undefined;
}

function normalizeStatus(receipt: Record<string, unknown>): string {
  const named = textValue(receipt.statusName ?? receipt.status_name);
  if (named && !/^\d+$/.test(named)) return named.toUpperCase();
  const raw = textValue(receipt.status);
  return (raw && STATUS_NAMES[raw]) || named || raw || "UNKNOWN";
}

function leaderReceipts(receipt: Record<string, unknown>): Record<string, unknown>[] {
  const consensus = asRecord(receipt.consensus_data ?? receipt.consensusData);
  const leader = consensus?.leader_receipt ?? consensus?.leaderReceipt;
  const values = Array.isArray(leader) ? leader : leader ? [leader] : [];
  return values.map(asRecord).filter((value): value is Record<string, unknown> => !!value);
}

function normalizeExecution(receipt: Record<string, unknown>): string | undefined {
  const direct = textValue(
    receipt.txExecutionResultName ??
      receipt.tx_execution_result_name ??
      receipt.executionResultName ??
      receipt.execution_result,
  );
  if (direct && !/^\d+$/.test(direct)) return direct.toUpperCase();
  const numeric = textValue(receipt.txExecutionResult ?? receipt.tx_execution_result);
  if (numeric && EXECUTION_NAMES[numeric]) return EXECUTION_NAMES[numeric];

  for (const leader of leaderReceipts(receipt)) {
    const value = textValue(
      leader.execution_result ?? leader.executionResult ?? leader.genvm_result,
    );
    if (value) return (EXECUTION_NAMES[value] || value).toUpperCase();
  }
  return direct || (numeric ? EXECUTION_NAMES[numeric] : undefined);
}

function stringifyPayload(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "null") return undefined;
    try {
      return stringifyPayload(JSON.parse(trimmed)) || trimmed;
    } catch {
      return trimmed;
    }
  }
  if (value === null || value === undefined) return undefined;
  try {
    return JSON.stringify(value, (_, item) =>
      typeof item === "bigint" ? item.toString() : item,
    );
  } catch {
    return String(value);
  }
}

function isRollbackStatus(value: unknown): boolean {
  const status = textValue(value)?.toUpperCase();
  return !!status && FAILED_EXECUTION_RESULTS.has(status);
}

function hasErrorPayload(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasErrorPayload);

  const record = asRecord(value);
  if (!record) return false;

  if (isRollbackStatus(record.status ?? record.result_status ?? record.resultStatus)) {
    return true;
  }

  return [
    record.error,
    record.raw_error,
    record.rawError,
    record.error_code,
    record.errorCode,
    record.error_description,
    record.errorDescription,
    record.stderr,
    record.rollback,
    record.revert,
    record.revert_reason,
    record.revertReason,
  ].some((item) => stringifyPayload(item) !== undefined);
}

function findFailurePayload(receipt: Record<string, unknown>): unknown {
  const explicitCandidates: unknown[] = [];
  const resultCandidates: unknown[] = [];
  for (const leader of leaderReceipts(receipt)) {
    explicitCandidates.push(
      leader.error,
      leader.rollback,
      leader.revert,
      leader.stderr,
    );
    resultCandidates.push(leader.genvm_result, leader.result);
  }
  explicitCandidates.push(
    receipt.error,
    receipt.rollback,
    receipt.revertReason,
    receipt.revert_reason,
    receipt.stderr,
  );
  resultCandidates.push(receipt.result);

  return (
    explicitCandidates.find((candidate) => stringifyPayload(candidate)) ??
    resultCandidates.find(hasErrorPayload)
  );
}

function failureFromReceipt(
  receipt: Record<string, unknown>,
  fallback: string,
): TransactionFailure {
  const payload = findFailurePayload(receipt);
  const detail = stringifyPayload(payload);
  return { message: detail || fallback, payload };
}

export function errorToFailure(error: unknown): TransactionFailure {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const payload = record.data ?? record.details ?? record.cause ?? error;
    return {
      message:
        textValue(record.shortMessage) ||
        textValue(record.message) ||
        stringifyPayload(payload) ||
        "Transaction failed",
      payload,
    };
  }
  return { message: textValue(error) || "Transaction failed", payload: error };
}

export async function executeFinalizedWrite(
  client: any,
  submit: () => Promise<`0x${string}`>,
  onLifecycle?: LifecycleListener,
): Promise<TransactionExecutionResult> {
  onLifecycle?.({ stage: "awaiting_signature" });

  let hash: `0x${string}`;
  try {
    hash = await submit();
  } catch (error) {
    const failure = errorToFailure(error);
    onLifecycle?.({ stage: "execution_failed", failure });
    throw Object.assign(new Error(failure.message), { failure });
  }

  onLifecycle?.({ stage: "submitted", hash });
  onLifecycle?.({ stage: "pending_consensus", hash, consensusStatus: "PENDING" });

  let rawReceipt: unknown;
  try {
    rawReceipt = await client.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.FINALIZED,
      retries: 240,
      interval: 5000,
    });
  } catch (error) {
    const failure = errorToFailure(error);
    onLifecycle?.({ stage: "execution_failed", hash, failure });
    throw Object.assign(new Error(failure.message), { failure, hash });
  }

  const receipt = asRecord(rawReceipt) || {};
  const consensusStatus = normalizeStatus(receipt);
  const consensusResult = textValue(receipt.resultName ?? receipt.result_name ?? receipt.result);
  const executionStatus = normalizeExecution(receipt);

  onLifecycle?.({
    stage: "finalized",
    hash,
    consensusStatus,
    consensusResult,
    executionStatus,
    receipt: rawReceipt,
  });

  const executionSucceeded =
    consensusStatus === "FINALIZED" &&
    !!executionStatus &&
    SUCCESSFUL_EXECUTION_RESULTS.has(executionStatus);

  if (!executionSucceeded) {
    const failure = failureFromReceipt(
      receipt,
      executionStatus && FAILED_EXECUTION_RESULTS.has(executionStatus)
        ? "The contract execution rolled back."
        : `Transaction finalized without successful execution (${executionStatus || "unknown execution result"}).`,
    );
    const result: TransactionExecutionResult = {
      success: false,
      hash,
      receipt: rawReceipt,
      consensusStatus,
      consensusResult,
      executionStatus,
      failure,
    };
    onLifecycle?.({ stage: "execution_failed", ...result });
    return result;
  }

  const result: TransactionExecutionResult = {
    success: true,
    hash,
    receipt: rawReceipt,
    consensusStatus,
    consensusResult,
    executionStatus,
  };
  onLifecycle?.({ stage: "execution_succeeded", ...result });
  return result;
}
