import { execSync } from "child_process";
import type { GiteaClient } from "../api/client";
import type { GiteaPullRequest, GiteaIssue, GiteaComment } from "../types";
import type {
  GitHubPullRequest,
  GitHubIssue,
  GitHubComment,
  GitHubFile,
  GitHubReview,
} from "../../github/types";
import type {
  GitHubFileWithSHA,
  FetchDataResult,
} from "../../github/data/fetcher";

export type FetchDataParams = {
  client: GiteaClient;
  repository: string;
  prNumber: string;
  isPR: boolean;
};

export async function fetchGiteaData({
  client,
  repository,
  prNumber,
  isPR,
}: FetchDataParams): Promise<FetchDataResult> {
  const [owner, repo] = repository.split("/");

  let contextData: GitHubPullRequest | GitHubIssue;
  let comments: GitHubComment[] = [];
  let changedFiles: GitHubFile[] = [];
  const reviewData: { nodes: GitHubReview[] } | null = null;

  if (isPR) {
    const pr = await client.request<GiteaPullRequest>(
      `/repos/${owner}/${repo}/pulls/${prNumber}`,
    );

    contextData = {
      title: pr.title,
      body: pr.body || "",
      author: { login: (pr as any).user?.login || "" },
      baseRefName: pr.base.ref,
      headRefName: pr.head.ref,
      headRefOid: "",
      createdAt: "",
      additions: 0,
      deletions: 0,
      state: pr.state.toUpperCase(),
      commits: { totalCount: 0, nodes: [] },
      files: { nodes: [] },
      comments: { nodes: [] },
      reviews: { nodes: [] },
    };

    const files = await client.request<any[]>(
      `/repos/${owner}/${repo}/pulls/${prNumber}/files`,
    );
    changedFiles = files.map((f) => ({
      path: f.filename,
      additions: f.additions || 0,
      deletions: f.deletions || 0,
      changeType: f.status || "modified",
    }));

    const issueComments = await client.request<GiteaComment[]>(
      `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    );
    comments = issueComments.map((c) => ({
      id: String(c.id),
      databaseId: String(c.id),
      body: c.body || "",
      author: { login: c.user?.login || "" },
      createdAt: "",
    }));
  } else {
    const issue = await client.request<GiteaIssue>(
      `/repos/${owner}/${repo}/issues/${prNumber}`,
    );

    contextData = {
      title: issue.title,
      body: issue.body || "",
      author: { login: issue.user?.login || "" },
      createdAt: "",
      state: issue.state.toUpperCase(),
      comments: { nodes: [] },
    };

    const issueComments = await client.request<GiteaComment[]>(
      `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    );
    comments = issueComments.map((c) => ({
      id: String(c.id),
      databaseId: String(c.id),
      body: c.body || "",
      author: { login: c.user?.login || "" },
      createdAt: "",
    }));
  }

  const changedFilesWithSHA: GitHubFileWithSHA[] = changedFiles.map((file) => {
    try {
      const sha = execSync(`git hash-object "${file.path}"`, {
        encoding: "utf-8",
      }).trim();
      return { ...file, sha };
    } catch {
      return { ...file, sha: "unknown" };
    }
  });

  return {
    contextData,
    comments,
    changedFiles,
    changedFilesWithSHA,
    reviewData,
    imageUrlMap: new Map(),
  };
}
