#!/usr/bin/env bun
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

export const tools: Tool[] = [
  {
    bin: "opencode",
    repo: "anomalyco/opencode",
    versionCmd: "opencode --version",
    updateCmd: "opencode upgrade",
  },
  {
    bin: "omp",
    repo: "can1357/oh-my-pi",
    versionCmd: "omp --version",
    updateCmd: "omp update"
  },
  {
    bin: "droast",
    repo: "immanuwell/dockerfile-roast",
    versionCmd: "droast --version",
    updateCmd: "curl -fsL https://ewry.net/droast/install.sh | sh",
  },
  {
    bin: "vp",
    repo: "voidzero-dev/vite-plus",
    versionCmd: "vp --version",
    updateCmd: "vp upgrade",
  },
];

async function processTool(tool: Tool, deps: UpdaterDeps): Promise<boolean> {
  const parsed = v.safeParse(ToolSchema, tool);
  if (!parsed.success) {
    const reason = parsed.issues.map((i) => i.message).join("; ");
    const binLabel =
      typeof (tool as { bin?: unknown }).bin === "string"
        ? (tool as { bin: string }).bin
        : "<unknown>";
    deps.err(`${picocolors.red(`Invalid config for ${binLabel}: ${reason}`)}\n`);
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
    deps.err(`${picocolors.red(`Failed to get installed version for ${tool.repo}`)}\n`);
    return false;
  }

  let latest: string;
  try {
    latest = (await deps.getLatestTag(tool.repo)).replace(/^v/, "");
  } catch (e) {
    const status = (e as { status?: number } | null)?.status;
    deps.err(
      `${picocolors.red(
        status === 404
          ? `No GitHub release found for ${tool.repo}`
          : `Failed to get latest version for ${tool.repo}`,
      )}\n`,
    );
    return false;
  }
  if (!/^\d+\.\d+\.\d+$/.test(latest)) {
    deps.err(`${picocolors.red(`Failed to get latest version for ${tool.repo}`)}\n`);
    return false;
  }

  deps.out(`${picocolors.blue(`${tool.bin}:`)} installed=${current} latest=${latest}\n`);
  if (current === latest) {
    deps.out(`${picocolors.bold(picocolors.white("[no-op]"))} already up to date\n`);
    return true;
  }

  deps.out(`${picocolors.yellow("Updating")} ${tool.bin} from ${current} to ${latest}\n`);
  const updateResult = await deps.runShell(tool.updateCmd);
  if (updateResult.exitCode !== 0) {
    deps.err(`${picocolors.red(`Failed to update ${tool.repo}`)}\n`);
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

export function buildProgram(): Command {
  return new Command()
    .name("delta")
    .description("Keep curated CLI tools up to date against their latest GitHub releases")
    .version("0.0.1")
    .action(async () => {
      const octokit = new Octokit({ auth: process.env["GITHUB_TOKEN"] });
      const exitCode = await runUpdater(tools, {
        commandExists: (bin) => Bun.which(bin) !== null,
        runShell,
        getLatestTag: async (repo) => {
          const [owner, name] = repo.split("/") as [string, string];
          const { data } = await octokit.rest.repos.getLatestRelease({ owner, repo: name });
          return data.tag_name;
        },
        out: (s) => {
          process.stdout.write(s);
        },
        err: (s) => {
          process.stderr.write(s);
        },
      });
      process.exitCode = exitCode;
    });
}

if (import.meta.main) {
  await buildProgram().parseAsync(process.argv);
}
