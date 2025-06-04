// Branch setup operations for Gitea
import { $ } from "bun";
import type { GiteaClient } from "../api/client";
import type { ParsedGiteaContext } from "../context";
import type { GiteaPullRequest, GiteaRepository } from "../types";

export type BranchInfo = {
  baseBranch: string;
  claudeBranch?: string;
  currentBranch: string;
};

/**
 * Setup the working branch for a Gitea repository. For open pull requests the
 * PR branch is checked out. For issues or closed PRs a new branch is created
 * from the configured base branch or repository default branch.
 */
export async function setupBranch(
  client: GiteaClient,
  context: ParsedGiteaContext,
): Promise<BranchInfo> {
  const { owner, repo } = context.repository;
  const index = context.entityNumber;
  const baseBranchInput = context.inputs.baseBranch;

  // When running on a pull request, check its state
  if (context.isPR) {
    const pr = await client.request<GiteaPullRequest>(
      `/repos/${owner}/${repo}/pulls/${index}`,
    );

    if (pr.state.toLowerCase() === "open") {
      const branchName = pr.head.ref;
      await $`git fetch origin --depth=20 ${branchName}`;
      await $`git checkout ${branchName}`;
      return { baseBranch: pr.base.ref, currentBranch: branchName };
    }
  }

  // Determine base branch when creating a new one
  let sourceBranch = baseBranchInput;
  if (!sourceBranch) {
    const repoInfo = await client.request<GiteaRepository>(
      `/repos/${owner}/${repo}`,
    );
    sourceBranch = repoInfo.default_branch;
  }

  const entityType = context.isPR ? "pr" : "issue";
  const timestamp = new Date()
    .toISOString()
    .replace(/[:-]/g, "")
    .replace(/\.\d{3}Z/, "")
    .split("T")
    .join("_");
  const newBranch = `claude/${entityType}-${index}-${timestamp}`;

  // Create branch via API using the chosen source branch
  await client.request(`/repos/${owner}/${repo}/branches`, {
    method: "POST",
    body: JSON.stringify({
      new_branch_name: newBranch,
      old_branch_name: sourceBranch,
    }),
    headers: { "Content-Type": "application/json" },
  });

  // Checkout the new branch locally
  await $`git fetch origin --depth=1 ${newBranch}`;
  await $`git checkout ${newBranch}`;

  return {
    baseBranch: sourceBranch,
    claudeBranch: newBranch,
    currentBranch: newBranch,
  };
}
