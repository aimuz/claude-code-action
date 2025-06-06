export type Platform = "github" | "gitea";

export function getPlatform(): Platform {
  const value = (process.env.PLATFORM || "github").toLowerCase();
  if (value !== "github" && value !== "gitea") {
    throw new Error(
      `Invalid PLATFORM value: ${value}. Expected 'github' or 'gitea'.`,
    );
  }
  return value as Platform;
}
