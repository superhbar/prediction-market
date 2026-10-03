import { createPublicClient, http } from "viem";
import deployedContracts from "~~/contracts/deployedContracts";
import { toMarket } from "~~/hooks/markets/abis";
import scaffoldConfig from "~~/scaffold.config";
import type { StatusConfig } from "~~/utils/markets/status";

/** The network the app targets first, and the contract deployed there. Server-side only. */
export function primaryDeployment() {
  const chain = scaffoldConfig.targetNetworks[0];
  const contract = deployedContracts[chain.id as keyof typeof deployedContracts]?.PredictionMarkets;
  if (!contract) throw new Error(`PredictionMarkets is not deployed on chain ${chain.id}`);
  const client = createPublicClient({ chain, transport: http(scaffoldConfig.rpcOverrides?.[chain.id]) });
  return { chain, contract, client };
}

/** Reads the status config, the market count and the requested markets in parallel. */
export async function readMarkets(ids: (count: number) => number[]) {
  const { chain, contract, client } = primaryDeployment();
  const read = <T>(functionName: string, args: readonly unknown[] = []) =>
    client.readContract({ address: contract.address, abi: contract.abi, functionName, args } as never) as Promise<T>;

  const [count, settlementDelay, gracePeriod, maxRetries] = await Promise.all([
    read<bigint>("marketCount"),
    read<bigint>("settlementDelay"),
    read<bigint>("gracePeriod"),
    read<number>("maxRetries"),
  ]);
  const config: StatusConfig = { settlementDelay, gracePeriod, maxRetries: Number(maxRetries) };
  const selected = ids(Number(count)).filter(id => id >= 0 && id < Number(count));
  const markets = await Promise.all(
    selected.map(async id => ({
      id,
      market: toMarket(await read<Parameters<typeof toMarket>[0]>("getMarket", [BigInt(id)])),
    })),
  );
  return { chainId: chain.id, contract: contract.address, count: Number(count), config, markets, read };
}
