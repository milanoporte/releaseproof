import { readFileSync } from "fs";
import path from "path";
import { TransactionHash, TransactionStatus, GenLayerClient, DecodedDeployData, GenLayerChain } from "genlayer-js/types";
import { localnet } from "genlayer-js/chains";

export default async function main(client: GenLayerClient<any>) {
  const code = new Uint8Array(readFileSync(path.resolve(process.cwd(), "contracts/ReleaseProof.py")));
  await client.initializeConsensusSmartContract();
  const transaction = await client.deployContract({ code, args: [] });
  const receipt = await client.waitForTransactionReceipt({ hash: transaction as TransactionHash, status: TransactionStatus.ACCEPTED, retries: 200 });
  if (receipt.status !== 5 && receipt.status !== 6 && receipt.statusName !== "ACCEPTED" && receipt.statusName !== "FINALIZED") throw new Error(`Deployment failed: ${JSON.stringify(receipt)}`);
  const address = (client.chain as GenLayerChain).id === localnet.id ? receipt.data.contract_address : (receipt.txDataDecoded as DecodedDeployData)?.contractAddress;
  console.log(`ReleaseProof deployed at: ${address}`);
}
