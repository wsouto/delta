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
  commandExists?: (bin: string) => boolean;
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
  const tagCalls: string[] = [];
  const shellCalls: string[] = [];
  const deps = {
    commandExists: overrides.commandExists ?? (() => false),
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
      out.push(stripAnsi(s));
    },
    err: (s: string) => {
      err.push(stripAnsi(s));
    },
  };
  return { deps, out, err, tagCalls, shellCalls };
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
      "/tmp/config/delta/delta.toml",
    );
  });

  test.each([undefined, ""])("falls back when XDG config home is %p", (xdgConfigHome) => {
    expect(resolveConfigPath({ xdgConfigHome, homeDir: "/home/test" })).toBe(
      "/home/test/.config/delta/delta.toml",
    );
  });
});

describe("configuration loading", () => {
  test("loads tools from TOML without touching user configuration", async () => {
    const result = await loadTools(
      "/tmp/delta/delta.toml",
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
  const { deps, out } = captureUpdater();

  await buildProgram({
    configPath: "/tmp/delta/delta.toml",
    readFile: async () => `
[tools.example]
repository = "https://github.com/owner/repository"
version_command = "example --version"
update_command = "example update"
`,
    updaterDeps: deps,
  }).parseAsync(["node", "delta"]);

  expect(out.join("")).toBe("example is not installed\n\nUpdate complete\n");
});

describe("first run", () => {
  test("guides setup when configuration file is missing", async () => {
    const { deps, out, err } = captureUpdater();
    const exitCode = process.exitCode;

    try {
      await buildProgram({
        configPath: "/tmp/config/delta/delta.toml",
        readFile: async () => {
          throw Object.assign(new Error("not found"), { code: "ENOENT" });
        },
        updaterDeps: deps,
      }).parseAsync(["node", "delta"]);

      const message = out.join("");
      expect(message).toContain("No tools have been configured yet.");
      expect(message).toContain("/tmp/config/delta/delta.toml");
      expect(message).toContain("[tools.example]");
      expect(message).toContain('repository = "https://github.com/owner/repository"');
      expect(message).toContain("After saving the file, run Delta again.");
      expect(err.join("")).toBe("");
    } finally {
      process.exitCode = exitCode ?? 0;
    }
  });

  test("reports invalid configuration as an error, not first-run setup", async () => {
    const { deps, out, err } = captureUpdater();
    const exitCode = process.exitCode;

    try {
      await buildProgram({
        configPath: "/tmp/config/delta/delta.toml",
        readFile: async () => "tools = =",
        updaterDeps: deps,
      }).parseAsync(["node", "delta"]);

      expect(err.join("")).toContain("[error] /tmp/config/delta/delta.toml: invalid TOML:");
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
  test("missing tools are successful skips and GitHub is not queried", async () => {
    const { deps, out, tagCalls } = captureUpdater();

    const exitCode = await runUpdater(tools, deps);

    expect(exitCode).toBe(0);
    expect(out.join("")).toBe(
      "opencode is not installed\n\nomp is not installed\n\ndroast is not installed\n\nvp is not installed\n\nUpdate complete\n",
    );
    expect(tagCalls).toEqual([]);
  });

  test("current tools report parsed versions without updating", async () => {
    const { deps, out, tagCalls, shellCalls } = captureUpdater({
      commandExists: () => true,
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
      commandExists: () => true,
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
    const { deps, err, shellCalls } = captureUpdater({
      commandExists: () => true,
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
    expect(text).toContain("[error] Failed to update anomalyco/opencode");
    expect(text).toContain("[error] Failed to get installed version for can1357/oh-my-pi");
    expect(text).toContain("[error] Failed to get latest version for immanuwell/dockerfile-roast");
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
    const { deps, err, shellCalls } = captureUpdater({
      commandExists: () => true,
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
      commandExists: () => true,
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
    const { deps, err, tagCalls } = captureUpdater({
      commandExists: () => true,
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
    expect(err.join("")).toContain("[error] No GitHub release found for anomalyco/opencode");
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

  test("--config overrides default configuration path", async () => {
    const { deps, out } = captureUpdater();
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

      expect(out.join("")).toBe("example is not installed\n\nUpdate complete\n");
    } finally {
      process.exitCode = exitCode ?? 0;
    }
  });

  test("--print-config-path exits before loading configuration", async () => {
    const { deps, out } = captureUpdater();

    await buildProgram({
      configPath: "/tmp/delta/delta.toml",
      readFile: async () => {
        throw new Error("must not read");
      },
      updaterDeps: deps,
    }).parseAsync(["node", "delta", "--print-config-path"]);

    expect(out.join("")).toBe("/tmp/delta/delta.toml\n");
  });

  test("-h is recognized as help", () => {
    const { stdout, error } = captureRun(["-h"]);
    expect(error).toBeDefined();
    expect(stdout).toContain("GitHub releases");
  });

  test("--version prints the package version", () => {
    const { stdout, error } = captureRun(["--version"]);
    expect(error).toBeDefined();
    expect(stdout.trim()).toBe("0.1.0");
  });

  test("unknown option produces an error", () => {
    const { error } = captureRun(["--bogus"]);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/unknown option/i);
  });
});
