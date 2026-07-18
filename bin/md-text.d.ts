// Ambient declaration so `tsc` accepts `import SKILL_MD from '../skill/SKILL.md'`.
// At build time esbuild's `--loader:.md=text` inlines the file's text as a string;
// TypeScript only needs the shape (default export: string) to type-check.
declare module '*.md' {
  const content: string;
  export default content;
}
