/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class", "[data-theme='dark']"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        bg: { primary: "hsl(var(--bg-primary))", secondary: "hsl(var(--bg-secondary))", tertiary: "hsl(var(--bg-tertiary))" },
        fg: { primary: "hsl(var(--fg-primary))", secondary: "hsl(var(--fg-secondary))", muted: "hsl(var(--fg-muted))" },
        accent: "hsl(var(--accent))",
        accentDim: "hsl(var(--accent-dim))",
        get: "#22c55e", post: "#3b82f6", put: "#f59e0b", del: "#ef4444", patch: "#a855f7",
        scenario: { request: "#22c55e", condition: "#f97316", loop: "#a855f7", wait: "#71717c", assert: "#10b981", ref: "#06b6d4" },
      },
      fontFamily: {
        sans: ["-apple-system", "PingFang SC", "Microsoft YaHei", "sans-serif"],
        mono: ["SF Mono", "JetBrains Mono", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
