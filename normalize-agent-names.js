const fs = require("fs");
const path = require("path");

const configPath = process.argv[2] || "/root/.openclaw/openclaw.json";
const mapPath = process.argv[3] || "/tmp/agent-identity-map.tsv";

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const map = new Map(
  fs
    .readFileSync(mapPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => {
      const [id, ...nameParts] = line.split("\t");
      return [id, nameParts.join("\t")];
    }),
);

if (!config.agents || !Array.isArray(config.agents.list)) {
  throw new Error("Expected config.agents.list array");
}

const changed = [];
for (const agent of config.agents.list) {
  const nextName = map.get(agent.id);
  if (!nextName) continue;
  if (agent.name !== nextName) {
    changed.push({ id: agent.id, from: agent.name, to: nextName });
    agent.name = nextName;
  }
  agent.identity = agent.identity && typeof agent.identity === "object" ? agent.identity : {};
  agent.identity.name = nextName;
}

const missing = [...map.keys()].filter((id) => !config.agents.list.some((agent) => agent.id === id));
if (missing.length) {
  throw new Error(`Missing agents in config: ${missing.join(", ")}`);
}

const backupPath = `${configPath}.pre-name-normalize-${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
fs.copyFileSync(configPath, backupPath);
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  ok: true,
  configPath,
  backupPath,
  changedCount: changed.length,
  changed,
}, null, 2));
