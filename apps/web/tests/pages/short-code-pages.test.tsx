import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AnalyticsPage from "@/app/analytics/[shortCode]/page";
import PreviewPage from "@/app/preview/[shortCode]/page";
import { db } from "@/lib/db";
import { urlMappings } from "@/lib/db/schema";
import { nextShortCodeParam } from "../utils/next-page-param";
import { resetUrlTables } from "../utils/reset-db";

resetUrlTables();

const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

type ContentProps = { params: Promise<{ shortCode: string }> };
type Page = (props: { params: Promise<{ shortCode: string }>; searchParams: Promise<Record<string, never>> }) => ReactNode;

/** The async component inside the page's Suspense boundary, which reads the params and loads the link. */
function findContent(node: ReactNode): ReactElement<ContentProps> & { type: (props: ContentProps) => Promise<ReactNode> } {
  if (!isValidElement<{ children?: ReactNode } & Partial<ContentProps>>(node)) throw new Error("no content element");
  if (typeof node.type === "function" && node.props.params) return node as never;
  for (const child of [node.props.children].flat()) {
    try {
      return findContent(child);
    } catch {}
  }
  throw new Error("no content element");
}

/** Renders `page` the way Next would for `pathname`, streaming content included. */
async function renderPage(page: Page, route: string, pathname: string): Promise<string> {
  const params = Promise.resolve({ shortCode: nextShortCodeParam(route, pathname) });
  const content = findContent(page({ params, searchParams: Promise.resolve({}) }));
  return renderToStaticMarkup(await content.type(content.props));
}

const pages: [string, Page, string][] = [
  ["analytics", AnalyticsPage as Page, "/analytics/[shortCode]"],
  ["preview", PreviewPage as Page, "/preview/[shortCode]"],
];

describe.each(pages)("%s page", (name, page, route) => {
  const path = (segment: string) => `/${name}/${segment}`;

  it("shows a non-ASCII code", async () => {
    await db.insert(urlMappings).values({ shortCode: "ねこ-🐱", originalUrl: "https://example.com/cat" });
    const html = await renderPage(page, route, path(encodeURIComponent("ねこ-🐱")));
    expect(html).toContain("https://example.com/cat");
  });

  it("shows an ASCII code", async () => {
    await db.insert(urlMappings).values({ shortCode: "golden-clock-whispers", originalUrl: "https://example.com/a" });
    const html = await renderPage(page, route, path("golden-clock-whispers"));
    expect(html).toContain("https://example.com/a");
  });

  it("decodes a literal % only once", async () => {
    await db.insert(urlMappings).values([
      { shortCode: "50%-off", originalUrl: "https://example.com/percent" },
      { shortCode: "50%25-off", originalUrl: "https://example.com/encoded" },
    ]);
    expect(await renderPage(page, route, path("50%25-off"))).toContain("https://example.com/percent");
    expect(await renderPage(page, route, path("50%2525-off"))).toContain("https://example.com/encoded");
  });

  it("answers a malformed escape with notFound()", async () => {
    const content = findContent(page({ params: Promise.resolve({ shortCode: "%E3%81" }), searchParams: Promise.resolve({}) }));
    await expect(content.type(content.props)).rejects.toMatchObject(NOT_FOUND);
  });

  it("answers an unknown code with notFound()", async () => {
    await expect(renderPage(page, route, path(encodeURIComponent("いぬ")))).rejects.toMatchObject(NOT_FOUND);
  });
});
