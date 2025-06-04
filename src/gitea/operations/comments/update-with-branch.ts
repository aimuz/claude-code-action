import type { GiteaClient } from "../../api/client";
import {
  createJobRunLink,
  createBranchLink,
  createCommentBody,
} from "./common";
import type { ParsedGiteaContext } from "../../context";

export async function updateTrackingComment(
  client: GiteaClient,
  context: ParsedGiteaContext,
  commentId: number,
  branch?: string,
) {
  const { owner, repo } = context.repository;
  const jobRunLink = createJobRunLink(owner, repo, context.runId);
  let branchLink = "";
  if (branch && !context.isPR) {
    branchLink = createBranchLink(owner, repo, branch);
  }
  const body = createCommentBody(jobRunLink, branchLink);

  await client.request(`/repos/${owner}/${repo}/issues/comments/${commentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  console.log(`✅ Updated comment ${commentId} with branch link`);
}
