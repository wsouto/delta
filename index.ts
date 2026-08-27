#!/usr/bin/env bun
import { mkdir, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { confirm, isCancel, text } from "@clack/prompts";
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
  return join(xdgConfigHome || join(homeDir, ".config"), "delta", "tools.toml");
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

function isEmptyToolConfig(source: string): boolean {
  try {
    const config = Bun.TOML.parse(source);
    if (!config || typeof config !== "object" || Array.isArray(config)) return false;
    const entries = Object.entries(config);
    if (entries.length === 0) return true;
    if (entries.length !== 1) return false;
    const [name, value] = entries[0]!;
    return (
      name === "tools" &&
      !!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    );
  } catch {
    return false;
  }
}

async function loadToolsForAdd(
  path: string,
  readFile: (configPath: string) => Promise<string> = (configPath) => Bun.file(configPath).text(),
): Promise<{ status: "loaded"; tools: Tool[]; source: string } | { status: "missing"; source: string }> {
  try {
    const source = await readFile(path);
    try {
      return { status: "loaded", tools: parseTools(source, path), source };
    } catch (error) {
      if (error instanceof ConfigError && isEmptyToolConfig(source)) {
        return { status: "loaded", tools: [], source };
      }
      throw error;
    }
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === "ENOENT") return { status: "missing", source: "" };
    if (error instanceof ConfigError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(path, `unable to read configuration: ${message}`);
  }
}

function toolToml(bin: string, tool: { repository: string; versionCommand: string; updateCommand: string }): string {
  const key = /^[A-Za-z0-9_-]+$/.test(bin) ? bin : JSON.stringify(bin);
  return `[tools.${key}]
repository = ${JSON.stringify(tool.repository)}
version_command = ${JSON.stringify(tool.versionCommand)}
update_command = ${JSON.stringify(tool.updateCommand)}
`;
}

/**
 * Surgically rewrites field values inside an existing `[tools.<bin>]` table.
 * Intentionally preservation-only: comments, indentation, and quote spacing
 * are kept verbatim. AGENTS.md "editToolToml is intentionally preservation-only"
 * is the contract; taplo disagreements are settled upstream, not here.
 */
function editToolToml(
  source: string,
  bin: string,
  tool: { repository: string; versionCommand: string; updateCommand: string },
  path: string,
): string {
  const key = /^[A-Za-z0-9_-]+$/.test(bin) ? bin : JSON.stringify(bin);
  const header = `[tools.${key}]`;
  const escapedHeader = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headerRe = new RegExp(`^[ \\t]*${escapedHeader}(?:[ \\t]*(?:#.*)?)?$`);
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r\n|\n/);
  const start = lines.findIndex((line) => headerRe.test(line));
  if (start === -1) {
    throw new ConfigError(path, `tool "${bin}" could not be located in the configuration`);
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if ((lines[i] ?? "").trimStart().startsWith("[")) {
      end = i;
      break;
    }
  }
  const updated = [...lines];
  const fields: Array<[string, string]> = [
    ["repository", tool.repository],
    ["version_command", tool.versionCommand],
    ["update_command", tool.updateCommand],
  ];
  for (const [field, value] of fields) {
    const fieldLine = lines.slice(start, end).findIndex((line) => new RegExp(`^\\s*${field}\\s*=`).test(line));
    const index = fieldLine === -1 ? -1 : start + fieldLine;
    if (index === -1) {
      throw new ConfigError(path, `tool "${bin}" is missing the "${field}" field`);
    }
    updated[index] = replaceFieldValue(updated[index]!, field, value);
  }
  return updated.join(eol);
}

function replaceFieldValue(line: string, field: string, value: string): string {
  const quoted = new RegExp(`^(\\s*${field}\\s*=\\s*)"((?:[^"\\\\]|\\\\.)*)"(.*)$`);
  const replaced = line.replace(quoted, (_match, prefix: string, _current: string, rest: string) => {
    return `${prefix}${JSON.stringify(value)}${rest}`;
  });
  if (replaced !== line) return replaced;
  return line.replace(new RegExp(`^(\\s*${field}\\s*=\\s*).*$`), `$1${JSON.stringify(value)}`);
}

/**
 * Surgically removes a `[tools.<bin>]` table from the configuration source.
 * Like `editToolToml`, this is intentionally preservation-only: the file's
 * comments, indentation, and quote spacing outside the deleted section are
 * kept verbatim. The deleted section is exactly the lines from its
 * `[tools.<bin>]` header through (but not including) the next column-0
 * `[`-header or end of file. No surrounding blank lines are touched, so
 * the blank separator that already lived between the deleted section and
 * the next surviving table is preserved and never compacted against
 * adjacent sections. AGENTS.md records the same contract for
 * `editToolToml`; the writer is intentionally weak and the input/source
 * of truth bears the formatting responsibility.
 */
function deleteToolToml(source: string, bin: string, path: string): string {
  const key = /^[A-Za-z0-9_-]+$/.test(bin) ? bin : JSON.stringify(bin);
  const header = `[tools.${key}]`;
  const escapedHeader = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headerRe = new RegExp(`^[ \\t]*${escapedHeader}(?:[ \\t]*(?:#.*)?)?$`);
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r\n|\n/);
  const start = lines.findIndex((line) => headerRe.test(line));
  if (start === -1) {
    throw new ConfigError(path, `tool "${bin}" could not be located in the configuration`);
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if ((lines[i] ?? "").trimStart().startsWith("[")) {
      end = i;
      break;
    }
  }
  return [...lines.slice(0, start), ...lines.slice(end)].join(eol);
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
  writeFile?: (configPath: string, content: string) => Promise<void>;
  renameFile?: (from: string, to: string) => Promise<void>;
  removeFile?: (path: string) => Promise<void>;
  makeDir?: (path: string) => Promise<void>;
  prompt?: (
    message: string,
    initialValue?: string | boolean,
  ) => Promise<string | boolean | symbol>;
  isCancelled?: (value: string | boolean | symbol) => boolean;
  updaterDeps?: UpdaterDeps;
};

async function writeConfig(configPath: string, source: string, deps: CliDeps): Promise<void> {
  const temporaryPath = `${configPath}.${crypto.randomUUID()}.tmp`;
  await (deps.makeDir ?? (async (path: string) => mkdir(path, { recursive: true })))(dirname(configPath));
  try {
    await (deps.writeFile ??
      (async (path: string, content: string) => {
        await Bun.write(path, content);
      }))(temporaryPath, source);
    await (deps.renameFile ?? rename)(temporaryPath, configPath);
  } catch (error) {
    await (deps.removeFile ?? unlink)(temporaryPath).catch(() => {});
    throw error;
  }
}

export function buildProgram(deps: CliDeps = {}): Command {
  return new Command()
    .name("delta")
    .description("Keep curated CLI tools up to date against their latest GitHub releases")
    .version("0.3.0")
    .option("-c, --config <path>", "read/write tool configuration at this path")
    .option("-a, --add <tool>", "add a tool to configuration")
    .option("-e, --edit <tool>", "edit a tool in configuration")
    .option("-d, --delete <tool>", "delete a tool from configuration")
    .option("--list", "list configured tools without checking for updates")
    .option("--print-config-path", "print resolved configuration path and exit")
    .action(
      async (options: {
        add?: string;
        edit?: string;
        delete?: string;
        list?: boolean;
        config?: string;
        printConfigPath?: boolean;
      }) => {
      const configPath =
        options.config ??
        deps.configPath ??
        resolveConfigPath({
          xdgConfigHome: process.env["XDG_CONFIG_HOME"],
          homeDir: homedir(),
        });

      const updaterDeps =
        deps.updaterDeps ??
        (() => {
          let octokit: Octokit | undefined;
          return {
            commandExists: (bin: string) => Bun.which(bin) !== null,
            runShell,
            getLatestTag: async (repo: string) => {
              const client = (octokit ??= new Octokit({ auth: process.env["GITHUB_TOKEN"] }));
              const [owner, name] = repo.split("/") as [string, string];
              const { data } = await client.rest.repos.getLatestRelease({ owner, repo: name });
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
        if (options.add !== undefined && options.edit !== undefined) {
          throw new ConfigError(configPath, "--add and --edit cannot be used together");
        }
        if (options.add !== undefined && options.delete !== undefined) {
          throw new ConfigError(configPath, "--add and --delete cannot be used together");
        }
        if (options.edit !== undefined && options.delete !== undefined) {
          throw new ConfigError(configPath, "--edit and --delete cannot be used together");
        }
        if (options.add !== undefined && options.printConfigPath) {
          throw new ConfigError(configPath, "--add and --print-config-path cannot be used together");
        }
        if (options.edit !== undefined && options.printConfigPath) {
          throw new ConfigError(configPath, "--edit and --print-config-path cannot be used together");
        }
        if (options.delete !== undefined && options.printConfigPath) {
          throw new ConfigError(configPath, "--delete and --print-config-path cannot be used together");
        }
        if (options.list && options.add !== undefined) {
          throw new ConfigError(configPath, "--list and --add cannot be used together");
        }
        if (options.list && options.edit !== undefined) {
          throw new ConfigError(configPath, "--list and --edit cannot be used together");
        }
        if (options.list && options.delete !== undefined) {
          throw new ConfigError(configPath, "--list and --delete cannot be used together");
        }
        if (options.list && options.printConfigPath) {
          throw new ConfigError(configPath, "--list and --print-config-path cannot be used together");
        }
        if (options.printConfigPath) {
          updaterDeps.out(`${configPath}\n`);
          return;
        }
        if (options.add !== undefined) {
          const bin = options.add.trim();
          if (!bin) throw new ConfigError(configPath, "tool name must not be empty");
          const prompt = deps.prompt ?? ((message: string, initialValue?: string) => text({ message, initialValue }));
          const isPromptCancelled = deps.isCancelled ?? isCancel;
          const config = await loadToolsForAdd(configPath, deps.readFile);
          if (config.status === "loaded" && config.tools.some((tool) => tool.bin === bin)) {
            throw new ConfigError(configPath, `tool "${bin}" already exists`);
          }

          const existingSource = config.source;
          let source = "";
          while (!source) {
            const values: string[] = [];
            for (const message of ["Repository URL", "Version command", "Update command"]) {
              const value = await prompt(message);
              if (isPromptCancelled(value)) {
                updaterDeps.out("Add cancelled\n");
                return;
              }
              if (typeof value !== "string") {
                throw new ConfigError(configPath, "prompt did not return text");
              }
              values.push(value.trim());
            }
            const [repository, versionCommand, updateCommand] = values as [string, string, string];
            const addition = toolToml(bin, { repository, versionCommand, updateCommand });
            const candidate =
              config.status === "missing"
                ? addition
                : `${existingSource}${existingSource.endsWith("\n") ? "\n" : "\n\n"}${addition}`;
            try {
              parseTools(candidate, configPath);
              source = candidate;
            } catch (error) {
              if (error instanceof ConfigError) {
                updaterDeps.err(`${picocolors.bold(picocolors.red("[error]"))} ${error.message}\n`);
                continue;
              }
              throw error;
            }
          }

          await writeConfig(configPath, source, deps);
          updaterDeps.out(`Added tool ${bin}\n`);
          return;
        }
        if (options.edit !== undefined) {
          const bin = options.edit.trim();
          if (!bin) throw new ConfigError(configPath, "tool name must not be empty");
          const prompt = deps.prompt ?? ((message: string, initialValue?: string) => text({ message, initialValue }));
          const isPromptCancelled = deps.isCancelled ?? isCancel;
          const config = await loadToolsForAdd(configPath, deps.readFile);
          const current =
            config.status === "loaded" ? config.tools.find((tool) => tool.bin === bin) : undefined;
          if (!current) {
            throw new ConfigError(configPath, `tool "${bin}" does not exist`);
          }

          const existingSource = config.source;
          const initialValues: Record<string, string> = {
            "Repository URL": `https://github.com/${current.repo}`,
            "Version command": current.versionCmd,
            "Update command": current.updateCmd,
          };
          let source = "";
          while (!source) {
            const values: string[] = [];
            for (const message of ["Repository URL", "Version command", "Update command"]) {
              const value = await prompt(message, initialValues[message]);
              if (isPromptCancelled(value)) {
                updaterDeps.out("Edit cancelled\n");
                return;
              }
              if (typeof value !== "string") {
                throw new ConfigError(configPath, "prompt did not return text");
              }
              values.push(value.trim());
            }
            const [repository, versionCommand, updateCommand] = values as [string, string, string];
            const candidate = editToolToml(existingSource, bin, { repository, versionCommand, updateCommand }, configPath);
            try {
              parseTools(candidate, configPath);
            } catch (error) {
              if (error instanceof ConfigError) {
                updaterDeps.err(`${picocolors.bold(picocolors.red("[error]"))} ${error.message}\n`);
                continue;
              }
              throw error;
            }
            if (
              githubRepo(repository, configPath, bin) === current.repo &&
              versionCommand === current.versionCmd &&
              updateCommand === current.updateCmd
            ) {
              updaterDeps.out("No changes made\n");
              return;
            }
            source = candidate;
          }

          await writeConfig(configPath, source, deps);
          updaterDeps.out(`Edited tool ${bin}\n`);
          return;
        }
        if (options.delete !== undefined) {
          const bin = options.delete.trim();
          if (!bin) throw new ConfigError(configPath, "tool name must not be empty");
          const config = await loadToolsForAdd(configPath, deps.readFile);
          const current =
            config.status === "loaded" ? config.tools.find((tool) => tool.bin === bin) : undefined;
          if (!current) {
            throw new ConfigError(configPath, `tool "${bin}" does not exist`);
          }

          updaterDeps.out(
            `Tool: ${current.bin}\n` +
              `Repository: https://github.com/${current.repo}\n` +
              `Version command: ${current.versionCmd}\n` +
              `Update command: ${current.updateCmd}\n`,
          );

          const confirmation = deps.prompt
            ? await deps.prompt(`Delete tool ${current.bin}?`, false)
            : await confirm({ message: `Delete tool ${current.bin}?`, initialValue: false });
          const isPromptCancelled = deps.isCancelled ?? isCancel;
          if (isPromptCancelled(confirmation) || confirmation !== true) {
            updaterDeps.out("Delete cancelled\n");
            return;
          }

          const candidate = deleteToolToml(config.source, current.bin, configPath);
          if (/^\s*\[[ \t]*tools\.[^\]]+\]/m.test(candidate)) {
            parseTools(candidate, configPath);
          } else {
            try {
              Bun.TOML.parse(candidate);
            } catch (error) {
              const msg = error instanceof Error ? error.message : "invalid TOML";
              throw new ConfigError(configPath, `invalid TOML: ${msg}`);
            }
          }

          await writeConfig(configPath, candidate, deps);
          updaterDeps.out(`Deleted tool ${current.bin}\n`);
          return;
        }

        const config = await loadTools(configPath, deps.readFile);
        if (config.status === "missing") {
          updaterDeps.out(firstRunMessage(configPath));
          process.exitCode = 1;
          return;
        }
        if (options.list) {
          updaterDeps.out(
            `${config.tools
              .map(
                (tool) =>
                  `${picocolors.bold(tool.bin)}\n  Repository:      https://github.com/${tool.repo}\n  Version command: ${tool.versionCmd}\n  Update command:  ${tool.updateCmd}`,
              )
              .join("\n\n")}\n`,
          );
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
