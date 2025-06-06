import * as core from "@actions/core";

export async function prepareMcpConfig(
  githubToken: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<string> {
  try {
    const useGiteaInput = core.getBooleanInput("use_gitea", {
      required: false,
    });
    const useGiteaEnv = process.env.USE_GITEA === "true";
    const giteaHostInput = core.getInput("gitea_host", { required: false });
    const giteaHostEnv = process.env.GITEA_HOST || process.env.GITEA_SERVER_URL;
    const giteaHost = giteaHostInput || giteaHostEnv;
    const giteaTokenInput = core.getInput("gitea_token", { required: false });
    const giteaTokenEnv = process.env.GITEA_ACCESS_TOKEN;
    const giteaToken = giteaTokenInput || giteaTokenEnv || "";

    const mcpServers: Record<string, unknown> = {
      github: {
        command: "docker",
        args: [
          "run",
          "-i",
          "--rm",
          "-e",
          "GITHUB_PERSONAL_ACCESS_TOKEN",
          "ghcr.io/anthropics/github-mcp-server:sha-7382253",
        ],
        env: {
          GITHUB_PERSONAL_ACCESS_TOKEN: githubToken,
        },
      },
      github_file_ops: {
        command: "bun",
        args: [
          "run",
          `${process.env.GITHUB_ACTION_PATH}/src/mcp/github-file-ops-server.ts`,
        ],
        env: {
          GITHUB_TOKEN: githubToken,
          REPO_OWNER: owner,
          REPO_NAME: repo,
          BRANCH_NAME: branch,
          REPO_DIR: process.env.GITHUB_WORKSPACE || process.cwd(),
        },
      },
    };

    if (useGiteaInput || useGiteaEnv) {
      const giteaApiUrl =
        process.env.GITEA_API_URL ||
        (giteaHost ? `${giteaHost.replace(/\/$/, "")}/api/v1` : undefined);

      mcpServers.gitea = {
        command: "docker",
        args: [
          "run",
          "-i",
          "--rm",
          "-e",
          "GITEA_ACCESS_TOKEN",
          "docker.gitea.com/gitea-mcp-server",
        ],
        env: {
          GITEA_ACCESS_TOKEN: giteaToken,
          ...(giteaHost
            ? { GITEA_HOST: giteaHost, GITEA_SERVER_URL: giteaHost }
            : {}),
          ...(giteaApiUrl ? { GITEA_API_URL: giteaApiUrl } : {}),
        },
      };
    }

    const mcpConfig = {
      mcpServers,
    };

    return JSON.stringify(mcpConfig, null, 2);
  } catch (error) {
    core.setFailed(`Install MCP server failed with error: ${error}`);
    process.exit(1);
  }
}
