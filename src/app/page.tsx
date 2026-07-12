import Link from "next/link";
import { auth } from "@/lib/auth";
import { SignInButton } from "./signin-button";

const CONFIG_SNIPPET = `{
  "mcpServers": {
    "video-render": {
      "url": "https://video-render.regiq.in/api/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_KEY>"
      }
    }
  }
}`;

export default async function LandingPage() {
  const session = await auth().catch(() => null);
  const signedIn = !!session?.user;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-14">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-400" />
          MCP · streamable-http
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          video-render-mcp
        </h1>
        <p className="mt-4 max-w-xl text-lg text-neutral-400">
          Give any AI agent a URL, get a Hyperplexed-style motion-graphics MP4
          back. Free voice, no watermark, one MCP tool call.
        </p>
        <div className="mt-8 flex gap-3">
          {signedIn ? (
            <Link
              href="/dashboard"
              className="rounded-lg bg-teal-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-teal-400"
            >
              Get your API key →
            </Link>
          ) : (
            // Client-component uses next-auth/react's signIn(). Two earlier
            // approaches failed:
            //  - a server-action signIn() inside a <form> lost the cookie on
            //    the redirect issued by the action.
            //  - a plain <a href="/api/auth/signin"> bounces back to "/"
            //    because pages.signIn is set to "/".
            // The React client signIn() POSTs to /api/auth/signin/google
            // directly with the CSRF token and gets the cookie set on the
            // normal HTTP response chain.
            <SignInButton />
          )}
          <Link
            href="https://github.com/globalion/video-render-mcp"
            target="_blank"
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-5 py-2.5 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            GitHub ↗
          </Link>
        </div>
      </div>

      <section className="mb-12">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          What it does
        </h2>
        <ul className="space-y-2 text-neutral-300">
          <li>• You describe a video in plain English to your agent.</li>
          <li>• Agent calls <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">render_video</code> with a scene plan.</li>
          <li>• You get an MP4 URL back in ~30 seconds. Playable, downloadable, no watermark.</li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Claude Desktop config
        </h2>
        <p className="mb-3 text-sm text-neutral-400">
          Add this to <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">claude_desktop_config.json</code>:
        </p>
        <pre className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-xs leading-relaxed text-neutral-200">
          {CONFIG_SNIPPET}
        </pre>
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Free tier
        </h2>
        <p className="text-neutral-300">
          20 renders per day, 720p, up to 3 minutes each. Enough for a daily
          promo channel or the odd explainer.
        </p>
      </section>

      <footer className="mt-16 border-t border-neutral-800 pt-6 text-xs text-neutral-500">
        MIT-licensed. Self-host from{" "}
        <Link href="https://github.com/globalion/video-render-mcp" target="_blank" className="underline">
          the repo
        </Link>{" "}
        if you don&apos;t trust hosted quotas.
      </footer>
    </main>
  );
}
