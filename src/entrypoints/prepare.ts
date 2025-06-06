#!/usr/bin/env bun

/**
 * Prepare the Claude action by checking trigger conditions, verifying human actor,
 * and creating the initial tracking comment
 */

import * as core from "@actions/core";
import { prepareMcpConfig } from "../mcp/install-mcp-server";
import { createPrompt } from "../create-prompt";
import { getPlatform } from "../platform";

async function run() {
  try {
    const platform = getPlatform();

    if (platform === "gitea") {
      await import("../gitea/api/client");
      await import("../gitea/context");
      await import("../gitea/validation/permissions");
      await import("../gitea/operations/comments/create-initial");
      await import("../gitea/operations/branch");
      await import("../gitea/operations/comments/update-with-branch");

      core.setFailed("Gitea platform support is not implemented yet.");
      return;
    }

    const { setupGitHubToken } = await import("../github/token");
    const { checkTriggerAction } = await import("../github/validation/trigger");
    const { checkHumanActor } = await import("../github/validation/actor");
    const { checkWritePermissions } = await import(
      "../github/validation/permissions"
    );
    const { createInitialComment } = await import(
      "../github/operations/comments/create-initial"
    );
    const { setupBranch } = await import("../github/operations/branch");
    const { updateTrackingComment } = await import(
      "../github/operations/comments/update-with-branch"
    );
    const { createOctokit } = await import("../github/api/client");
    const { fetchGitHubData } = await import("../github/data/fetcher");
    const { parseGitHubContext } = await import("../github/context");

    // Step 1: Setup GitHub token
    const githubToken = await setupGitHubToken();
    const octokit = createOctokit(githubToken);

    // Step 2: Parse GitHub context (once for all operations)
    const context = parseGitHubContext();

    // Step 3: Check write permissions
    const hasWritePermissions = await checkWritePermissions(
      octokit.rest,
      context,
    );
    if (!hasWritePermissions) {
      throw new Error(
        "Actor does not have write permissions to the repository",
      );
    }

    // Step 4: Check trigger conditions
    const containsTrigger = await checkTriggerAction(context);

    if (!containsTrigger) {
      console.log("No trigger found, skipping remaining steps");
      return;
    }

    // Step 5: Check if actor is human
    await checkHumanActor(octokit.rest, context);

    // Step 6: Create initial tracking comment
    const commentId = await createInitialComment(octokit.rest, context);

    // Step 7: Fetch GitHub data (once for both branch setup and prompt creation)
    const githubData = await fetchGitHubData({
      octokits: octokit,
      repository: `${context.repository.owner}/${context.repository.repo}`,
      prNumber: context.entityNumber.toString(),
      isPR: context.isPR,
    });

    // Step 8: Setup branch
    const branchInfo = await setupBranch(octokit, githubData, context);

    // Step 9: Update initial comment with branch link (only for issues that created a new branch)
    if (branchInfo.claudeBranch) {
      await updateTrackingComment(
        octokit,
        context,
        commentId,
        branchInfo.claudeBranch,
      );
    }

    // Step 10: Create prompt file
    await createPrompt(
      commentId,
      branchInfo.baseBranch,
      branchInfo.claudeBranch,
      githubData,
      context,
    );

    // Step 11: Get MCP configuration
    const mcpConfig = await prepareMcpConfig(
      githubToken,
      context.repository.owner,
      context.repository.repo,
      branchInfo.currentBranch,
    );
    core.setOutput("mcp_config", mcpConfig);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.setFailed(`Prepare step failed with error: ${errorMessage}`);
    // Also output the clean error message for the action to capture
    core.setOutput("prepare_error", errorMessage);
    process.exit(1);
  }
}

if (import.meta.main) {
  run();
}
