import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { config } from "../config";

const execAsync = promisify(exec);

export type ToolName =
  | "read_file"
  | "write_file"
  | "list_directory"
  | "search_files"
  | "run_command";

export interface ToolDefinition {
  name: ToolName;
  description: string;
  parameters: Record<string, unknown>;
}

export const toolDefinitions: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read the contents of a file. Optionally specify start and end line numbers.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path (absolute or relative to workspace)" },
        start_line: { type: "number", description: "Start line (1-indexed, optional)" },
        end_line: { type: "number", description: "End line (1-indexed, optional)" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write or overwrite a file with the given content.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path (absolute or relative to workspace)" },
        content: { type: "string", description: "Full file content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_directory",
    description: "List files and directories in a given path.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path (defaults to workspace root)" },
      },
    },
  },
  {
    name: "search_files",
    description: "Search for a regex pattern in files within the workspace.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern to search for" },
        glob: { type: "string", description: "Optional glob filter, e.g. *.ts" },
        max_results: { type: "number", description: "Max results to return (default 50)" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "run_command",
    description: "Run a shell command in the workspace directory. Returns stdout and stderr.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute" },
        timeout_ms: { type: "number", description: "Timeout in milliseconds (default 30000)" },
      },
      required: ["command"],
    },
  },
];

function resolveSafePath(inputPath: string): string {
  const base = path.resolve(config.workspacePath);
  const resolved = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(base, inputPath);

  if (!resolved.startsWith(base)) {
    throw new Error(`Path escapes workspace: ${inputPath}`);
  }
  return resolved;
}

async function readFile(args: Record<string, unknown>): Promise<string> {
  const filePath = resolveSafePath(String(args.path));
  const content = await fs.readFile(filePath, "utf-8");
  const lines = content.split("\n");
  const start = args.start_line ? Number(args.start_line) : 1;
  const end = args.end_line ? Number(args.end_line) : lines.length;
  const slice = lines.slice(start - 1, end);
  return slice.map((line, i) => `${start + i}|${line}`).join("\n");
}

async function writeFile(args: Record<string, unknown>): Promise<string> {
  const filePath = resolveSafePath(String(args.path));
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, String(args.content), "utf-8");
  return `Wrote ${linesCount(String(args.content))} lines to ${filePath}`;
}

function linesCount(content: string): number {
  return content.split("\n").length;
}

async function listDirectory(args: Record<string, unknown>): Promise<string> {
  const dirPath = resolveSafePath(String(args.path ?? config.workspacePath));
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const lines = await Promise.all(
    entries.map(async (entry) => {
      const suffix = entry.isDirectory() ? "/" : "";
      let size = "";
      if (entry.isFile()) {
        const stat = await fs.stat(path.join(dirPath, entry.name));
        size = ` (${stat.size} bytes)`;
      }
      return `${entry.name}${suffix}${size}`;
    }),
  );
  return lines.sort().join("\n") || "(empty directory)";
}

async function searchFiles(args: Record<string, unknown>): Promise<string> {
  const pattern = String(args.pattern);
  const glob = args.glob ? String(args.glob) : undefined;
  const maxResults = Number(args.max_results ?? 50);
  const regex = new RegExp(pattern, "gi");
  const results: string[] = [];

  async function walk(dir: string) {
    if (results.length >= maxResults) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxResults) break;
      const fullPath = path.join(dir, entry.name);
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        if (glob && !matchGlob(entry.name, glob)) continue;
        try {
          const content = await fs.readFile(fullPath, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              results.push(`${fullPath}:${i + 1}: ${lines[i].trim()}`);
              regex.lastIndex = 0;
              if (results.length >= maxResults) break;
            }
            regex.lastIndex = 0;
          }
        } catch {
          // skip binary/unreadable files
        }
      }
    }
  }

  await walk(path.resolve(config.workspacePath));
  return results.length ? results.join("\n") : "No matches found.";
}

function matchGlob(filename: string, glob: string): boolean {
  const regex = new RegExp(
    "^" + glob.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
    "i",
  );
  return regex.test(filename);
}

async function runCommand(args: Record<string, unknown>): Promise<string> {
  const command = String(args.command);
  const timeout = Number(args.timeout_ms ?? 30000);
  const { stdout, stderr } = await execAsync(command, {
    cwd: config.workspacePath,
    timeout,
    maxBuffer: 1024 * 1024 * 4,
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  const parts: string[] = [];
  if (stdout) parts.push(`stdout:\n${stdout}`);
  if (stderr) parts.push(`stderr:\n${stderr}`);
  return parts.join("\n\n") || "(no output)";
}

export async function executeTool(
  name: ToolName,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    switch (name) {
      case "read_file":
        return await readFile(args);
      case "write_file":
        return await writeFile(args);
      case "list_directory":
        return await listDirectory(args);
      case "search_files":
        return await searchFiles(args);
      case "run_command":
        return await runCommand(args);
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error: ${message}`;
  }
}
