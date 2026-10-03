import { DebugContracts } from "./_components/DebugContracts";
import type { NextPage } from "next";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const metadata = getMetadata({
  title: "Debug Contracts",
  description: "Read and call the deployed contract",
});

const Debug: NextPage = () => {
  return (
    <div className="shell page">
      <h1 className="text-2xl font-bold m-0">Debug contracts</h1>
      <p className="mt-2 mb-0 text-base-content/60">
        Read and call every function of the deployed contract. Generated from{" "}
        <code className="font-mono text-[13px]">packages/nextjs/contracts/deployedContracts.ts</code>.
      </p>
      <DebugContracts />
    </div>
  );
};

export default Debug;
