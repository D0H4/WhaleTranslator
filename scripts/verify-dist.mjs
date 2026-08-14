import { readFile, readdir } from "node:fs/promises";

const artifacts = (await readdir("dist"))
  .filter((name) => name.endsWith(".js"))
  .map((name) => `dist/${name}`);
const nodeEnvironmentPatterns = [
  /\bprocess\.env\b/u,
  /\bprocess\[\s*["']env["']\s*\]/u
];

for (const artifact of artifacts) {
  const source = await readFile(artifact, "utf8");
  if (nodeEnvironmentPatterns.some((pattern) => pattern.test(source))) {
    throw new Error(`Node runtime reference found in ${artifact}`);
  }
}

process.stdout.write(`Verified ${artifacts.length} JavaScript artifacts.\n`);
