// Basic types for Gitea API responses

export type GiteaUser = {
  login: string;
};

export type GiteaRepoPermission = {
  permission: string;
  role_name?: string;
  user?: GiteaUser;
};

export type GiteaRepository = {
  default_branch: string;
};

export type GiteaPullRequest = {
  number: number;
  state: string;
  title: string;
  body: string;
  head: { ref: string };
  base: { ref: string };
};

export type GiteaIssue = {
  number: number;
  state: string;
  title: string;
  body: string;
  user?: GiteaUser;
};

export type GiteaComment = {
  id: number;
  body: string;
  user?: GiteaUser;
  html_url?: string;
};
