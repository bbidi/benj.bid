// Everything you'd want to edit lives here. Ask Claude to "add a project" or
// "update my bio" and it should only need to touch this file.

export const site = {
  name: "Benjamin Bidinger",
  short: "Benj",
  tagline: "Building things on the internet, mostly for fun.",
  bio: [
    "Hi, I'm Benj. This is my corner of the web — a place for projects, experiments, and whatever I'm curious about this week.",
    "Replace this paragraph with a few sentences about what you do, what you care about, and what you're working on.",
  ],
  links: [
    // { label: "GitHub", href: "https://github.com/bbidi" },
    // { label: "LinkedIn", href: "https://www.linkedin.com/in/your-handle" },
    // { label: "Email", href: "mailto:you@example.com" },
    { label: "GitHub", href: "https://github.com/bbidi" },
  ],
};

export type Project = {
  title: string;
  year: string;
  description: string;
  href?: string;
  tags?: string[];
};

export const projects: Project[] = [
  {
    title: "benj.bid",
    year: "2026",
    description:
      "This site. Astro, deployed to GitHub Pages on every push, built mostly by talking to Claude Code.",
    href: "https://github.com/bbidi/benj.bid",
    tags: ["Astro", "GitHub Pages"],
  },
  {
    title: "Your next project",
    year: "—",
    description: "A placeholder. Swap it for something you've made.",
    tags: ["placeholder"],
  },
];
