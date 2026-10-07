# Open Deep Research

Research a topic through repeated web searches, follow-up questions, and a final Markdown report. Run it locally with **Codex and your ChatGPT subscription** or **Claude Code and your Claude subscription**.

Both subscription modes use built-in web tools. **No OpenAI API key, Anthropic API key, or Firecrawl key is needed.** Codex is the default.

This fork builds on [dzhng/deep-research](https://github.com/dzhng/deep-research), originally created by [Duet](https://duet.so).

## Requirements

- Node.js 22.x and npm, as specified in `package.json`.
- Internet access for the selected agent's web tools.
- Codex signed in with a ChatGPT account that has Codex access, or the native Claude Code CLI signed in with an eligible Claude subscription.

Claude Code must support `--safe-mode` and `--restricted` (v2.1.248 or later). Use a current CLI release for either provider.

## Install the repository

```powershell
git clone https://github.com/lucycchi/deep-research.git
cd deep-research
npm install
```

If you already have the repository, run `npm install` from its directory.

Create your configuration file:

```powershell
Copy-Item .env.example .env.local
```

On macOS or Linux, use `cp .env.example .env.local`. If `.env.local` already exists, edit it rather than copying over it.

**The application loads `.env.local`, not `.env`.** Keep provider settings in `.env.local`. No credentials need to be added to it for subscription mode.

## Option 1: Codex with your ChatGPT subscription

### Sign in

Install the Codex CLI and sign in:

```powershell
npm install -g @openai/codex
codex login
```

Choose **Sign in with ChatGPT** and complete the browser login using your ChatGPT account. Confirm your login:

```powershell
codex login status
```

It should report that you are logged in using ChatGPT. The application's Codex SDK includes its own CLI runtime and reuses your saved login.

### Configure and run

Set these values in `.env.local`:

```env
RESEARCH_PROVIDER="codex"
SEARCH_PROVIDER="agent"
```

Then run:

```powershell
npm start
```

Codex generates queries, searches the web, analyzes findings, and writes the report using your ChatGPT account's Codex access.

## Option 2: Claude Code with your Claude subscription

### Sign in

Install the **native Claude Code CLI** using [Anthropic's installation instructions](https://code.claude.com/docs/en/setup), then sign in:

```powershell
claude auth login
```

Complete the browser login using your Claude subscription account. Confirm your login:

```powershell
claude auth status
```

The account must have a Claude subscription accepted by the CLI. A ChatGPT subscription does not provide Claude access.

### Configure and run

Set these values in `.env.local`:

```env
RESEARCH_PROVIDER="claude-code"
SEARCH_PROVIDER="agent"
```

Then run:

```powershell
npm start
```

The application invokes the official `claude -p` CLI with saved subscription login and verifies first-party subscription authentication before each request. Research sessions expose WebSearch and WebFetch; planning and writing expose no built-in tools.

## Run a research session

After `npm start`, answer the prompts for:

1. **Topic:** describe the question, scope, and output you want.
2. **Breadth:** how many research directions to explore initially. The default is 4.
3. **Depth:** how many rounds of follow-up research to perform. The default is 2.
4. **Output:** choose `report` for a detailed report or `answer` for a short answer. The default is `report`.
5. **Clarification:** in report mode, answer the generated follow-up questions.

For a first run, try breadth **1** and depth **1** to check your setup with a small investigation. Larger values consume more subscription usage and take longer.

Example topic:

> Compare three approaches to reducing food waste in university dining halls. Prioritize recent primary sources, report measured outcomes, and explain where the evidence is uncertain.

The application collects findings with supporting source URLs and follows new research questions. The final output is saved in the repository directory:

| Output choice | File |
| --- | --- |
| `report` | `report.md` |
| `answer` | `answer.md` |

Each run overwrites the corresponding output file, so rename or copy a report you want to keep. Review the cited sources when accuracy matters.

## Switch providers

Change `RESEARCH_PROVIDER` in `.env.local`, keep `SEARCH_PROVIDER="agent"`, and restart:

| Provider | Setting | Login command |
| --- | --- | --- |
| Codex | `RESEARCH_PROVIDER="codex"` | `codex login` |
| Claude Code | `RESEARCH_PROVIDER="claude-code"` | `claude auth login` |

Each provider uses its own account's allowance. Sessions run separately from your existing chat conversations.

## Usage limits and billing

Subscription mode uses your included agent allowance and **never falls back to API billing**. Child processes exclude model API credentials; Codex enforces ChatGPT sign-in, and Claude Code rejects API and cloud-provider authentication.

Subscription access is not unlimited. Authentication, quota, timeout, web-tool permission, and invalid-response errors stop the run. Purchased credits, workspace billing, or account-level extra usage settings can still apply; this application does not change those settings.

Keep login credentials private. Do not paste tokens into `.env.local`, commit authentication files, or place subscription credentials in public CI.

## Optional settings

Add these to `.env.local` only when needed:

| Variable | Purpose | Default |
| --- | --- | --- |
| `CODEX_MODEL` | Select a model available to your Codex account | CLI/account configuration |
| `CLAUDE_MODEL` | Select a model available to your Claude account | CLI/account configuration |
| `CODEX_PATH` | Path to a different native Codex executable | SDK-bundled runtime |
| `CLAUDE_PATH` | Path to the native Claude executable | `claude` on PATH |
| `CODEX_TIMEOUT_MS` | Timeout per Codex request, in milliseconds | `600000` (10 minutes) |
| `CLAUDE_TIMEOUT_MS` | Timeout per Claude request, in milliseconds | `600000` (10 minutes) |
| `RESEARCH_CONCURRENCY` | Number of research branches processed concurrently | `1` in subscription mode |
| `CONTEXT_SIZE` | Token budget used when trimming prompts | `128000` |

Subscription model calls remain serialized even when branch concurrency increases. The older `FIRECRAWL_CONCURRENCY` setting is also supported when `RESEARCH_CONCURRENCY` is omitted.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| `.env.local` is missing | Copy `.env.example` to `.env.local`. A file named `.env` is not loaded by `npm start`. |
| The wrong provider runs | Check `.env.local` and any overriding environment variables in your terminal, then restart. |
| Codex login fails | Run `codex login status`, then `codex login` and choose ChatGPT sign-in. |
| Claude subscription login is rejected | Run `claude auth status`, then `claude auth login` with your subscription account. |
| `claude` is not found | Install the native CLI, reopen your terminal, or set `CLAUDE_PATH`. |
| Claude reports an unknown option | Update Claude Code to a current release. |
| A request times out | Narrow the topic, lower breadth/depth, or increase the provider's timeout. |
| Web tools are unavailable | Check account, region, and workspace restrictions. Agent research requires web-tool access. |
| You reach a usage limit | Check the provider's usage dashboard and wait for a reset, or switch to the other signed-in provider. |

## Local HTTP service

To run the service instead of the interactive CLI:

```powershell
npm run api
```

It loads the same `.env.local` settings. The default port is `3051`; set `PORT` to change it.

Send a JSON POST request to `/api/research` for a short answer or `/api/generate-report` for a report:

```json
{
  "query": "Your research question",
  "breadth": 1,
  "depth": 1
}
```

The service has no authentication layer. Use it on a trusted local network; requests consume the signed-in account's allowance.

## Optional Firecrawl and API workflows

These alternatives require separate service credentials and may have separate charges. They are not needed for the subscription instructions above.

### Firecrawl search with subscription reasoning

Keep `RESEARCH_PROVIDER="codex"` or `RESEARCH_PROVIDER="claude-code"`, and set:

```env
SEARCH_PROVIDER="firecrawl"
FIRECRAWL_KEY="your_firecrawl_key"
# Optional self-hosted endpoint:
# FIRECRAWL_BASE_URL="http://localhost:3002"
```

Firecrawl handles search and Markdown extraction; the selected agent handles reasoning. Agent search is intended for topic research and does not reproduce all of Firecrawl's bulk crawling capabilities.

### API model providers

To explicitly enable the original API workflow:

```env
RESEARCH_PROVIDER="api"
SEARCH_PROVIDER="firecrawl"
FIRECRAWL_KEY="your_firecrawl_key"
OPENAI_KEY="your_openai_key"
```

For Fireworks, configure `FIREWORKS_KEY` instead of `OPENAI_KEY`. For an OpenAI-compatible endpoint, configure `OPENAI_ENDPOINT` and `CUSTOM_MODEL` alongside `OPENAI_KEY` (use the endpoint's required key or placeholder). These settings are used only in API mode. `SEARCH_PROVIDER="agent"` is unavailable in API mode.

The existing Docker workflow requires explicit API/Firecrawl configuration. The subscription instructions above are for local execution with saved CLI login.

## Development

```powershell
npm run typecheck
npm test
```

Tests use mocked model/CLI responses and do not consume subscription usage. Live Codex and Claude subscription web research and report generation have also been verified during development.

## Official documentation

- [Codex authentication](https://learn.chatgpt.com/docs/auth)
- [Codex web search](https://learn.chatgpt.com/docs/web-search)
- [Codex usage limits](https://learn.chatgpt.com/docs/pricing)
- [Claude Code installation](https://code.claude.com/docs/en/setup)
- [Claude Code programmatic usage](https://code.claude.com/docs/en/headless)
- [Claude Code with a Claude subscription](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)

## License and community

MIT License. The original project's community implementations include [Deep Research Python](https://github.com/Finance-LLMs/deep-research-python).
