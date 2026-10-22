/** Static export: DevStack hosts the `out/` folder (no server, no API routes). */
const nextConfig = { output: "export", images: { unoptimized: true }, trailingSlash: true };
export default nextConfig;
