export function environmentFor(
  value: unknown,
): "production" | "preview" | "development" {
  return value === "production" || value === "preview" ? value : "development";
}
export function deploymentEnvironment() {
  return environmentFor(
    process.env.NEXT_PUBLIC_DREAM_ENVIRONMENT ||
      process.env.VERCEL_ENV ||
      process.env.NODE_ENV,
  );
}
