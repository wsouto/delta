import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, describe } from "bun:test";
import {
  buildProgram,
  loadTools,
  parseTools,
  resolveConfigPath,
  runUpdater,
  runShell,
} from "./index.ts";

type UpdateDeps = {
  shell?: Record<string, { output: string; exitCode: number }>;
  tags?: Record<string, string>;
  tagThrows?: Record<string, number>;
};

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[a-zA-Z]`, "g");
const stripAnsi = (s: string) => s.replace(ANSI, "");

const tools = parseTools(
  `
[tools.opencode]
repository = "https://github.com/anomalyco/opencode"
version_command = "opencode --version"
update_command = "opencode upgrade"

[tools.omp]
repository = "https://github.com/can1357/oh-my-pi"
version_command = "omp --version"
update_command = "omp update"

[tools.droast]
repository = "https://github.com/immanuwell/dockerfile-roast"
version_command = "droast --version"
update_command = "curl -fsL https://ewry.net/droast/install.sh | sh"

[tools.vp]
repository = "https://github.com/voidzero-dev/vite-plus"
version_command = "vp --version"
update_command = "vp upgrade"
`,
  "/tmp/delta.toml",
);

function captureUpdater(overrides: UpdateDeps = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const events: string[] = [];
  const tagCalls: string[] = [];
  const shellCalls: string[] = [];
  const deps = {
    runShell: async (cmd: string) => {
      shellCalls.push(cmd);
      return overrides.shell?.[cmd] ?? { output: "", exitCode: 0 };
    },
    getLatestTag: async (repo: string) => {
      tagCalls.push(repo);
      const throwStatus = overrides.tagThrows?.[repo];
      if (throwStatus !== undefined) {
        const e = new Error(`${throwStatus} for ${repo}`) as Error & { status?: number };
        e.status = throwStatus;
        throw e;
      }
      const tag = overrides.tags?.[repo];
      if (tag === undefined) throw new Error(`no release for ${repo}`);
      return tag;
    },
    out: (s: string) => {
      const value = stripAnsi(s);
      out.push(value);
      events.push(`out:${value}`);
    },
    err: (s: string) => {
      const value = stripAnsi(s);
      err.push(value);
      events.push(`err:${value}`);
    },
  };
  return { deps, out, err, events, tagCalls, shellCalls };
}

describe("configuration format", () => {
  test("parses a named TOML tool into updater configuration", () => {
    const tools = parseTools(
      `
[tools.example]
repository = "https://github.com/owner/repository"
version_command = "example --version"
update_command = "example update"
`,
      "/tmp/delta.toml",
    );

    expect(tools).toEqual([
      {
        bin: "example",
        repo: "owner/repository",
        versionCmd: "example --version",
        updateCmd: "example update",
      },
    ]);
  });
});

describe("configuration path", () => {
  test("uses configured XDG config home", () => {
    expect(resolveConfigPath({ xdgConfigHome: "/tmp/config", homeDir: "/home/test" })).toBe(
      "/tmp/config/delta/tools.toml",
    );
  });

  test.each([undefined, ""])("falls back when XDG config home is %p", (xdgConfigHome) => {
    expect(resolveConfigPath({ xdgConfigHome, homeDir: "/home/test" })).toBe(
      "/home/test/.config/delta/tools.toml",
    );
  });
});

describe("configuration loading", () => {
  test("loads tools from TOML without touching user configuration", async () => {
    const result = await loadTools(
      "/tmp/delta/tools.toml",
      async () => `
[tools.example]
repository = "https://github.com/owner/repository"
version_command = "example --version"
update_command = "example update"
`,
    );

    expect(result).toEqual({
      status: "loaded",
      tools: [
        {
          bin: "example",
          repo: "owner/repository",
          versionCmd: "example --version",
          updateCmd: "example update",
        },
      ],
    });
  });
});

test("feeds loaded TOML tools into the CLI updater", async () => {
  const { deps, out } = captureUpdater({
    shell: { "example --version": { output: "1.2.3\n", exitCode: 0 } },
    tags: { "owner/repository": "1.2.3" },
  });

  await buildProgram({
    configPath: "/tmp/delta/tools.toml",
    readFile: async () => `
[tools.example]
repository = "https://github.com/owner/repository"
version_command = "example --version"
update_command = "example update"
`,
    updaterDeps: deps,
    writeLog: async () => {},
  }).parseAsync(["node", "delta"]);

  expect(out.join("")).toBe(
    "example: installed=1.2.3 latest=1.2.3\n[no-op] already up to date\n\nUpdate complete\n",
  );
});

describe("first run", () => {
  test("guides setup when configuration file is missing", async () => {
    const { deps, out, err } = captureUpdater();
    let wroteLog = false;
    const exitCode = process.exitCode;

    try {
      await buildProgram({
        configPath: "/tmp/config/delta/tools.toml",
        readFile: async () => {
          throw Object.assign(new Error("not found"), { code: "ENOENT" });
        },
        updaterDeps: deps,
        writeLog: async () => {
          wroteLog = true;
        },
      }).parseAsync(["node", "delta"]);

      const message = out.join("");
      expect(message).toContain("No tools have been configured yet.");
      expect(message).toContain("/tmp/config/delta/tools.toml");
      expect(message).toContain("[tools.example]");
      expect(message).toContain('repository = "https://github.com/owner/repository"');
      expect(message).toContain("After saving the file, run Delta again.");
      expect(err.join("")).toBe("");
      expect(wroteLog).toBeFalse();
    } finally {
      process.exitCode = exitCode ?? 0;
    }
  });

  test("reports invalid configuration as an error, not first-run setup", async () => {
    const { deps, out, err } = captureUpdater();
    const exitCode = process.exitCode;

    try {
      await buildProgram({
        configPath: "/tmp/config/delta/tools.toml",
        readFile: async () => "tools = =",
        updaterDeps: deps,
        writeLog: async () => {},
      }).parseAsync(["node", "delta"]);

      expect(err.join("")).toContain("[error] /tmp/config/delta/tools.toml: invalid TOML:");
      expect(out.join("")).toBe("");
    } finally {
      process.exitCode = exitCode ?? 0;
    }
  });
});

describe("configuration errors", () => {
  test("loads multiple named tools", () => {
    expect(
      parseTools(
        `
[tools.alpha]
repository = "https://github.com/owner/alpha"
version_command = "alpha --version"
update_command = "alpha update"

[tools.beta]
repository = "https://github.com/owner/beta"
version_command = "beta --version"
update_command = "beta update"
`,
        "/tmp/delta.toml",
      ),
    ).toHaveLength(2);
  });

  test("reports invalid TOML with its path", () => {
    expect(() => parseTools("tools = =", "/tmp/delta.toml")).toThrow(
      "/tmp/delta.toml: invalid TOML:",
    );
  });

  test("reports invalid top-level configuration", () => {
    expect(() => parseTools('tools = "invalid"', "/tmp/delta.toml")).toThrow(
      "/tmp/delta.toml: invalid configuration:",
    );
  });

  test("reports missing required fields", () => {
    expect(() =>
      parseTools(
        `
[tools.example]
repository = "https://github.com/owner/example"
version_command = "example --version"
`,
        "/tmp/delta.toml",
      ),
    ).toThrow("update_command");
  });

  test("rejects non-GitHub repository URLs", () => {
    expect(() =>
      parseTools(
        `
[tools.example]
repository = "https://example.com/owner/example"
version_command = "example --version"
update_command = "example update"
`,
        "/tmp/delta.toml",
      ),
    ).toThrow('tool "example" repository must be a GitHub repository URL');
  });

  test("keeps a missing file distinct from an unreadable file", async () => {
    const missing = await loadTools("/tmp/delta.toml", async () => {
      throw Object.assign(new Error("not found"), { code: "ENOENT" });
    });
    expect(missing).toEqual({ status: "missing" });

    await expect(
      loadTools("/tmp/delta.toml", async () => {
        throw new Error("permission denied");
      }),
    ).rejects.toThrow("/tmp/delta.toml: unable to read configuration: permission denied");
  });

  test("rejects unknown configuration fields", () => {
    expect(() =>
      parseTools(
        `
[tools.example]
repository = "https://github.com/owner/example"
version_command = "example --version"
update_command = "example update"
extra = true
`,
        "/tmp/delta.toml",
      ),
    ).toThrow("invalid configuration");
  });

  test("rejects repository URLs without a repository name", () => {
    expect(() =>
      parseTools(
        `
[tools.example]
repository = "https://github.com/owner/.git"
version_command = "example --version"
update_command = "example update"
`,
        "/tmp/delta.toml",
      ),
    ).toThrow('tool "example" repository must be a GitHub repository URL');
  });
});
describe("runUpdater", () => {
  test("uses the version command when the identifier differs from the executable", async () => {
    const { deps, out, shellCalls, tagCalls } = captureUpdater({
      shell: { "omp --version": { output: "omp 2.3.4\n", exitCode: 0 } },
      tags: { "can1357/oh-my-pi": "v2.3.4" },
    });

    const exitCode = await runUpdater(
      [
        {
          bin: "oh-my-pi",
          repo: "can1357/oh-my-pi",
          versionCmd: "omp --version",
          updateCmd: "omp update",
        },
      ],
      deps,
    );

    expect(exitCode).toBe(0);
    expect(out.join("")).toContain("oh-my-pi: installed=2.3.4 latest=2.3.4");
    expect(shellCalls).toEqual(["omp --version"]);
    expect(tagCalls).toEqual(["can1357/oh-my-pi"]);
  });

  test("reports a failed version command and continues with later tools", async () => {
    const { deps, err, out, shellCalls } = captureUpdater({
      shell: {
        "missing --version": { output: "bash: missing: command not found\n", exitCode: 127 },
        "omp --version": { output: "2.3.4\n", exitCode: 0 },
      },
      tags: { "can1357/oh-my-pi": "2.3.4" },
    });

    const exitCode = await runUpdater(
      [
        {
          bin: "missing-tool",
          repo: "owner/missing-tool",
          versionCmd: "missing --version",
          updateCmd: "missing update",
        },
        {
          bin: "oh-my-pi",
          repo: "can1357/oh-my-pi",
          versionCmd: "omp --version",
          updateCmd: "omp update",
        },
      ],
      deps,
    );

    expect(exitCode).toBe(1);
    expect(out.join("")).toContain("missing-tool: installed=unknown latest=unknown\n");
    expect(err.join("")).toContain(
      "[error] Failed to get installed version for owner/missing-tool",
    );
    expect(err.join("")).toContain("command not found");
    expect(out.join("")).toContain("oh-my-pi: installed=2.3.4 latest=2.3.4");
    expect(shellCalls).toEqual(["missing --version", "omp --version"]);
  });

  test("current tools report parsed versions without updating", async () => {
    const { deps, out, tagCalls, shellCalls } = captureUpdater({
      shell: {
        "opencode --version": { output: "opencode 1.2.3 build 9.9.9\n", exitCode: 0 },
        "omp --version": { output: "2.3.4\n", exitCode: 0 },
        "droast --version": { output: "droast 3.4.5\n", exitCode: 0 },
        "vp --version": { output: "vp 4.5.6\n", exitCode: 0 },
      },
      tags: {
        "anomalyco/opencode": "1.2.3",
        "can1357/oh-my-pi": "v2.3.4",
        "immanuwell/dockerfile-roast": "3.4.5",
        "voidzero-dev/vite-plus": "v4.5.6",
      },
    });

    const exitCode = await runUpdater(tools, deps);

    expect(exitCode).toBe(0);
    expect(out.join("")).toBe(
      "opencode: installed=1.2.3 latest=1.2.3\n[no-op] already up to date\n\n" +
        "omp: installed=2.3.4 latest=2.3.4\n[no-op] already up to date\n\n" +
        "droast: installed=3.4.5 latest=3.4.5\n[no-op] already up to date\n\n" +
        "vp: installed=4.5.6 latest=4.5.6\n[no-op] already up to date\n\n" +
        "Update complete\n",
    );
    expect(shellCalls).toEqual([
      "opencode --version",
      "omp --version",
      "droast --version",
      "vp --version",
    ]);
    expect(tagCalls).toEqual([
      "anomalyco/opencode",
      "can1357/oh-my-pi",
      "immanuwell/dockerfile-roast",
      "voidzero-dev/vite-plus",
    ]);
  });

  test("outdated tools run configured updates with TIRITH disabled", async () => {
    const { deps, out, shellCalls } = captureUpdater({
      shell: {
        "opencode --version": { output: "1.0.0\n", exitCode: 0 },
        "omp --version": { output: "2.0.0\n", exitCode: 0 },
        "droast --version": { output: "3.0.0\n", exitCode: 0 },
        "vp --version": { output: "4.0.0\n", exitCode: 0 },
      },
      tags: {
        "anomalyco/opencode": "1.1.0",
        "can1357/oh-my-pi": "2.1.0",
        "immanuwell/dockerfile-roast": "3.1.0",
        "voidzero-dev/vite-plus": "4.1.0",
      },
    });

    const exitCode = await runUpdater(tools, deps);

    expect(exitCode).toBe(0);
    const text = out.join("");
    expect(text).toContain("[updated] opencode from 1.0.0 to 1.1.0");
    expect(text).toContain("[updated] omp from 2.0.0 to 2.1.0");
    expect(text).toContain("[updated] droast from 3.0.0 to 3.1.0");
    expect(text).toContain("[updated] vp from 4.0.0 to 4.1.0");
    expect(shellCalls).toEqual([
      "opencode --version",
      "opencode upgrade",
      "omp --version",
      "omp update",
      "droast --version",
      "curl -fsL https://ewry.net/droast/install.sh | sh",
      "vp --version",
      "vp upgrade",
    ]);
    expect(process.env["TIRITH"]).toBe("0");
  });

  test("tool failures do not stop later checks and produce aggregate failure", async () => {
    const { deps, err, out, shellCalls } = captureUpdater({
      shell: {
        "opencode --version": { output: "1.2.3\n", exitCode: 0 },
        "opencode upgrade": { output: "", exitCode: 7 },
        "omp --version": { output: "no-version\n", exitCode: 0 },
        "droast --version": { output: "2.0.0\n", exitCode: 0 },
        "vp --version": { output: "no-version\n", exitCode: 0 },
      },
      tags: {
        "anomalyco/opencode": "2.0.0",
        "immanuwell/dockerfile-roast": "bad-tag",
      },
    });

    const exitCode = await runUpdater(tools, deps);

    expect(exitCode).toBe(1);
    const text = err.join("");
    expect(out.join("")).toContain("opencode: installed=1.2.3 latest=2.0.0\n");
    expect(text).toContain("[error] Failed to update anomalyco/opencode");
    expect(out.join("")).not.toContain("[updated] opencode from 1.2.3 to 2.0.0");
    expect(out.join("")).toContain("omp: installed=unknown latest=unknown\n");
    expect(text).toContain("[error] Failed to get installed version for can1357/oh-my-pi");
    expect(out.join("")).toContain("droast: installed=2.0.0 latest=unknown\n");
    expect(text).toContain("[error] Failed to get latest version for immanuwell/dockerfile-roast");
    expect(out.join("")).toContain("vp: installed=unknown latest=unknown\n");
    expect(text).toContain("[error] Failed to get installed version for voidzero-dev/vite-plus");
    expect(text).toContain("Update completed with errors");
    expect(shellCalls).toEqual([
      "opencode --version",
      "opencode upgrade",
      "omp --version",
      "droast --version",
      "vp --version",
    ]);
  });

  test("release lookup failure is reported and later tools still run", async () => {
    const { deps, err, out, shellCalls } = captureUpdater({
      shell: {
        "opencode --version": { output: "1.2.3\n", exitCode: 0 },
        "omp --version": { output: "2.3.4\n", exitCode: 0 },
        "droast --version": { output: "3.4.5\n", exitCode: 0 },
        "vp --version": { output: "4.5.6\n", exitCode: 0 },
      },
      tags: {
        "can1357/oh-my-pi": "2.3.4",
        "immanuwell/dockerfile-roast": "3.4.5",
        "voidzero-dev/vite-plus": "4.5.6",
      },
    });

    const exitCode = await runUpdater(tools, deps);

    expect(exitCode).toBe(1);
    expect(out.join("")).toContain("opencode: installed=1.2.3 latest=unknown\n");
    expect(err.join("")).toContain("[error] Failed to get latest version for anomalyco/opencode");
    expect(shellCalls).toEqual([
      "opencode --version",
      "omp --version",
      "droast --version",
      "vp --version",
    ]);
  });

  test("invalid tool configuration is reported per-tool and loop continues", async () => {
    const { deps, err, out, shellCalls, tagCalls } = captureUpdater({
      shell: { "opencode --version": { output: "1.2.3\n", exitCode: 0 } },
      tags: { "anomalyco/opencode": "1.2.3" },
    });
    const mixedTools = [
      {
        bin: "",
        repo: "anomalyco/opencode",
        versionCmd: "opencode --version",
        updateCmd: "opencode upgrade",
      },
      { bin: "droast", repo: "not-a-repo", versionCmd: "droast --version", updateCmd: "true" },
      {
        bin: "opencode",
        repo: "anomalyco/opencode",
        versionCmd: "opencode --version",
        updateCmd: "opencode upgrade",
      },
    ];

    const exitCode = await runUpdater(mixedTools, deps);

    expect(exitCode).toBe(1);
    const text = err.join("");
    expect(text).toContain("Invalid config");
    expect(text).toContain("not-a-repo");
    expect(text).toContain("Update completed with errors");
    expect(shellCalls).toEqual(["opencode --version"]);
    expect(tagCalls).toEqual(["anomalyco/opencode"]);
    expect(out.join("")).toContain("opencode: installed=1.2.3 latest=1.2.3");
  });

  test("release lookup returning 404 is reported as 'no GitHub release found'", async () => {
    const { deps, err, events, out, tagCalls } = captureUpdater({
      shell: { "opencode --version": { output: "1.0.0\n", exitCode: 0 } },
      tagThrows: { "anomalyco/opencode": 404 },
    });
    const oneTool = [
      {
        bin: "opencode",
        repo: "anomalyco/opencode",
        versionCmd: "opencode --version",
        updateCmd: "opencode upgrade",
      },
    ];

    const exitCode = await runUpdater(oneTool, deps);

    expect(exitCode).toBe(1);
    expect(out.join("")).toBe("opencode: installed=1.0.0 latest=unknown\n\n");
    expect(err.join("")).toContain("[error] No GitHub release found for anomalyco/opencode");
    expect(events.slice(0, 2)).toEqual([
      "out:opencode: installed=1.0.0 latest=unknown\n",
      "err:[error] No GitHub release found for anomalyco/opencode\n",
    ]);
    expect(tagCalls).toEqual(["anomalyco/opencode"]);
  });
});

describe("runShell", () => {
  test("pipeline failure is not hidden by a successful last command", async () => {
    const { exitCode } = await runShell("exit 22 | cat");
    expect(exitCode).toBe(22);
  });
});

type Capture = { stdout: string; stderr: string; error: unknown };

function captureRun(argv: string[]): Capture {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let error: unknown;
  try {
    buildProgram()
      .exitOverride()
      .configureOutput({
        writeOut: (s) => {
          stdout.push(s);
        },
        writeErr: (s) => {
          stderr.push(s);
        },
      })
      .parse(["node", "delta", ...argv]);
  } catch (e) {
    error = e;
  }
  return { stdout: stdout.join(""), stderr: stderr.join(""), error };
}

describe("delta CLI", () => {
  test("--help prints description and usage", () => {
    const { stdout, error } = captureRun(["--help"]);
    expect(error).toBeDefined();
    expect(stdout).toContain("GitHub releases");
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("-c, --config <path>");
    expect(stdout).toContain("--print-config-path");
  });

  test("--help documents add option", () => {
    const { stdout } = captureRun(["--help"]);
    expect(stdout).toContain("-a, --add <tool>");
  });

  test("--help describes --config as writable", () => {
    const { stdout } = captureRun(["--help"]);
    expect(stdout).toContain("read/write tool configuration");
  });

  test("--list prints configured tools without updater side effects", async () => {
    const { deps, err, out, shellCalls, tagCalls } = captureUpdater();
    const readPaths: string[] = [];

    await buildProgram({
      readFile: async (path) => {
        readPaths.push(path);
        return `
[tools.opencode]
repository = "https://github.com/anomalyco/opencode"
version_command = "opencode --version"
update_command = "opencode upgrade"

[tools.delta]
repository = "https://github.com/wsouto/delta"
version_command = "delta --version"
update_command = "curl -fsSL https://example.test/install.sh | sh"
`;
      },
      updaterDeps: deps,
    }).parseAsync(["node", "delta", "--config", "/tmp/custom-delta.toml", "--list"]);

    expect(readPaths).toEqual(["/tmp/custom-delta.toml"]);
    expect(out.join("")).toBe(
      "opencode\n" +
        "  Repository:      https://github.com/anomalyco/opencode\n" +
        "  Version command: opencode --version\n" +
        "  Update command:  opencode upgrade\n\n" +
        "delta\n" +
        "  Repository:      https://github.com/wsouto/delta\n" +
        "  Version command: delta --version\n" +
        "  Update command:  curl -fsSL https://example.test/install.sh | sh\n",
    );
    expect(err.join("")).toBe("");
    expect(shellCalls).toEqual([]);
    expect(tagCalls).toEqual([]);
  });
  test("normal runs overwrite a sibling diagnostic log", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "delta-run-log-"));
    const configPath = join(tempDir, "tools.toml");
    const source = `
[tools.opencode]
repository = "https://github.com/anomalyco/opencode"
version_command = "opencode --version"
update_command = "opencode upgrade"
`;
    const run = (version: string) => {
      const { deps } = captureUpdater({
        shell: { "opencode --version": { output: `${version}\n`, exitCode: 0 } },
        tags: { "anomalyco/opencode": version },
      });
      return buildProgram({
        configPath,
        readFile: async () => source,
        updaterDeps: deps,
      }).parseAsync(["node", "delta"]);
    };

    try {
      await run("1.2.3");
      await run("2.0.0");

      const log = await Bun.file(join(tempDir, "delta.log")).text();
      expect(log).toContain("tool=opencode repository=anomalyco/opencode");
      expect(log).toContain("opencode: installed=2.0.0 latest=2.0.0");
      expect(log).not.toContain("installed=1.2.3");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
  test("updated runs log results without successful command output", async () => {
    const { deps, out } = captureUpdater({
      shell: {
        "opencode --version": { output: "1.0.0\n", exitCode: 0 },
        "opencode upgrade": { output: "noisy successful output\n", exitCode: 0 },
      },
      tags: { "anomalyco/opencode": "2.0.0" },
    });
    let log = "";

    await buildProgram({
      configPath: "/tmp/delta/tools.toml",
      readFile: async () => `
[tools.opencode]
repository = "https://github.com/anomalyco/opencode"
version_command = "opencode --version"
update_command = "opencode upgrade"
`,
      updaterDeps: deps,
      writeLog: async (_path, content) => {
        log = content;
      },
    }).parseAsync(["node", "delta"]);

    expect(out.join("")).toContain("[updated] opencode from 1.0.0 to 2.0.0");
    expect(log).toContain("opencode: installed=1.0.0 latest=2.0.0");
    expect(log).toContain('tool=opencode phase=update command="opencode upgrade" exit_code=0');
    expect(log).toContain("[updated] opencode from 1.0.0 to 2.0.0");
    expect(log).not.toContain("noisy successful output");
  });

  test("diagnostic logs retain shell and release failure details", async () => {
    const { deps, err } = captureUpdater({
      shell: {
        "missing --version": { output: "version failed\n", exitCode: 127 },
        "opencode --version": { output: "1.0.0\n", exitCode: 0 },
        "bun --version": { output: "1.4.0\n", exitCode: 0 },
        "vp --version": { output: "3.0.0\n", exitCode: 0 },
        "vp upgrade": { output: "upgrade failed\n", exitCode: 7 },
      },
      tags: {
        "oven-sh/bun": "bun-v1.4.0",
        "voidzero-dev/vite-plus": "3.1.0",
      },
      tagThrows: { "anomalyco/opencode": 503 },
    });
    const configPath = "/tmp/delta/tools.toml";
    const source = `
[tools.missing]
repository = "https://github.com/owner/missing"
version_command = "missing --version"
update_command = "missing update"

[tools.opencode]
repository = "https://github.com/anomalyco/opencode"
version_command = "opencode --version"
update_command = "opencode upgrade"

[tools.bun]
repository = "https://github.com/oven-sh/bun"
version_command = "bun --version"
update_command = "bun update"

[tools.vp]
repository = "https://github.com/voidzero-dev/vite-plus"
version_command = "vp --version"
update_command = "vp upgrade"
`;
    let log = "";
    const exitCode = process.exitCode;

    try {
      await buildProgram({
        configPath,
        readFile: async () => source,
        updaterDeps: deps,
        writeLog: async (_path, content) => {
          log = content;
        },
      }).parseAsync(["node", "delta"]);

      expect(process.exitCode).toBe(1);
      expect(err.join("")).toContain("Update completed with errors");
      expect(err.join("")).toContain("Failed to get installed version");
      expect(log).toContain('tool=missing phase=version command="missing --version" exit_code=127');
      expect(log).toContain('output="version failed\\n"');
      expect(log).toContain("tool=opencode phase=latest status=503 message=");
      expect(log).toContain("503 for anomalyco/opencode");
      expect(log).toContain(
        'detail tool=bun phase=latest result=invalid-tag returned_tag="bun-v1.4.0" expected="X.Y.Z or vX.Y.Z"',
      );
      expect(log).toContain('tool=bun phase=latest raw_tag="bun-v1.4.0"');
      expect(log).toContain('tool=vp phase=update command="vp upgrade" exit_code=7');
      expect(log).toContain('output="upgrade failed\\n"');
    } finally {
      process.exitCode = exitCode ?? 0;
    }
  });

  test("diagnostic log write failures preserve updater output and status", async () => {
    const { deps, out, err } = captureUpdater({
      shell: { "opencode --version": { output: "1.2.3\n", exitCode: 0 } },
      tags: { "anomalyco/opencode": "1.2.3" },
    });
    const exitCode = process.exitCode;

    try {
      await buildProgram({
        configPath: "/tmp/delta/tools.toml",
        readFile: async () => `
[tools.opencode]
repository = "https://github.com/anomalyco/opencode"
version_command = "opencode --version"
update_command = "opencode upgrade"
`,
        updaterDeps: deps,
        writeLog: async () => {
          throw new Error("read-only");
        },
      }).parseAsync(["node", "delta"]);

      expect(process.exitCode).toBe(0);
      expect(out.join("")).toContain("Update complete");
      expect(err.join("")).toContain("[warning] Failed to write diagnostic log");
      expect(err.join("")).toContain("read-only");
    } finally {
      process.exitCode = exitCode ?? 0;
    }
  });
  test("normal config failures still replace the diagnostic log", async () => {
    let log = "";
    const exitCode = process.exitCode;

    try {
      await buildProgram({
        configPath: "/tmp/delta/tools.toml",
        readFile: async () => {
          throw new Error("corrupt file");
        },
        updaterDeps: captureUpdater().deps,
        writeLog: async (_path, content) => {
          log = content;
        },
      }).parseAsync(["node", "delta"]);

      expect(process.exitCode).toBe(1);
      expect(log).toContain("run_started=");
      expect(log).toContain(
        "err [error] /tmp/delta/tools.toml: unable to read configuration: corrupt file",
      );
      expect(log).toContain("run_finished=");
    } finally {
      process.exitCode = exitCode ?? 0;
    }
  });

  test("--list is documented and rejects incompatible modes", async () => {
    expect(captureRun(["--help"]).stdout).toContain("--list");

    for (const args of [
      ["--list", "--add", "example"],
      ["--list", "--edit", "example"],
      ["--list", "--delete", "example"],
      ["--list", "--print-config-path"],
    ]) {
      const { deps, err, out } = captureUpdater();
      const exitCode = process.exitCode;

      try {
        await buildProgram({
          configPath: "/tmp/delta/tools.toml",
          readFile: async () => {
            throw new Error("must not read");
          },
          updaterDeps: deps,
        }).parseAsync(["node", "delta", ...args]);

        expect(err.join("")).toContain("cannot be used together");
        expect(out.join("")).toBe("");
      } finally {
        process.exitCode = exitCode ?? 0;
      }
    }
  });

  test("adds prompted tool to missing configuration", async () => {
    const { deps, out, err } = captureUpdater();
    const answers = ["https://github.com/owner/example", "example --version", "example update"];
    const writes: Array<[string, string]> = [];
    const renames: Array<[string, string]> = [];

    await buildProgram({
      configPath: "/tmp/delta/tools.toml",
      readFile: async () => {
        throw Object.assign(new Error("not found"), { code: "ENOENT" });
      },
      updaterDeps: deps,
      prompt: async () => answers.shift()!,
      makeDir: async () => {},
      writeFile: async (path, content) => {
        writes.push([path, content]);
      },
      renameFile: async (from, to) => {
        renames.push([from, to]);
      },
    }).parseAsync(["node", "delta", "--add", "example"]);

    expect(writes).toHaveLength(1);
    expect(writes[0]?.[1]).toContain("[tools.example]");
    expect(writes[0]?.[1]).toContain('repository = "https://github.com/owner/example"');
    expect(renames).toHaveLength(1);
    expect(out.join("")).toContain("Added tool example");
    expect(err.join("")).toBe("");
  });

  test("adds prompted tool to empty configuration", async () => {
    const { deps, err } = captureUpdater();
    let written = "";

    await buildProgram({
      configPath: "/tmp/delta/tools.toml",
      readFile: async () => "# Configure tools below\n",
      updaterDeps: deps,
      prompt: async (message) =>
        ({
          "Repository URL": "https://github.com/owner/example",
          "Version command": "example --version",
          "Update command": "example update",
        })[message]!,
      makeDir: async () => {},
      writeFile: async (_path, content) => {
        written = content;
      },
      renameFile: async () => {},
    }).parseAsync(["node", "delta", "--add", "example"]);

    expect(written).toContain("# Configure tools below");
    expect(written).toContain("[tools.example]");
    expect(err.join("")).toBe("");
  });

  test("cancelling add leaves configuration unchanged", async () => {
    const { deps, out, err } = captureUpdater();
    const cancelled = Symbol("cancelled");
    let wrote = false;

    await buildProgram({
      configPath: "/tmp/delta/tools.toml",
      readFile: async () => {
        throw Object.assign(new Error("not found"), { code: "ENOENT" });
      },
      updaterDeps: deps,
      prompt: async () => cancelled,
      isCancelled: (value) => value === cancelled,
      makeDir: async () => {},
      writeFile: async () => {
        wrote = true;
      },
      renameFile: async () => {
        wrote = true;
      },
    }).parseAsync(["node", "delta", "--add", "example"]);

    expect(wrote).toBeFalse();
    expect(out.join("")).toBe("Add cancelled\n");
    expect(err.join("")).toBe("");
  });

  test("rejects duplicate tool without prompting or writing", async () => {
    const { deps, err } = captureUpdater();
    const exitCode = process.exitCode;
    let prompted = false;
    let wrote = false;

    try {
      await buildProgram({
        configPath: "/tmp/delta/tools.toml",
        readFile: async () => `
[tools.example]
repository = "https://github.com/owner/example"
version_command = "example --version"
update_command = "example update"
`,
        updaterDeps: deps,
        prompt: async () => {
          prompted = true;
          return "unused";
        },
        writeFile: async () => {
          wrote = true;
        },
      }).parseAsync(["node", "delta", "--add", "example"]);

      expect(prompted).toBeFalse();
      expect(wrote).toBeFalse();
      expect(err.join("")).toContain('tool "example" already exists');
    } finally {
      process.exitCode = exitCode ?? 0;
    }
  });

  test("re-prompts after invalid values before writing", async () => {
    const { deps, err } = captureUpdater();
    const answers = [
      " ",
      " ",
      " ",
      "https://github.com/owner/example",
      "example --version",
      "example update",
    ];
    let wrote = false;

    await buildProgram({
      configPath: "/tmp/delta/tools.toml",
      readFile: async () => {
        throw Object.assign(new Error("not found"), { code: "ENOENT" });
      },
      updaterDeps: deps,
      prompt: async () => answers.shift()!,
      writeFile: async () => {
        wrote = true;
      },
      renameFile: async () => {},
      makeDir: async () => {},
    }).parseAsync(["node", "delta", "--add", "example"]);

    expect(wrote).toBeTrue();
    expect(err.join("")).toContain("invalid configuration");
  });

  test("rejects empty tools table plus extra top-level keys without prompting", async () => {
    const { deps, err, out } = captureUpdater();
    const exitCode = process.exitCode;
    let prompted = false;

    try {
      await buildProgram({
        configPath: "/tmp/delta/tools.toml",
        readFile: async () => "[tools]\n\n[other]\nvalue = 1\n",
        updaterDeps: deps,
        prompt: async () => {
          prompted = true;
          return "unused";
        },
      }).parseAsync(["node", "delta", "--add", "example"]);

      expect(prompted).toBeFalse();
      expect(err.join("")).toContain("invalid configuration");
      expect(out.join("")).toBe("");
    } finally {
      process.exitCode = exitCode ?? 0;
    }
  });

  test("does not replace configuration when temporary write fails", async () => {
    const { deps, err } = captureUpdater();
    const exitCode = process.exitCode;
    let renamed = false;

    try {
      await buildProgram({
        configPath: "/tmp/delta/tools.toml",
        readFile: async () => {
          throw Object.assign(new Error("not found"), { code: "ENOENT" });
        },
        updaterDeps: deps,
        prompt: async (message) =>
          ({
            "Repository URL": "https://github.com/owner/example",
            "Version command": "example --version",
            "Update command": "example update",
          })[message]!,
        makeDir: async () => {},
        writeFile: async () => {
          throw new Error("disk full");
        },
        renameFile: async () => {
          renamed = true;
        },
      }).parseAsync(["node", "delta", "--add", "example"]);

      expect(renamed).toBeFalse();
      expect(err.join("")).toContain("disk full");
    } finally {
      process.exitCode = exitCode ?? 0;
    }
  });

  test("removes temporary configuration when rename fails", async () => {
    const { deps, err } = captureUpdater();
    const exitCode = process.exitCode;
    const removed: string[] = [];

    try {
      await buildProgram({
        configPath: "/tmp/delta/tools.toml",
        readFile: async () => {
          throw Object.assign(new Error("not found"), { code: "ENOENT" });
        },
        updaterDeps: deps,
        prompt: async (message) =>
          ({
            "Repository URL": "https://github.com/owner/example",
            "Version command": "example --version",
            "Update command": "example update",
          })[message]!,
        makeDir: async () => {},
        writeFile: async () => {},
        renameFile: async () => {
          throw new Error("rename failed");
        },
        removeFile: async (path) => {
          removed.push(path);
        },
      }).parseAsync(["node", "delta", "--add", "example"]);

      expect(removed).toHaveLength(1);
      expect(err.join("")).toContain("rename failed");
    } finally {
      process.exitCode = exitCode ?? 0;
    }
  });

  test("preserves existing tool definition when adding another", async () => {
    const { deps } = captureUpdater();
    const existing = `[tools.old]
repository = "https://github.com/owner/old"
version_command = "old --version"
update_command = "old update"
`;
    let written = "";

    await buildProgram({
      configPath: "/tmp/delta/tools.toml",
      readFile: async () => existing,
      updaterDeps: deps,
      prompt: async (message) =>
        ({
          "Repository URL": "https://github.com/owner/new",
          "Version command": "new --version",
          "Update command": "new update",
        })[message]!,
      makeDir: async () => {},
      writeFile: async (_path, content) => {
        written = content;
      },
      renameFile: async () => {},
    }).parseAsync(["node", "delta", "--add", "new"]);

    expect(written).toContain(existing);
    expect(written).toContain("[tools.new]");
  });

  test("--add requires a tool argument", () => {
    const { error } = captureRun(["--add"]);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/argument missing/i);
  });

  test("--add rejects an empty tool name", async () => {
    const { deps, err, out } = captureUpdater();
    const exitCode = process.exitCode;

    try {
      await buildProgram({
        configPath: "/tmp/delta/tools.toml",
        readFile: async () => {
          throw new Error("must not read");
        },
        updaterDeps: deps,
      }).parseAsync(["node", "delta", "--add", ""]);

      expect(err.join("")).toContain("tool name must not be empty");
      expect(out.join("")).toBe("");
    } finally {
      process.exitCode = exitCode ?? 0;
    }
  });

  test("--add conflicts with --print-config-path", async () => {
    const { deps, err, out } = captureUpdater();
    const exitCode = process.exitCode;

    try {
      await buildProgram({
        configPath: "/tmp/delta/tools.toml",
        readFile: async () => {
          throw new Error("must not read");
        },
        updaterDeps: deps,
      }).parseAsync(["node", "delta", "--add", "example", "--print-config-path"]);

      expect(err.join("")).toContain("cannot be used together");
      expect(out.join("")).toBe("");
    } finally {
      process.exitCode = exitCode ?? 0;
    }
  });

  test("--add honors --config", async () => {
    const { deps } = captureUpdater();
    let renamedTo = "";

    await buildProgram({
      configPath: "/ignored/delta.toml",
      readFile: async (path) => {
        expect(path).toBe("/tmp/custom-delta.toml");
        throw Object.assign(new Error("not found"), { code: "ENOENT" });
      },
      updaterDeps: deps,
      prompt: async (message) =>
        ({
          "Repository URL": "https://github.com/owner/example",
          "Version command": "example --version",
          "Update command": "example update",
        })[message]!,
      makeDir: async () => {},
      writeFile: async () => {},
      renameFile: async (_from, to) => {
        renamedTo = to;
      },
    }).parseAsync(["node", "delta", "--config", "/tmp/custom-delta.toml", "--add", "example"]);

    expect(renamedTo).toBe("/tmp/custom-delta.toml");
  });

  test("--add uses resolved XDG path by default", async () => {
    const { deps } = captureUpdater();
    const previous = process.env["XDG_CONFIG_HOME"];
    process.env["XDG_CONFIG_HOME"] = "/tmp/delta-xdg";
    let renamedTo = "";
    try {
      await buildProgram({
        readFile: async (path) => {
          expect(path).toBe("/tmp/delta-xdg/delta/tools.toml");
          throw Object.assign(new Error("not found"), { code: "ENOENT" });
        },
        updaterDeps: deps,
        prompt: async (message) =>
          ({
            "Repository URL": "https://github.com/owner/example",
            "Version command": "example --version",
            "Update command": "example update",
          })[message]!,
        makeDir: async () => {},
        writeFile: async () => {},
        renameFile: async (_from, to) => {
          renamedTo = to;
        },
      }).parseAsync(["node", "delta", "--add", "example"]);
    } finally {
      if (previous === undefined) {
        delete process.env["XDG_CONFIG_HOME"];
      } else {
        process.env["XDG_CONFIG_HOME"] = previous;
      }
    }

    expect(renamedTo).toBe("/tmp/delta-xdg/delta/tools.toml");
  });

  test("--config overrides default configuration path", async () => {
    const { deps, out } = captureUpdater({
      shell: { "example --version": { output: "1.2.3\n", exitCode: 0 } },
      tags: { "owner/repository": "1.2.3" },
    });
    const exitCode = process.exitCode;

    try {
      await buildProgram({
        configPath: "/ignored/delta.toml",
        readFile: async (path) => {
          expect(path).toBe("/tmp/custom-delta.toml");
          return `
[tools.example]
repository = "https://github.com/owner/repository"
version_command = "example --version"
update_command = "example update"
`;
        },
        updaterDeps: deps,
      }).parseAsync(["node", "delta", "--config", "/tmp/custom-delta.toml"]);

      expect(out.join("")).toBe(
        "example: installed=1.2.3 latest=1.2.3\n[no-op] already up to date\n\nUpdate complete\n",
      );
    } finally {
      process.exitCode = exitCode ?? 0;
    }
  });

  test("--print-config-path exits before loading configuration", async () => {
    const { deps, out } = captureUpdater();

    await buildProgram({
      configPath: "/tmp/delta/tools.toml",
      readFile: async () => {
        throw new Error("must not read");
      },
      updaterDeps: deps,
    }).parseAsync(["node", "delta", "--print-config-path"]);

    expect(out.join("")).toBe("/tmp/delta/tools.toml\n");
  });

  test("--help documents edit option", () => {
    const { stdout } = captureRun(["--help"]);
    expect(stdout).toContain("-e, --edit <tool>");
  });

  test("--edit requires a tool argument", () => {
    const { error } = captureRun(["--edit"]);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/argument missing/i);
  });

  test("--edit conflicts with --print-config-path", async () => {
    const { deps, err, out } = captureUpdater();
    const exitCode = process.exitCode;

    try {
      await buildProgram({
        configPath: "/tmp/delta/tools.toml",
        readFile: async () => {
          throw new Error("must not read");
        },
        updaterDeps: deps,
      }).parseAsync(["node", "delta", "--edit", "example", "--print-config-path"]);

      expect(err.join("")).toContain("cannot be used together");
      expect(out.join("")).toBe("");
    } finally {
      process.exitCode = exitCode ?? 0;
    }
  });

  test("--edit conflicts with --add", async () => {
    const { deps, err, out } = captureUpdater();
    const exitCode = process.exitCode;

    try {
      await buildProgram({
        configPath: "/tmp/delta/tools.toml",
        readFile: async () => {
          throw new Error("must not read");
        },
        updaterDeps: deps,
      }).parseAsync(["node", "delta", "--add", "example", "--edit", "example"]);

      expect(err.join("")).toContain("cannot be used together");
      expect(out.join("")).toBe("");
    } finally {
      process.exitCode = exitCode ?? 0;
    }
  });

  test("--edit rejects an empty tool name", async () => {
    const { deps, err, out } = captureUpdater();
    const exitCode = process.exitCode;

    try {
      await buildProgram({
        configPath: "/tmp/delta/tools.toml",
        readFile: async () => {
          throw new Error("must not read");
        },
        updaterDeps: deps,
      }).parseAsync(["node", "delta", "--edit", ""]);

      expect(err.join("")).toContain("tool name must not be empty");
      expect(out.join("")).toBe("");
    } finally {
      process.exitCode = exitCode ?? 0;
    }
  });

  test("edit prompts are pre-filled with current values", async () => {
    const { deps, err } = captureUpdater();
    const seen: Array<[string, string | boolean | undefined]> = [];
    const existing = `[tools.example]
repository = "https://github.com/owner/example"
version_command = "example --version"
update_command = "example update"
# keep this comment
`;

    await buildProgram({
      configPath: "/tmp/delta/tools.toml",
      readFile: async () => existing,
      updaterDeps: deps,
      prompt: async (message, initialValue) => {
        seen.push([message, initialValue]);
        return {
          "Repository URL": "https://github.com/owner/example",
          "Version command": "example --version",
          "Update command": "example update 2",
        }[message]!;
      },
      makeDir: async () => {},
      writeFile: async () => {},
      renameFile: async () => {},
    }).parseAsync(["node", "delta", "--edit", "example"]);

    expect(seen).toEqual([
      ["Repository URL", "https://github.com/owner/example"],
      ["Version command", "example --version"],
      ["Update command", "example update"],
    ]);
    expect(err.join("")).toBe("");
  });

  test("edit trims submitted values before persisting", async () => {
    const { deps } = captureUpdater();
    let written = "";
    const existing = `[tools.example]
repository = "https://github.com/owner/example"
version_command = "example --version"
update_command = "example update"
`;

    await buildProgram({
      configPath: "/tmp/delta/tools.toml",
      readFile: async () => existing,
      updaterDeps: deps,
      prompt: async (message) =>
        ({
          "Repository URL": "  https://github.com/owner/example  ",
          "Version command": "  example --version 2  ",
          "Update command": "  example update 2  ",
        })[message]!,
      makeDir: async () => {},
      writeFile: async (_path, content) => {
        written = content;
      },
      renameFile: async () => {},
    }).parseAsync(["node", "delta", "--edit", "example"]);

    expect(written).toContain('version_command = "example --version 2"');
    expect(written).toContain('update_command = "example update 2"');
    expect(written).toContain('repository = "https://github.com/owner/example"');
  });

  test("editing a missing tool reports an error without prompting or writing", async () => {
    const { deps, err } = captureUpdater();
    const exitCode = process.exitCode;
    let prompted = false;
    let wrote = false;

    try {
      await buildProgram({
        configPath: "/tmp/delta/tools.toml",
        readFile: async () => `
[tools.example]
repository = "https://github.com/owner/example"
version_command = "example --version"
update_command = "example update"
`,
        updaterDeps: deps,
        prompt: async () => {
          prompted = true;
          return "unused";
        },
        writeFile: async () => {
          wrote = true;
        },
      }).parseAsync(["node", "delta", "--edit", "ghost"]);

      expect(prompted).toBeFalse();
      expect(wrote).toBeFalse();
      expect(err.join("")).toContain('tool "ghost" does not exist');
    } finally {
      process.exitCode = exitCode ?? 0;
    }
  });

  test("cancelling edit leaves stored data unchanged", async () => {
    const { deps, out, err } = captureUpdater();
    const cancelled = Symbol("cancelled");
    let wrote = false;
    const existing = `[tools.example]
repository = "https://github.com/owner/example"
version_command = "example --version"
update_command = "example update"
`;

    await buildProgram({
      configPath: "/tmp/delta/tools.toml",
      readFile: async () => existing,
      updaterDeps: deps,
      prompt: async () => cancelled,
      isCancelled: (value) => value === cancelled,
      makeDir: async () => {},
      writeFile: async () => {
        wrote = true;
      },
      renameFile: async () => {
        wrote = true;
      },
    }).parseAsync(["node", "delta", "--edit", "example"]);

    expect(wrote).toBeFalse();
    expect(out.join("")).toBe("Edit cancelled\n");
    expect(err.join("")).toBe("");
  });

  test("no-op edit does not rewrite configuration", async () => {
    const { deps, out } = captureUpdater();
    let wrote = false;
    const existing = `[tools.example]
repository = "https://github.com/owner/example"
version_command = "example --version"
update_command = "example update"
`;

    await buildProgram({
      configPath: "/tmp/delta/tools.toml",
      readFile: async () => existing,
      updaterDeps: deps,
      prompt: async (_message, initialValue) => initialValue ?? "",
      makeDir: async () => {},
      writeFile: async () => {
        wrote = true;
      },
      renameFile: async () => {},
    }).parseAsync(["node", "delta", "--edit", "example"]);

    expect(wrote).toBeFalse();
    expect(out.join("")).toBe("No changes made\n");
  });

  test("edit persists changes while preserving other tools and out-of-scope content", async () => {
    const { deps, out } = captureUpdater();
    let written = "";
    const existing = `[tools.example]
repository = "https://github.com/owner/example"
version_command = "example --version"
# keep this comment
update_command = "example update"

[tools.other]
repository = "https://github.com/owner/other"
version_command = "other --version"
update_command = "other update"
`;

    await buildProgram({
      configPath: "/tmp/delta/tools.toml",
      readFile: async () => existing,
      updaterDeps: deps,
      prompt: async (message) =>
        ({
          "Repository URL": "https://github.com/owner/example",
          "Version command": "example --version 2",
          "Update command": "example update 2",
        })[message]!,
      makeDir: async () => {},
      writeFile: async (_path, content) => {
        written = content;
      },
      renameFile: async () => {},
    }).parseAsync(["node", "delta", "--edit", "example"]);

    expect(written).toContain("[tools.example]");
    expect(written).toContain("# keep this comment");
    expect(written).toContain('version_command = "example --version 2"');
    expect(written).toContain('update_command = "example update 2"');
    expect(written).toContain("[tools.other]");
    expect(written).toContain('version_command = "other --version"');
    expect(written).toContain('update_command = "other update"');
    expect(out.join("")).toContain("Edited tool example");
  });

  test("edit matches indented table headers with trailing comments", async () => {
    const { deps, err } = captureUpdater();
    let written = "";
    const existing = `  [tools.example]  # the example tool
repository = "https://github.com/owner/example"
version_command = "example --version"
update_command = "example update"
`;

    await buildProgram({
      configPath: "/tmp/delta.tools.toml",
      readFile: async () => existing,
      updaterDeps: deps,
      prompt: async (message) =>
        ({
          "Repository URL": "https://github.com/owner/example",
          "Version command": "example --version 2",
          "Update command": "example update 2",
        })[message]!,
      makeDir: async () => {},
      writeFile: async (_path, content) => {
        written = content;
      },
      renameFile: async () => {},
    }).parseAsync(["node", "delta", "--edit", "example"]);

    expect(written).toContain('version_command = "example --version 2"');
    expect(written).toContain('update_command = "example update 2"');
    expect(written).toContain("  [tools.example]  # the example tool");
    expect(err.join("")).toBe("");
  });

  test("edit edits an indented tool without touching later sections", async () => {
    const { deps, out } = captureUpdater();
    let written = "";
    const existing = `[tools.example]
repository = "https://github.com/owner/example"
version_command = "example --version"
update_command = "example update"

  [tools.other]  # second tool
repository = "https://github.com/owner/other"
version_command = "other --version"
update_command = "other update"
`;

    await buildProgram({
      configPath: "/tmp/delta.tools.toml",
      readFile: async () => existing,
      updaterDeps: deps,
      prompt: async (message) =>
        ({
          "Repository URL": "https://github.com/owner/example",
          "Version command": "example --version 2",
          "Update command": "example update 2",
        })[message]!,
      makeDir: async () => {},
      writeFile: async (_path, content) => {
        written = content;
      },
      renameFile: async () => {},
    }).parseAsync(["node", "delta", "--edit", "example"]);

    expect(written).toContain('version_command = "example --version 2"');
    expect(written).toContain('update_command = "example update 2"');
    expect(written).toContain("  [tools.other]  # second tool");
    expect(written).toContain('version_command = "other --version"');
    expect(written).toContain('update_command = "other update"');
    expect(out.join("")).toContain("Edited tool example");
  });

  test("edit preserves inline comments on edited field lines", async () => {
    const { deps, err } = captureUpdater();
    let written = "";
    const existing = `[tools.example]
repository = "https://github.com/owner/example"
version_command = "example --version"  # first version
update_command = "example update" # keep this note
`;

    await buildProgram({
      configPath: "/tmp/delta.tools.toml",
      readFile: async () => existing,
      updaterDeps: deps,
      prompt: async (message) =>
        ({
          "Repository URL": "https://github.com/owner/example",
          "Version command": "example --version 2",
          "Update command": "example update 2",
        })[message]!,
      makeDir: async () => {},
      writeFile: async (_path, content) => {
        written = content;
      },
      renameFile: async () => {},
    }).parseAsync(["node", "delta", "--edit", "example"]);

    expect(written).toContain('version_command = "example --version 2"  # first version');
    expect(written).toContain('update_command = "example update 2" # keep this note');
    expect(err.join("")).toBe("");
  });

  test("edit handles CRLF configuration files", async () => {
    const { deps, out } = captureUpdater();
    let written = "";
    const existing =
      '[tools.example]\r\nrepository = "https://github.com/owner/example"\r\nversion_command = "example --version"\r\nupdate_command = "example update"\r\n';

    await buildProgram({
      configPath: "/tmp/delta.tools.toml",
      readFile: async () => existing,
      updaterDeps: deps,
      prompt: async (message) =>
        ({
          "Repository URL": "https://github.com/owner/example",
          "Version command": "example --version 2",
          "Update command": "example update 2",
        })[message]!,
      makeDir: async () => {},
      writeFile: async (_path, content) => {
        written = content;
      },
      renameFile: async () => {},
    }).parseAsync(["node", "delta", "--edit", "example"]);

    expect(written).toContain('version_command = "example --version 2"');
    expect(written).toContain("\r\n");
    expect(out.join("")).toContain("Edited tool example");
  });

  test("--edit honors --config", async () => {
    const { deps } = captureUpdater();
    let renamedTo = "";
    const existing = `[tools.example]
repository = "https://github.com/owner/example"
version_command = "example --version"
update_command = "example update"
`;

    await buildProgram({
      configPath: "/ignored/delta.toml",
      readFile: async (path) => {
        expect(path).toBe("/tmp/custom-delta.toml");
        return existing;
      },
      updaterDeps: deps,
      prompt: async (message) =>
        ({
          "Repository URL": "https://github.com/owner/example",
          "Version command": "example --version 2",
          "Update command": "example update 2",
        })[message]!,
      makeDir: async () => {},
      writeFile: async () => {},
      renameFile: async (_from, to) => {
        renamedTo = to;
      },
    }).parseAsync(["node", "delta", "--config", "/tmp/custom-delta.toml", "--edit", "example"]);

    expect(renamedTo).toBe("/tmp/custom-delta.toml");
  });

  test("--help documents delete option", () => {
    const { stdout } = captureRun(["--help"]);
    expect(stdout).toContain("-d, --delete <tool>");
  });

  test("--delete requires a tool argument", () => {
    const { error } = captureRun(["--delete"]);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/argument missing/i);
  });

  test("--delete conflicts with --print-config-path", async () => {
    const { deps, err, out } = captureUpdater();
    const exitCode = process.exitCode;

    try {
      await buildProgram({
        configPath: "/tmp/delta/tools.toml",
        readFile: async () => {
          throw new Error("must not read");
        },
        updaterDeps: deps,
      }).parseAsync(["node", "delta", "--delete", "example", "--print-config-path"]);

      expect(err.join("")).toContain("cannot be used together");
      expect(out.join("")).toBe("");
    } finally {
      process.exitCode = exitCode ?? 0;
    }
  });

  test("--delete conflicts with --add", async () => {
    const { deps, err, out } = captureUpdater();
    const exitCode = process.exitCode;

    try {
      await buildProgram({
        configPath: "/tmp/delta/tools.toml",
        readFile: async () => {
          throw new Error("must not read");
        },
        updaterDeps: deps,
      }).parseAsync(["node", "delta", "--add", "example", "--delete", "example"]);

      expect(err.join("")).toContain("cannot be used together");
      expect(out.join("")).toBe("");
    } finally {
      process.exitCode = exitCode ?? 0;
    }
  });

  test("--delete conflicts with --edit", async () => {
    const { deps, err, out } = captureUpdater();
    const exitCode = process.exitCode;

    try {
      await buildProgram({
        configPath: "/tmp/delta/tools.toml",
        readFile: async () => {
          throw new Error("must not read");
        },
        updaterDeps: deps,
      }).parseAsync(["node", "delta", "--edit", "example", "--delete", "example"]);

      expect(err.join("")).toContain("cannot be used together");
      expect(out.join("")).toBe("");
    } finally {
      process.exitCode = exitCode ?? 0;
    }
  });

  test("--delete rejects an empty tool name", async () => {
    const { deps, err, out } = captureUpdater();
    const exitCode = process.exitCode;

    try {
      await buildProgram({
        configPath: "/tmp/delta/tools.toml",
        readFile: async () => {
          throw new Error("must not read");
        },
        updaterDeps: deps,
      }).parseAsync(["node", "delta", "--delete", ""]);

      expect(err.join("")).toContain("tool name must not be empty");
      expect(out.join("")).toBe("");
    } finally {
      process.exitCode = exitCode ?? 0;
    }
  });

  test("deleting a missing tool reports an error without prompting or writing", async () => {
    const { deps, err } = captureUpdater();
    const exitCode = process.exitCode;
    let prompted = false;
    let wrote = false;

    try {
      await buildProgram({
        configPath: "/tmp/delta/tools.toml",
        readFile: async () => `[tools.example]
repository = "https://github.com/owner/example"
version_command = "example --version"
update_command = "example update"
`,
        updaterDeps: deps,
        prompt: async () => {
          prompted = true;
          return false;
        },
        writeFile: async () => {
          wrote = true;
        },
      }).parseAsync(["node", "delta", "--delete", "ghost"]);

      expect(prompted).toBeFalse();
      expect(wrote).toBeFalse();
      expect(err.join("")).toContain('tool "ghost" does not exist');
    } finally {
      process.exitCode = exitCode ?? 0;
    }
  });

  test("delete displays tool data before asking to confirm", async () => {
    const { deps, out } = captureUpdater();
    const existing = `[tools.example]
repository = "https://github.com/owner/example"
version_command = "example --version"
update_command = "example update"
`;
    let confirmSeen = false;

    await buildProgram({
      configPath: "/tmp/delta/tools.toml",
      readFile: async () => existing,
      updaterDeps: deps,
      prompt: async (message, initialValue) => {
        confirmSeen = true;
        expect(message).toContain("example");
        expect(initialValue).toBe(false);
        return false;
      },
      isCancelled: (value) => typeof value !== "boolean",
      makeDir: async () => {},
      writeFile: async () => {},
      renameFile: async () => {},
    }).parseAsync(["node", "delta", "--delete", "example"]);

    const stdout = out.join("");
    expect(confirmSeen).toBeTrue();
    expect(stdout).toContain("example");
    expect(stdout).toContain("https://github.com/owner/example");
    expect(stdout).toContain("example --version");
    expect(stdout).toContain("example update");
  });

  test("rejected delete confirmation leaves tool and other definitions unchanged", async () => {
    const { deps, out } = captureUpdater();
    const existing = `[tools.example]
repository = "https://github.com/owner/example"
version_command = "example --version"
update_command = "example update"

[tools.other]
repository = "https://github.com/owner/other"
version_command = "other --version"
update_command = "other update"
`;
    let wrote = false;

    await buildProgram({
      configPath: "/tmp/delta/tools.toml",
      readFile: async () => existing,
      updaterDeps: deps,
      prompt: async () => false,
      isCancelled: (value) => typeof value !== "boolean",
      makeDir: async () => {},
      writeFile: async () => {
        wrote = true;
      },
      renameFile: async () => {
        wrote = true;
      },
    }).parseAsync(["node", "delta", "--delete", "example"]);

    expect(wrote).toBeFalse();
    const stdout = out.join("");
    expect(stdout).toContain("Delete cancelled");
  });

  test("cancelling delete leaves stored data unchanged", async () => {
    const { deps, out } = captureUpdater();
    const cancelled = Symbol("cancelled");
    const existing = `[tools.example]
repository = "https://github.com/owner/example"
version_command = "example --version"
update_command = "example update"
`;
    let wrote = false;

    await buildProgram({
      configPath: "/tmp/delta/tools.toml",
      readFile: async () => existing,
      updaterDeps: deps,
      prompt: async () => cancelled,
      isCancelled: (value) => value === cancelled,
      makeDir: async () => {},
      writeFile: async () => {
        wrote = true;
      },
      renameFile: async () => {
        wrote = true;
      },
    }).parseAsync(["node", "delta", "--delete", "example"]);

    expect(wrote).toBeFalse();
    expect(out.join("")).toContain("Delete cancelled");
  });

  test("--delete honors --config and removes only the named tool", async () => {
    const { deps, out } = captureUpdater();
    let renamedTo = "";
    let written = "";
    const existing = `[tools.example]
repository = "https://github.com/owner/example"
version_command = "example --version"
update_command = "example update"

[tools.other]
repository = "https://github.com/owner/other"
version_command = "other --version"
update_command = "other update"
`;

    await buildProgram({
      configPath: "/ignored/delta.toml",
      readFile: async (path) => {
        expect(path).toBe("/tmp/custom-delta.toml");
        return existing;
      },
      updaterDeps: deps,
      prompt: async () => true,
      isCancelled: (value) => typeof value !== "boolean",
      makeDir: async () => {},
      writeFile: async (_path, content) => {
        written = content;
      },
      renameFile: async (_from, to) => {
        renamedTo = to;
      },
    }).parseAsync(["node", "delta", "--config", "/tmp/custom-delta.toml", "--delete", "example"]);

    expect(renamedTo).toBe("/tmp/custom-delta.toml");
    expect(written).not.toContain("[tools.example]");
    expect(written).not.toContain("owner/example");
    expect(written).toContain("[tools.other]");
    expect(written).toContain('version_command = "other --version"');
    expect(written).toContain('update_command = "other update"');
    expect(out.join("")).toContain("Deleted tool example");
  });

  test("--delete uses the resolved configuration path by default", async () => {
    const { deps } = captureUpdater();
    const previous = process.env["XDG_CONFIG_HOME"];
    process.env["XDG_CONFIG_HOME"] = "/tmp/delta-xdg";
    let renamedTo = "";
    let readPath = "";
    const existing = `[tools.example]
repository = "https://github.com/owner/example"
version_command = "example --version"
update_command = "example update"
`;

    try {
      await buildProgram({
        readFile: async (path) => {
          readPath = path;
          return existing;
        },
        updaterDeps: deps,
        prompt: async () => true,
        isCancelled: (value) => typeof value !== "boolean",
        makeDir: async () => {},
        writeFile: async () => {},
        renameFile: async (_from, to) => {
          renamedTo = to;
        },
      }).parseAsync(["node", "delta", "--delete", "example"]);
    } finally {
      if (previous === undefined) {
        delete process.env["XDG_CONFIG_HOME"];
      } else {
        process.env["XDG_CONFIG_HOME"] = previous;
      }
    }

    expect(readPath).toBe("/tmp/delta-xdg/delta/tools.toml");
    expect(renamedTo).toBe("/tmp/delta-xdg/delta/tools.toml");
  });

  test("--delete preserves the blank separator between surviving sections", async () => {
    const { deps, out } = captureUpdater();
    let written = "";
    const existing = `[tools.a]
repository = "https://github.com/owner/a"
version_command = "a --version"
update_command = "a update"
# keep this comment
[tools.example]
repository = "https://github.com/owner/example"
version_command = "example --version"
update_command = "example update"
[tools.c]
repository = "https://github.com/owner/c"
version_command = "c --version"
update_command = "c update"
`;

    await buildProgram({
      configPath: "/tmp/delta/tools.toml",
      readFile: async () => existing,
      updaterDeps: deps,
      prompt: async () => true,
      isCancelled: (value) => typeof value !== "boolean",
      makeDir: async () => {},
      writeFile: async (_path, content) => {
        written = content;
      },
      renameFile: async () => {},
    }).parseAsync(["node", "delta", "--delete", "example"]);

    expect(written).not.toContain("[tools.example]");
    expect(written).toContain("[tools.a]\nrepository =");
    expect(written).toContain("# keep this comment");
    expect(written).toContain("[tools.c]\nrepository =");
    expect(written).toContain('update_command = "c update"');
    const parsed = Bun.TOML.parse(written);
    expect(parsed).toHaveProperty("tools.a");
    expect(parsed).toHaveProperty("tools.c");
    expect(parsed).not.toHaveProperty("tools.example");
    expect(out.join("")).toContain("Deleted tool example");
  });

  test("--delete permits deleting the final configured tool, leaving a valid TOML document", async () => {
    const { deps, out } = captureUpdater();
    let written = "";
    const existing = `[tools.example]
repository = "https://github.com/owner/example"
version_command = "example --version"
update_command = "example update"
`;

    await buildProgram({
      configPath: "/tmp/delta/tools.toml",
      readFile: async () => existing,
      updaterDeps: deps,
      prompt: async () => true,
      isCancelled: (value) => typeof value !== "boolean",
      makeDir: async () => {},
      writeFile: async (_path, content) => {
        written = content;
      },
      renameFile: async () => {},
    }).parseAsync(["node", "delta", "--delete", "example"]);

    expect(written).not.toContain("[tools.example]");
    expect(() => Bun.TOML.parse(written)).not.toThrow();
    expect(out.join("")).toContain("Deleted tool example");
  });

  test("-h is recognized as help", () => {
    const { stdout, error } = captureRun(["-h"]);
    expect(error).toBeDefined();
    expect(stdout).toContain("GitHub releases");
  });

  test("--version prints the package version", () => {
    const { stdout, error } = captureRun(["--version"]);
    expect(error).toBeDefined();
    expect(stdout.trim()).toBe("0.3.1");
  });

  test("unknown option produces an error", () => {
    const { error } = captureRun(["--bogus"]);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/unknown option/i);
  });
});
