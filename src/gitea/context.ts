import fs from "fs";
import type {
  IssuesEvent,
  IssueCommentEvent,
  PullRequestEvent,
  PullRequestReviewEvent,
  PullRequestReviewCommentEvent,
} from "@octokit/webhooks-types";

export type ParsedGiteaContext = {
  runId: string;
  eventName: string;
  eventAction?: string;
  repository: {
    owner: string;
    repo: string;
    full_name: string;
  };
  actor: string;
  payload:
    | IssuesEvent
    | IssueCommentEvent
    | PullRequestEvent
    | PullRequestReviewEvent
    | PullRequestReviewCommentEvent;
  entityNumber: number;
  isPR: boolean;
  inputs: {
    triggerPhrase: string;
    assigneeTrigger: string;
    allowedTools: string;
    disallowedTools: string;
    customInstructions: string;
    directPrompt: string;
    baseBranch?: string;
  };
};

export function parseGiteaContext(): ParsedGiteaContext {
  const eventName = process.env.GITEA_EVENT_NAME!;
  const eventPath = process.env.GITEA_EVENT_PATH!;
  const runId = process.env.GITEA_RUN_ID!;
  const repositoryEnv = process.env.GITEA_REPOSITORY!;
  const actor = process.env.GITEA_ACTOR!;

  const [owner, repo] = repositoryEnv.split("/") as [string, string];

  const payload = JSON.parse(fs.readFileSync(eventPath, "utf8"));

  const commonFields = {
    runId,
    eventName,
    eventAction: payload.action as string | undefined,
    repository: {
      owner,
      repo,
      full_name: repositoryEnv,
    },
    actor,
    inputs: {
      triggerPhrase: process.env.TRIGGER_PHRASE ?? "@claude",
      assigneeTrigger: process.env.ASSIGNEE_TRIGGER ?? "",
      allowedTools: process.env.ALLOWED_TOOLS ?? "",
      disallowedTools: process.env.DISALLOWED_TOOLS ?? "",
      customInstructions: process.env.CUSTOM_INSTRUCTIONS ?? "",
      directPrompt: process.env.DIRECT_PROMPT ?? "",
      baseBranch: process.env.BASE_BRANCH,
    },
  };

  switch (eventName) {
    case "issues":
      return {
        ...commonFields,
        payload: payload as IssuesEvent,
        entityNumber: (payload as IssuesEvent).issue.number,
        isPR: false,
      };
    case "issue_comment":
      return {
        ...commonFields,
        payload: payload as IssueCommentEvent,
        entityNumber: (payload as IssueCommentEvent).issue.number,
        isPR: Boolean((payload as IssueCommentEvent).issue.pull_request),
      };
    case "pull_request":
      return {
        ...commonFields,
        payload: payload as PullRequestEvent,
        entityNumber: (payload as PullRequestEvent).pull_request.number,
        isPR: true,
      };
    case "pull_request_review":
      return {
        ...commonFields,
        payload: payload as PullRequestReviewEvent,
        entityNumber: (payload as PullRequestReviewEvent).pull_request.number,
        isPR: true,
      };
    case "pull_request_review_comment":
      return {
        ...commonFields,
        payload: payload as PullRequestReviewCommentEvent,
        entityNumber: (payload as PullRequestReviewCommentEvent).pull_request
          .number,
        isPR: true,
      };
    default:
      throw new Error(`Unsupported event type: ${eventName}`);
  }
}

export function isIssuesEvent(
  context: ParsedGiteaContext,
): context is ParsedGiteaContext & { payload: IssuesEvent } {
  return context.eventName === "issues";
}

export function isIssueCommentEvent(
  context: ParsedGiteaContext,
): context is ParsedGiteaContext & { payload: IssueCommentEvent } {
  return context.eventName === "issue_comment";
}

export function isPullRequestEvent(
  context: ParsedGiteaContext,
): context is ParsedGiteaContext & { payload: PullRequestEvent } {
  return context.eventName === "pull_request";
}

export function isPullRequestReviewEvent(
  context: ParsedGiteaContext,
): context is ParsedGiteaContext & { payload: PullRequestReviewEvent } {
  return context.eventName === "pull_request_review";
}

export function isPullRequestReviewCommentEvent(
  context: ParsedGiteaContext,
): context is ParsedGiteaContext & { payload: PullRequestReviewCommentEvent } {
  return context.eventName === "pull_request_review_comment";
}
