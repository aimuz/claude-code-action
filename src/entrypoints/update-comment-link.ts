#!/usr/bin/env bun

import * as fs from "fs/promises";
import { getPlatform } from "../platform";
import type { CommentUpdateInput } from "../github/operations/comment-logic";

async function run() {
  try {
    const platform = getPlatform();

    let createClient: (token: string) => any;
    let updateCommentBody: (input: any) => string;
    let parseContext: () => any;
    let isPRReviewCommentEvent: (ctx: any) => boolean;
    let serverUrl: string;
    let checkAndDeleteEmptyBranch: (
      client: any,
      owner: string,
      repo: string,
      branch: string | undefined,
      baseBranch: string,
    ) => Promise<{ shouldDeleteBranch: boolean; branchLink: string }>;

    if (platform === "github") {
      const { createOctokit } = await import("../github/api/client");
      createClient = (token: string) => createOctokit(token);
      const ctxMod = await import("../github/context");
      parseContext = ctxMod.parseGitHubContext;
      isPRReviewCommentEvent = ctxMod.isPullRequestReviewCommentEvent;
      const cfgMod = await import("../github/api/config");
      serverUrl = cfgMod.GITHUB_SERVER_URL;
      const branchMod = await import("../github/operations/branch-cleanup");
      checkAndDeleteEmptyBranch = branchMod.checkAndDeleteEmptyBranch;
      const commentLogic = await import("../github/operations/comment-logic");
      updateCommentBody = commentLogic.updateCommentBody;
    } else {
      const { createGiteaClient } = await import("../gitea/api/client");
      createClient = (token: string) => createGiteaClient(token);
      const ctxMod = await import("../gitea/context");
      parseContext = ctxMod.parseGiteaContext;
      isPRReviewCommentEvent = ctxMod.isPullRequestReviewCommentEvent;
      const cfgMod = await import("../gitea/api/config");
      serverUrl = cfgMod.GITEA_SERVER_URL;
      const commentLogic = await import("../github/operations/comment-logic");
      updateCommentBody = commentLogic.updateCommentBody;
      checkAndDeleteEmptyBranch = async () => ({
        shouldDeleteBranch: false,
        branchLink: "",
      });
      console.error("Gitea platform support is not implemented yet.");
      return;
    }

    const commentId = parseInt(process.env.CLAUDE_COMMENT_ID!);
    const token = process.env.GITHUB_TOKEN!;
    const claudeBranch = process.env.CLAUDE_BRANCH;
    const baseBranch = process.env.BASE_BRANCH || "main";
    const triggerUsername = process.env.TRIGGER_USERNAME;

    const context = parseContext();
    const { owner, repo } = context.repository;
    const octokit = createClient(token);

    const jobUrl = `${serverUrl}/${owner}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;

    let comment;
    let isPRReviewComment = false;

    try {
      // GitHub has separate ID namespaces for review comments and issue comments
      // We need to use the correct API based on the event type
      if (isPRReviewCommentEvent(context)) {
        // For PR review comments, use the pulls API
        console.log(`Fetching PR review comment ${commentId}`);
        const { data: prComment } = await octokit.rest.pulls.getReviewComment({
          owner,
          repo,
          comment_id: commentId,
        });
        comment = prComment;
        isPRReviewComment = true;
        console.log("Successfully fetched as PR review comment");
      }

      // For all other event types, use the issues API
      if (!comment) {
        console.log(`Fetching issue comment ${commentId}`);
        const { data: issueComment } = await octokit.rest.issues.getComment({
          owner,
          repo,
          comment_id: commentId,
        });
        comment = issueComment;
        isPRReviewComment = false;
        console.log("Successfully fetched as issue comment");
      }
    } catch (finalError) {
      // If all attempts fail, try to determine more information about the comment
      console.error("Failed to fetch comment. Debug info:");
      console.error(`Comment ID: ${commentId}`);
      console.error(`Event name: ${context.eventName}`);
      console.error(`Entity number: ${context.entityNumber}`);
      console.error(`Repository: ${context.repository.full_name}`);

      // Try to get the PR info to understand the comment structure
      try {
        const { data: pr } = await octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: context.entityNumber,
        });
        console.log(`PR state: ${pr.state}`);
        console.log(`PR comments count: ${pr.comments}`);
        console.log(`PR review comments count: ${pr.review_comments}`);
      } catch {
        console.error("Could not fetch PR info for debugging");
      }

      throw finalError;
    }

    const currentBody = comment.body ?? "";

    // Check if we need to add branch link for new branches
    const { shouldDeleteBranch, branchLink } = await checkAndDeleteEmptyBranch(
      octokit,
      owner,
      repo,
      claudeBranch,
      baseBranch,
    );

    // Check if we need to add PR URL when we have a new branch
    let prLink = "";
    // If claudeBranch is set, it means we created a new branch (for issues or closed/merged PRs)
    if (claudeBranch && !shouldDeleteBranch) {
      // Check if comment already contains a PR URL
      const serverUrlPattern = serverUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const prUrlPattern = new RegExp(
        `${serverUrlPattern}\\/.+\\/compare\\/${baseBranch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.\\.\\.`,
      );
      const containsPRUrl = currentBody.match(prUrlPattern);

      if (!containsPRUrl) {
        // Check if there are changes to the branch compared to the default branch
        try {
          const { data: comparison } =
            await octokit.rest.repos.compareCommitsWithBasehead({
              owner,
              repo,
              basehead: `${baseBranch}...${claudeBranch}`,
            });

          // If there are changes (commits or file changes), add the PR URL
          if (
            comparison.total_commits > 0 ||
            (comparison.files && comparison.files.length > 0)
          ) {
            const entityType = context.isPR ? "PR" : "Issue";
            const prTitle = encodeURIComponent(
              `${entityType} #${context.entityNumber}: Changes from Claude`,
            );
            const prBody = encodeURIComponent(
              `This PR addresses ${entityType.toLowerCase()} #${context.entityNumber}\n\nGenerated with [Claude Code](https://claude.ai/code)`,
            );
            const prUrl = `${serverUrl}/${owner}/${repo}/compare/${baseBranch}...${claudeBranch}?quick_pull=1&title=${prTitle}&body=${prBody}`;
            prLink = `\n[Create a PR](${prUrl})`;
          }
        } catch (error) {
          console.error("Error checking for changes in branch:", error);
          // Don't fail the entire update if we can't check for changes
        }
      }
    }

    // Check if action failed and read output file for execution details
    let executionDetails: {
      cost_usd?: number;
      duration_ms?: number;
      duration_api_ms?: number;
    } | null = null;
    let actionFailed = false;
    let errorDetails: string | undefined;

    // First check if prepare step failed
    const prepareSuccess = process.env.PREPARE_SUCCESS !== "false";
    const prepareError = process.env.PREPARE_ERROR;

    if (!prepareSuccess && prepareError) {
      actionFailed = true;
      errorDetails = prepareError;
    } else {
      // Check for existence of output file and parse it if available
      try {
        const outputFile = process.env.OUTPUT_FILE;
        if (outputFile) {
          const fileContent = await fs.readFile(outputFile, "utf8");
          const outputData = JSON.parse(fileContent);

          // Output file is an array, get the last element which contains execution details
          if (Array.isArray(outputData) && outputData.length > 0) {
            const lastElement = outputData[outputData.length - 1];
            if (
              lastElement.type === "result" &&
              "cost_usd" in lastElement &&
              "duration_ms" in lastElement
            ) {
              executionDetails = {
                cost_usd: lastElement.cost_usd,
                duration_ms: lastElement.duration_ms,
                duration_api_ms: lastElement.duration_api_ms,
              };
            }
          }
        }

        // Check if the Claude action failed
        const claudeSuccess = process.env.CLAUDE_SUCCESS !== "false";
        actionFailed = !claudeSuccess;
      } catch (error) {
        console.error("Error reading output file:", error);
        // If we can't read the file, check for any failure markers
        actionFailed = process.env.CLAUDE_SUCCESS === "false";
      }
    }

    // Prepare input for updateCommentBody function
    const commentInput: CommentUpdateInput = {
      currentBody,
      actionFailed,
      executionDetails,
      jobUrl,
      branchLink,
      prLink,
      branchName: shouldDeleteBranch ? undefined : claudeBranch,
      triggerUsername,
      errorDetails,
    };

    const updatedBody = updateCommentBody(commentInput);

    // Update the comment using the appropriate API
    try {
      if (isPRReviewComment) {
        await octokit.rest.pulls.updateReviewComment({
          owner,
          repo,
          comment_id: commentId,
          body: updatedBody,
        });
      } else {
        await octokit.rest.issues.updateComment({
          owner,
          repo,
          comment_id: commentId,
          body: updatedBody,
        });
      }
      console.log(
        `✅ Updated ${isPRReviewComment ? "PR review" : "issue"} comment ${commentId} with job link`,
      );
    } catch (updateError) {
      console.error(
        `Failed to update ${isPRReviewComment ? "PR review" : "issue"} comment:`,
        updateError,
      );
      throw updateError;
    }

    process.exit(0);
  } catch (error) {
    console.error("Error updating comment with job link:", error);
    process.exit(1);
  }
}

run();
