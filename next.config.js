module.exports = {
  images: {
    remotePatterns: [{ hostname: "**" }],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};
