"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ReleaseProofContract } from "../contracts/ReleaseProof";
import { getContractAddress, getStudioUrl } from "../genlayer/client";
import { useWallet } from "../genlayer/wallet";

export const idleTransaction = { stage: "idle" as const };

export function useReleaseProofContract() {
  const { address } = useWallet();
  const contractAddress = getContractAddress();
  const endpoint = getStudioUrl();
  return useMemo(() => contractAddress ? new ReleaseProofContract(contractAddress, address, endpoint) : null, [contractAddress, address, endpoint]);
}

export function useVerification(id: string, enabled = true) {
  const contract = useReleaseProofContract();
  return useQuery({ queryKey: ["releaseproof", "verification", id], queryFn: () => contract!.getVerification(id), enabled: enabled && !!contract && !!id.trim(), retry: false });
}
