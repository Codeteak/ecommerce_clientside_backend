// Fails the commit on production dependency advisories and obvious secrets.
// Zod 3's collection DoS (GHSA-mrhx-c7xc-m3w5) stays allowed until a zod 4 upgrade.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ALLOWED_ADVISORIES = new Set([
  "GHSA-mrhx-c7xc-m3w5"
]);
const SCAN_DIRS = ["src", "scripts", "tests", "bruno"];
const SECRET_PATTERNS = [
  { name: "private key", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "AWS access key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "Stripe live key", re: /sk_live_[0-9a-zA-Z]{16,}/ },
  { name: "GitHub token", re: /ghp_[0-9A-Za-z]{20,}/ }
];

function runAudit() {
  try {
    const stdout = execFileSync("npm", ["audit", "--omit=dev", "--json"], {
      encoding: "utf8",
      cwd: ROOT
    });
    return JSON.parse(stdout);
  } catch (err) {
    const stdout = err.stdout ? String(err.stdout) : "";
    if (!stdout.trim()) throw err;
    return JSON.parse(stdout);
  }
}

function advisoryIds(via) {
  const ids = [];
  for (const item of via || []) {
    if (item && typeof item === "object" && typeof item.url === "string") {
      const match = item.url.match(/GHSA-[0-9a-z-]+/i);
      if (match) ids.push(match[0]);
    }
  }
  return ids;
}

function checkDependencies() {
  const audit = runAudit();
  const failures = [];
  for (const [name, vuln] of Object.entries(audit.vulnerabilities || {})) {
    const severity = vuln.severity;
    if (severity !== "high" && severity !== "critical" && severity !== "moderate") continue;
    const ids = advisoryIds(vuln.via);
    const allowed = ids.length > 0 && ids.every((id) => ALLOWED_ADVISORIES.has(id));
    if (allowed) {
      console.warn(`security: allowed ${severity} advisory in ${name} (${ids.join(", ")})`);
      continue;
    }
    failures.push(`${severity} ${name}${ids.length ? ` (${ids.join(", ")})` : ""}`);
  }
  return failures;
}

function walk(dir, files) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "coverage" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, files);
    else if (stat.isFile()) files.push(path);
  }
}

function checkSecrets() {
  const files = [];
  for (const dir of SCAN_DIRS) walk(join(ROOT, dir), files);
  const hits = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.re.test(text)) {
        hits.push(`${relative(ROOT, file)}: ${pattern.name}`);
      }
    }
  }
  return hits;
}

const dependencyFailures = checkDependencies();
const secretHits = checkSecrets();

if (dependencyFailures.length || secretHits.length) {
  if (dependencyFailures.length) {
    console.error("security: production dependency advisories:");
    for (const line of dependencyFailures) console.error(`  - ${line}`);
  }
  if (secretHits.length) {
    console.error("security: possible secrets:");
    for (const line of secretHits) console.error(`  - ${line}`);
  }
  process.exit(1);
}

console.log("security: ok");
