export const botStatus = {
  connected: false,
  startedAt: Date.now(),
};

export function hostingPlatform(): string {
  const env = process.env;
  if (env.RENDER) return "render";
  if (env.RAILWAY_ENVIRONMENT) return "railway";
  if (env.FLY_APP_NAME) return "fly";
  if (env.KOYEB_APP_NAME) return "koyeb";
  if (env.DYNO) return "heroku";
  if (env.SPACE_ID) return "huggingface";
  return process.platform;
}
