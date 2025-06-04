import * as core from "@actions/core";
import type { GiteaClient } from "../api/client";
import type { ParsedGiteaContext } from "../context";
import type { GiteaRepoPermission } from "../types";

export async function checkWritePermissions(
  client: GiteaClient,
  context: ParsedGiteaContext,
): Promise<boolean> {
  const { owner, repo } = context.repository;
  const username = context.actor;

  try {
    core.info(`Checking permissions for actor: ${username}`);
    const perm = await client.request<GiteaRepoPermission>(
      `/repos/${owner}/${repo}/collaborators/${username}/permission`,
    );
    const level = perm.permission;
    core.info(`Permission level retrieved: ${level}`);
    if (level === "write" || level === "admin") {
      core.info(`Actor has write access: ${level}`);
      return true;
    }
    core.warning(`Actor has insufficient permissions: ${level}`);
    return false;
  } catch (error) {
    core.error(`Failed to check permissions: ${error}`);
    throw new Error(`Failed to check permissions for ${username}: ${error}`);
  }
}
