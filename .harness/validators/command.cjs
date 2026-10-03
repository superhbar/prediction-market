// Runs a root package script with the project's own package manager. create-scaffold-hbar copies .harness/
// unchanged into npm projects, so the validators cannot hard-code yarn.
const { readFileSync } = require("node:fs");
const { spawn } = require("node:child_process");

const { packageManager } = JSON.parse(readFileSync("package.json", "utf8"));
const manager = packageManager?.startsWith("yarn@") ? "yarn" : "npm";
const [script, ...args] = process.argv.slice(2);
if (!script) throw new Error("Usage: node .harness/validators/command.cjs <install | script> [args]");

// npm needs "--" before script arguments; yarn passes them through as is.
const separator = manager === "npm" && args.length > 0 ? ["--"] : [];
const commandArgs = script === "install" ? ["install", ...args] : ["run", script, ...separator, ...args];
const env = { ...process.env };
if (script === "next:dev") env.PORT = process.env.PORT || "20960";

const child = spawn(manager, commandArgs, { stdio: "inherit", env });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", error => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", code => {
  process.exitCode = code ?? 1;
});
