const { readFileSync } = require("node:fs");
const { spawn } = require("node:child_process");

// create-scaffold-hbar 0.4.1 leaves .harness untouched in npm projects.
const { packageManager } = JSON.parse(readFileSync("package.json", "utf8"));
const manager = packageManager?.startsWith("yarn@") ? "yarn" : "npm";
const [script, ...args] = process.argv.slice(2);
if (!script) throw new Error("Expected install or a package script name.");
const commandArgs = script === "install" ? ["install", ...args] : ["run", script, ...(manager === "npm" ? ["--"] : []), ...args];
const env = { ...process.env };
if (script === "next:dev") env.PORT = process.env.PORT || "20960";
const child = spawn(manager, commandArgs, { stdio: "inherit", env });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", error => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", code => { process.exitCode = code ?? 1; });
