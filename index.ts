#!/usr/bin/env bun
import { homedir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { Octokit } from "@octokit/rest";
import picocolors from "picocolors";
import * as v from "valibot";

const ToolSchema = v.object({
  bin: v.pipe(v.string(), v.minLength(1)),
  repo: v.pipe(v.string(), v.regex(/^[^/\s]+\/[^/\s]+$/)),
  versionCmd: v.pipe(v.string(), v.minLength(1)),
  updateCmd: v.pipe(v.string(), v.minLength(1)),
});

export type Tool = v.InferOutput<typeof ToolSchema>;

const ToolConfigSchema = v.strictObject({
  repository: v.pipe(v.string(), v.minLength(1)),
  version_command: v.pipe(v.string(), v.minLength(1)),
  update_command: v.pipe(v.string(), v.minLength(1)),
});

const ConfigSchema = v.strictObject({
  tools: v.record(v.pipe(v.string(), v.minLength(1)), ToolConfigSchema),
});

export class ConfigError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
  }
}

function githubRepo(repository: string, path: string, bin: string): string {
  let url: URL;
  try {
    url = new URL(repository);
  } catch {
    throw new ConfigError(path, `tool "${bin}" repository must be a GitHub repository URL`);
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const [owner, repo] = parts;
  const repoName = repo?.replace(/\.git$/, "");
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    !owner ||
    !repoName ||
    parts.length !== 2
  ) {
    throw new ConfigError(path, `tool "${bin}" repository must be a GitHub repository URL`);
  }
  return `${owner}/${repoName}`;
}

export function parseTools(source: string, path: string): Tool[] {
  let config: unknown;
  try {
    config = Bun.TOML.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid TOML";
    throw new ConfigError(path, `invalid TOML: ${message}`);
  }

  const parsed = v.safeParse(ConfigSchema, config);
  if (!parsed.success) {
    const issues = parsed.issues.map((issue) => issue.message).join("; ");
    throw new ConfigError(path, `invalid configuration: ${issues}`);
  }
  const entries = Object.entries(parsed.output.tools);
  if (entries.length === 0) {
    throw new ConfigError(path, 'invalid configuration: define at least one tool under "[tools]"');
  }

  return entries.map(([bin, tool]) => ({
    bin,
    repo: githubRepo(tool.repository, path, bin),
    versionCmd: tool.version_command,
    updateCmd: tool.update_command,
  }));
}

export function resolveConfigPath({
  xdgConfigHome,
  homeDir,
}: {
  xdgConfigHome?: string;
  homeDir: string;
}): string {
  return join(xdgConfigHome || join(homeDir, ".config"), "delta", "delta.toml");
}

export async function loadTools(
  path: string,
  readFile: (configPath: string) => Promise<string> = (configPath) => Bun.file(configPath).text(),
): Promise<{ status: "loaded"; tools: Tool[] } | { status: "missing" }> {
  try {
    return { status: "loaded", tools: parseTools(await readFile(path), path) };
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === "ENOENT") return { status: "missing" };
    if (error instanceof ConfigError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(path, `unable to read configuration: ${message}`);
  }
}

export type RunShell = (cmd: string) => Promise<{ output: string; exitCode: number }>;

export type UpdaterDeps = {
  commandExists: (bin: string) => boolean;
  runShell: RunShell;
  getLatestTag: (repo: string) => Promise<string>;
  out: (s: string) => void;
  err: (s: string) => void;
};

export const runShell: RunShell = async (cmd) => {
  const proc = Bun.spawn(["bash", "-o", "pipefail", "-c", "--", cmd], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [output, errOutput, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { output: output + errOutput, exitCode };
};

async function processTool(tool: Tool, deps: UpdaterDeps): Promise<boolean> {
  const parsed = v.safeParse(ToolSchema, tool);
  if (!parsed.success) {
    const reason = parsed.issues.map((i) => i.message).join("; ");
    const binLabel =
      typeof (tool as { bin?: unknown }).bin === "string"
        ? (tool as { bin: string }).bin
        : "<unknown>";
    deps.err(
      `${picocolors.bold(picocolors.red("[error]"))} Invalid config for ${binLabel}: ${reason}\n`,
    );
    return false;
  }
  tool = parsed.output;

  if (!deps.commandExists(tool.bin)) {
    deps.out(`${picocolors.yellow(`${tool.bin} is not installed`)}\n`);
    return true;
  }

  const versionResult = await deps.runShell(tool.versionCmd);
  const current =
    versionResult.exitCode === 0 ? versionResult.output.match(/\d+\.\d+\.\d+/)?.[0] : undefined;
  if (!current) {
    deps.err(
      `${picocolors.bold(picocolors.red("[error]"))} Failed to get installed version for ${tool.repo}\n`,
    );
    return false;
  }

  let latest: string;
  try {
    latest = (await deps.getLatestTag(tool.repo)).replace(/^v/, "");
  } catch (e) {
    const status = (e as { status?: number } | null)?.status;
    deps.err(
      `${picocolors.bold(picocolors.red("[error]"))} ${
        status === 404
          ? `No GitHub release found for ${tool.repo}`
          : `Failed to get latest version for ${tool.repo}`
      }\n`,
    );
    return false;
  }
  if (!/^\d+\.\d+\.\d+$/.test(latest)) {
    deps.err(
      `${picocolors.bold(picocolors.red("[error]"))} Failed to get latest version for ${tool.repo}\n`,
    );
    return false;
  }

  deps.out(`${picocolors.blue(`${tool.bin}:`)} installed=${current} latest=${latest}\n`);
  if (current === latest) {
    deps.out(`${picocolors.bold(picocolors.white("[no-op]"))} already up to date\n`);
    return true;
  }

  deps.out(
    `${picocolors.bold(picocolors.green("[updated]"))} ${tool.bin} from ${current} to ${latest}\n`,
  );
  const updateResult = await deps.runShell(tool.updateCmd);
  if (updateResult.exitCode !== 0) {
    deps.err(`${picocolors.bold(picocolors.red("[error]"))} Failed to update ${tool.repo}\n`);
    return false;
  }
  return true;
}

export async function runUpdater(toolList: Tool[], deps: UpdaterDeps): Promise<number> {
  process.env["TIRITH"] = "0";
  let status = 0;

  for (const tool of toolList) {
    if (!(await processTool(tool, deps))) status = 1;
    deps.out("\n");
  }

  if (status) {
    deps.err("Update completed with errors\n");
    return 1;
  }
  deps.out("Update complete\n");
  return status;
}

export function firstRunMessage(path: string): string {
  return `No tools have been configured yet.

Create the configuration file at:

  ${path}

Then add at least one tool:

  [tools.example]
  repository = "https://github.com/owner/repository"
  version_command = "example --version"
  update_command = "example update"

After saving the file, run Delta again.
`;
}

export type CliDeps = {
  configPath?: string;
  readFile?: (configPath: string) => Promise<string>;
  updaterDeps?: UpdaterDeps;
};

export function buildProgram(deps: CliDeps = {}): Command {
  return new Command()
    .name("delta")
    .description("Keep curated CLI tools up to date against their latest GitHub releases")
    .version("0.1.0")
    .option("-c, --config <path>", "read tool configuration from this path")
    .option("--print-config-path", "print resolved configuration path and exit")
    .action(async (options: { config?: string; printConfigPath?: boolean }) => {
      const configPath =
        options.config ??
        deps.configPath ??
        resolveConfigPath({
          xdgConfigHome: process.env["XDG_CONFIG_HOME"],
          homeDir: homedir(),
        });
      if (options.printConfigPath) {
        if (deps.updaterDeps) deps.updaterDeps.out(`${configPath}\n`);
        else process.stdout.write(`${configPath}\n`);
        return;
      }

      const updaterDeps =
        deps.updaterDeps ??
        (() => {
          const octokit = new Octokit({ auth: process.env["GITHUB_TOKEN"] });
          return {
            commandExists: (bin: string) => Bun.which(bin) !== null,
            runShell,
            getLatestTag: async (repo: string) => {
              const [owner, name] = repo.split("/") as [string, string];
              const { data } = await octokit.rest.repos.getLatestRelease({ owner, repo: name });
              return data.tag_name;
            },
            out: (s: string) => {
              process.stdout.write(s);
            },
            err: (s: string) => {
              process.stderr.write(s);
            },
          };
        })();

      try {
        const config = await loadTools(configPath, deps.readFile);
        if (config.status === "missing") {
          updaterDeps.out(firstRunMessage(configPath));
          process.exitCode = 1;
          return;
        }
        process.exitCode = await runUpdater(config.tools, updaterDeps);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        updaterDeps.err(`${picocolors.bold(picocolors.red("[error]"))} ${message}\n`);
        process.exitCode = 1;
      }
    });
}

if (import.meta.main) {
  await buildProgram().parseAsync(process.argv);
}
