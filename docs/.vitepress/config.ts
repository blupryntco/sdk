import { defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";

export default defineConfig({
  vite: { plugins: [llmstxt()] },
  title: "Bluprynt SDK",
  description:
    "Credential data access, schema parsing, API client, and chain add-ons",
  base: "/sdk/",
  cleanUrls: true,
  themeConfig: {
    nav: [{ text: "Guide", link: "/wallet-verification" }],
    sidebar: [
      {
        text: "Guide",
        items: [{ text: "Wallet verification", link: "/wallet-verification" }],
      },
    ],
    search: { provider: "local" },
    socialLinks: [
      { icon: "github", link: "https://github.com/blupryntco/sdk" },
    ],
  },
});
