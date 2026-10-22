#!/usr/bin/env node
import { nodeIo, run } from "./cli.js";

run(process.argv.slice(2), { io: nodeIo(), env: process.env, cwd: process.cwd(), fetch: globalThis.fetch }).then((code) => process.exit(code));
