import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { LineChart } from "../src/charts/line-chart";

// jsdom does no layout, so give every element a size and a ResizeObserver that reports it.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback([{ target, contentRect: { width: 600, height: 300 } } as ResizeObserverEntry], this);
    }
    unobserve() {}
    disconnect() {}
  };
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ width: 600, height: 300, top: 0, left: 0, right: 600, bottom: 300, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  Object.defineProperties(HTMLElement.prototype, {
    clientWidth: { configurable: true, get: () => 600 },
    clientHeight: { configurable: true, get: () => 300 },
    offsetWidth: { configurable: true, get: () => 600 },
    offsetHeight: { configurable: true, get: () => 300 },
  });
});

afterEach(cleanup);

const data = [
  { date: "Nov 4", count: 1 },
  { date: "Nov 5", count: 3 },
];

function renderChart(props: Partial<Parameters<typeof LineChart>[0]> = {}) {
  return render(<LineChart data={data} xKey="date" yKey="count" label="Clicks per day" {...props} />);
}

function surface(container: HTMLElement): SVGElement {
  const svg = container.querySelector<SVGElement>("svg.recharts-surface");
  if (!svg) throw new Error("the chart did not render");
  return svg;
}

const tooltipLines = (container: HTMLElement) =>
  [...container.querySelectorAll(".recharts-tooltip-wrapper p")].map((p) => p.textContent);

describe("LineChart", () => {
  it("is an image named by its label", () => {
    const svg = surface(renderChart().container);
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("Clicks per day");
  });

  it("shows the x value and the formatted y value in the tooltip, not the data key", async () => {
    const { container } = renderChart({ formatValue: (n) => `${n} ${n === 1 ? "click" : "clicks"}` });
    const svg = surface(container);

    await act(async () => {
      svg.focus();
      fireEvent.keyDown(svg, { key: "ArrowRight" });
    });
    expect(tooltipLines(container)).toEqual(["Nov 5", "3 clicks"]);

    await act(async () => {
      fireEvent.keyDown(svg, { key: "ArrowLeft" });
    });
    expect(tooltipLines(container)).toEqual(["Nov 4", "1 click"]);
    expect(container.querySelector(".recharts-tooltip-wrapper")?.textContent).not.toContain("count");
  });

  it("shows the bare number when no formatter is given", async () => {
    const { container } = renderChart();
    const svg = surface(container);
    await act(async () => {
      svg.focus();
      fireEvent.keyDown(svg, { key: "ArrowRight" });
    });
    expect(tooltipLines(container)).toEqual(["Nov 5", "3"]);
  });
});
