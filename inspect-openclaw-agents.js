const fs = require("fs");

const configPath = process.argv[2] || "/root/.openclaw/openclaw.json";
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

function summarize(value, depth = 0) {
  if (value === null || typeof value !== "object") return typeof value;
  if (Array.isArray(value)) return `array(${value.length})`;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (/token|password|secret|key/i.test(key)) continue;
    out[key] =
      child && typeof child === "object" && depth < 1 ? summarize(child, depth + 1) : child;
  }
  return out;
}

console.log(JSON.stringify({
  topLevelKeys: Object.keys(config),
  agentsType: Array.isArray(config.agents) ? "array" : typeof config.agents,
  agentsSummary: summarize(config.agents),
  agentSamples: config.agents?.list?.slice?.(0, 5),
}, null, 2));
