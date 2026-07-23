import type { Config } from "tailwindcss";
import { BRAND_COLORS } from "@milaserv/contracts";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: BRAND_COLORS.navy,
        teal: BRAND_COLORS.teal,
        "deep-teal": BRAND_COLORS.deepTeal,
        "soft-gray": BRAND_COLORS.softGray,
        "muted-slate": BRAND_COLORS.mutedSlate,
        "app-bg": BRAND_COLORS.lightBackground,
        border: BRAND_COLORS.border,
        "app-text": BRAND_COLORS.text,
        amber: BRAND_COLORS.amber,
        success: BRAND_COLORS.green,
        danger: BRAND_COLORS.red,
      },
      borderRadius: {
        card: "14px",
      },
    },
  },
  plugins: [],
};

export default config;
