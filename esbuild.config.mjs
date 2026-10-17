import esbuild from "esbuild";
const prod = process.argv[2] === "production";
const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"], bundle: true, format: "cjs", target: "es2021",
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  outfile: "main.js", sourcemap: prod ? false : "inline", minify: prod, logLevel: "info",
});
if (prod) { await ctx.rebuild(); await ctx.dispose(); } else { await ctx.watch(); }
