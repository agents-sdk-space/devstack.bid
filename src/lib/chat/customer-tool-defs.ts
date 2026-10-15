/** Function-tool schemas + activity labels for the customer GitHub tools (no server-only imports). */

const repoArg = { repo: { type: "string", description: "owner/name" } };
const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[]) => ({
  type: "function" as const,
  name,
  description,
  parameters: { type: "object", properties, required, additionalProperties: false },
});

export const CUSTOMER_GITHUB_TOOLS = [
  fn("github_list_repositories", "List repositories the signed-in customer can push to (their own GitHub account).", {}, []),
  fn("github_read_tree", "List files in a repository at a branch/ref (recursive).", { ...repoArg, ref: { type: "string" } }, ["repo", "ref"]),
  fn("github_read_file", "Read one text file from a repository.", { ...repoArg, path: { type: "string" }, ref: { type: "string" } }, ["repo", "path", "ref"]),
  fn("github_create_repo", "Create a new repository in the customer's GitHub account (daily quota, see docs/limits.md). Optionally seed files.", {
    name: { type: "string" },
    private: { type: "boolean" },
    description: { type: "string" },
    files: { type: "array", items: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } },
  }, ["name", "private"]),
  fn("github_create_branch", "Create a branch from another branch.", { ...repoArg, branch: { type: "string" }, from: { type: "string" } }, ["repo", "branch", "from"]),
  fn(
    "github_write_files",
    "Create, update or delete several files in ONE commit on a non-default branch (Git Data API), creating the branch from `from` if missing. Use delete:true to delete. .github/workflows is blocked.",
    {
      ...repoArg,
      branch: { type: "string" },
      from: { type: "string", description: "Base branch if the branch does not exist yet (default: repo default branch)." },
      message: { type: "string" },
      files: { type: "array", items: { type: "object", properties: { path: { type: "string" }, content: { type: "string" }, delete: { type: "boolean" } }, required: ["path"] } },
    },
    ["repo", "branch", "message", "files"]
  ),
  fn("github_open_pull_request", "Open a pull request (daily quota, see docs/limits.md).", { ...repoArg, head: { type: "string" }, base: { type: "string" }, title: { type: "string" }, body: { type: "string" } }, ["repo", "head", "base", "title"]),
  fn("github_list_pull_requests", "List pull requests.", { ...repoArg, state: { type: "string", enum: ["open", "closed", "all"] } }, ["repo"]),
  fn("github_get_pull_request", "Read one pull request: title, state, body and changed files.", { ...repoArg, number: { type: "integer" } }, ["repo", "number"]),
  fn(
    "get_deploy_logs",
    "Self-heal: read the latest (or a given) failed deployment for the customer: status, error code, sanitized log, hint, deploy profile and remaining fix attempts.",
    { deployment_id: { type: "string", description: "Optional; defaults to the latest failed deployment." } },
    []
  ),
  fn(
    "apply_fix",
    "Self-heal: commit a fix for a FAILED deployment to its branch (or a devstack/fix-* branch; never the default branch). Limited attempts per deployment (see docs/limits.md). Does NOT redeploy: the customer must click 'Retry deploy'.",
    {
      deployment_id: { type: "string" },
      message: { type: "string" },
      files: { type: "array", items: { type: "object", properties: { path: { type: "string" }, content: { type: "string" }, delete: { type: "boolean" } }, required: ["path"] } },
    },
    ["deployment_id", "message", "files"]
  ),
];

export const CUSTOMER_TOOL_NAMES = new Set(CUSTOMER_GITHUB_TOOLS.map((t) => t.name));

export const CUSTOMER_TOOL_LABELS: Record<string, string> = {
  github_list_repositories: "GitHub: list repositories",
  github_read_tree: "GitHub: read file tree",
  github_read_file: "GitHub: read file",
  github_create_repo: "GitHub: create repository",
  github_create_branch: "GitHub: create branch",
  github_write_files: "GitHub: commit files",
  github_open_pull_request: "GitHub: open pull request",
  github_list_pull_requests: "GitHub: list pull requests",
  github_get_pull_request: "GitHub: read pull request",
  get_deploy_logs: "Self-heal: read deploy logs",
  apply_fix: "Self-heal: commit fix",
};

