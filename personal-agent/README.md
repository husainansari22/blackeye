# Personal Agent

A private, access-code-locked web AI coding assistant. Only you can log in, and the agent can read/write files, search code, and run shell commands in your workspace.

## Features

- **Access code lock** — site is locked behind your private code
- **Chat UI** — modern dark-themed interface with streaming responses
- **Coding tools** — read/write files, list directories, search code, run commands
- **Multi-provider** — OpenAI or Anthropic (switch via env)
- **Workspace sandbox** — agent only accesses files under `WORKSPACE_PATH`

## Quick Start

```bash
cd personal-agent
cp .env.example .env.local
# Edit .env.local — set ACCESS_CODE, SESSION_SECRET, and your API key
npm install
npm run dev
```

Open http://localhost:3000 and enter your access code.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ACCESS_CODE` | Yes | Your private login code |
| `SESSION_SECRET` | Yes | Random string for session signing (`openssl rand -hex 32`) |
| `LLM_PROVIDER` | No | `openai` (default) or `anthropic` |
| `OPENAI_API_KEY` | If OpenAI | Your OpenAI API key |
| `ANTHROPIC_API_KEY` | If Anthropic | Your Anthropic API key |
| `OPENAI_MODEL` | No | Default: `gpt-4o` |
| `ANTHROPIC_MODEL` | No | Default: `claude-sonnet-4-20250514` |
| `WORKSPACE_PATH` | No | Directory the agent can access (default: cwd) |

## Production

```bash
npm run build
npm start
```

Deploy to any Node.js host (Vercel, Railway, VPS, etc.). Set env vars in your hosting dashboard.

## Security Notes

- Change `ACCESS_CODE` and `SESSION_SECRET` before deploying
- Use HTTPS in production (cookies are secure in production mode)
- The agent runs shell commands — only expose this to yourself
- LLM providers enforce their own API usage policies

## Tools Available to the Agent

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents with optional line range |
| `write_file` | Create or overwrite files |
| `list_directory` | List files in a directory |
| `search_files` | Regex search across workspace |
| `run_command` | Execute shell commands in workspace |
