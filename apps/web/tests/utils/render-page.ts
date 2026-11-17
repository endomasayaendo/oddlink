import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { nextShortCodeParam } from "./next-page-param";

/** What notFound() throws. */
export const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

type ContentProps = { params: Promise<{ shortCode: string }> };
export type Page = (props: { params: Promise<{ shortCode: string }>; searchParams: Promise<Record<string, never>> }) => ReactNode;

/** The async component inside the page's Suspense boundary, which reads the params and loads the link. */
export function findContent(node: ReactNode): ReactElement<ContentProps> & { type: (props: ContentProps) => Promise<ReactNode> } {
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
export async function renderPage(page: Page, route: string, pathname: string): Promise<string> {
  const params = Promise.resolve({ shortCode: nextShortCodeParam(route, pathname) });
  const content = findContent(page({ params, searchParams: Promise.resolve({}) }));
  return renderToStaticMarkup(await content.type(content.props));
}

const decodeEntities = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** The visible text of rendered markup, with every tag boundary collapsed to a single space. */
export function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

export type Anchor = { attrs: Record<string, string>; text: string };

/** Every `<a>` in rendered markup, with its attributes and visible text. */
export function anchorsOf(html: string): Anchor[] {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, rawAttrs, inner]) => ({
    attrs: Object.fromEntries([...rawAttrs.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, name, value]) => [name, decodeEntities(value)])),
    text: textOf(inner),
  }));
}
