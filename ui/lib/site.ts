export const site = {
  name: "Asena",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://asena.fun",
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? "https://api.asena.fun").replace(/\/$/, ""),
  appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.asena.fun").replace(/\/$/, ""),
  github: "https://github.com/shellhaki/asena",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "",
  description:
    "Asena automates WhatsApp: it runs your groups, answers commands, makes stickers, sets reminders and posts for you, from your own number.",
};

export const nav = [
  { href: "/docs", label: "Docs" },
  { href: "/pair", label: "Pair" },
  { href: "/stats", label: "Stats" },
];

export const renderDeployUrl = `https://render.com/deploy?repo=${encodeURIComponent("https://github.com/shellhaki/asena")}`;
