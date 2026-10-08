#!/usr/bin/env node

import {
  assertWp10OperatorPreflight,
  createWp10RolloutReceiptSkeleton,
  redactWp10Value,
} from "../src/lib/wp10-rollout-receipt";

interface CliOptions {
  mode: string;
  environment: string;
  releaseId?: string;
  storageKey?: string;
  confirmation?: string;
}

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function parseArgs(args: string[]): CliOptions {
  const supported = new Set(["--mode", "--environment", "--release-id", "--storage-key", "--confirm"]);
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (!flag || !supported.has(flag)) throw new Error(`Unsupported operator option: ${flag ?? "<empty>"}`);
    if (!args[index + 1] || args[index + 1]!.startsWith("--")) throw new Error(`${flag} requires a value.`);
  }
  return {
    mode: readOption(args, "--mode") ?? "baseline-readback",
    environment: readOption(args, "--environment") ?? "production",
    releaseId: readOption(args, "--release-id"),
    storageKey: readOption(args, "--storage-key"),
    confirmation: readOption(args, "--confirm"),
  };
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const preflight = assertWp10OperatorPreflight({
    mode: options.mode,
    allowMutation: process.env.WP10_ALLOW_MUTATION,
    environment: options.environment,
    releaseId: options.releaseId,
    storageKey: options.storageKey,
    confirmation: options.confirmation,
  });
  const receipt = createWp10RolloutReceiptSkeleton({
    releaseId: preflight.releaseId,
    environment: options.environment === "production" ? "production" : options.environment === "staging" ? "staging" : "local",
  });

  console.log(JSON.stringify(redactWp10Value({
    operatorPreflight: {
      ...preflight,
      directProductionConnection: false,
      note: "Safety skeleton only. No R2, database, deploy, or network operation was attempted.",
    },
    receipt,
  }), null, 2));
}

main();
