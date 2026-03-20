/** @type {import("next").NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@google-cloud/functions-framework", "yaml", "openai", "dotenv", "zod"]
};

export default nextConfig;
