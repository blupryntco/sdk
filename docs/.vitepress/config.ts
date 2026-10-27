import { defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";

export default defineConfig({
  vite: { plugins: [llmstxt()] },
  title: "Bluprynt SDK",
  description:
    "Re-check Bluprynt KYI lookups: wallet proofs and token authorities on EVM, Solana and XRPL",
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: "Quickstart", link: "/quickstart" },
      { text: "Reference", link: "/reference/evm" },
    ],
    sidebar: [
      { text: "Overview", link: "/" },
      {
        text: "Get started",
        items: [{ text: "Quickstart", link: "/quickstart" }],
      },
      {
        text: "How Bluprynt verifies wallets",
        items: [
          {
            text: "What a proof shows, and what it doesn't",
            link: "/trust-model",
          },
          { text: "Wallet verification", link: "/wallet-verification" },
        ],
      },
      {
        text: "Chains",
        items: [
          { text: "EVM", link: "/chains/evm" },
          { text: "Solana", link: "/chains/solana" },
          { text: "XRPL", link: "/chains/xrpl" },
        ],
      },
      {
        text: "Verify with the SDK",
        items: [
          { text: "Querying the API", link: "/sdk/api-client" },
          { text: "Moments", link: "/sdk/moments" },
          { text: "Reading the report", link: "/sdk/report" },
          { text: "Showing a badge", link: "/sdk/badge" },
          { text: "RPC and errors", link: "/sdk/rpc" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "EVM checks", link: "/reference/evm" },
          { text: "Solana checks", link: "/reference/solana" },
          { text: "XRPL checks", link: "/reference/xrpl" },
          { text: "Lookup fields", link: "/reference/lookup" },
          { text: "Glossary", link: "/reference/glossary" },
        ],
      },
    ],
    search: { provider: "local" },
    socialLinks: [
      { icon: "github", link: "https://github.com/blupryntco/sdk" },
    ],
  },
});
