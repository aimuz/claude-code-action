import { appendFileSync } from "fs";
import type { GiteaClient } from "../../api/client";
import { createJobRunLink, createCommentBody } from "./common";
import type { ParsedGiteaContext } from "../../context";

export async function createInitialComment(
  client: GiteaClient,
  context: ParsedGiteaContext,
) {
  const { owner, repo } = context.repository;
  const jobRunLink = createJobRunLink(owner, repo, context.runId);
  const body = createCommentBody(jobRunLink);

  const response = await client.request<{ id: number }>(
    `/repos/${owner}/${repo}/issues/${context.entityNumber}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    },
  );

  const githubOutput = process.env.GITHUB_OUTPUT!;
  appendFileSync(githubOutput, `claude_comment_id=${response.id}\n`);
  console.log(`✅ Created initial comment with ID: ${response.id}`);
  return response.id;
}
