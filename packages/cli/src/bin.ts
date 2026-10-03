#!/usr/bin/env node
/** The `instinct` binary. Everything testable lives in cli.ts. */
import { runCli } from "./cli.js";

const code = await runCli(process.argv.slice(2), process.env, {
  stdout: (t) => process.stdout.write(t),
  stderr: (t) => process.stderr.write(t),
  color: process.stdout.isTTY === true && !process.env.NO_COLOR,
});

// `instinct dev` keeps the server alive; every other command ends here.
if (process.argv[2] !== "dev" || code !== 0) process.exit(code);
