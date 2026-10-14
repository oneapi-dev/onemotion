import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Chars } from "./text";

describe("Chars", () => {
  it("keeps each word on one line and leaves the spaces between words as text, so a line breaks only between words", () => {
    const html = renderToStaticMarkup(<Chars text="Semua model AI." t={100} at={0} />);
    const words = html.match(/<span style="display:inline-block;white-space:nowrap">/g) ?? [];
    expect(words).toHaveLength(3);
    // The spaces are plain text between the words, not boxes of their own that could start a line.
    expect(html).toMatch(/<\/span><\/span><\/span> <span style="display:inline-block;white-space:nowrap">/);
    expect(html).not.toMatch(/white-space:pre[^>]*> </);
  });

  it("times every character as before: the character after a space starts one step later", () => {
    const at = (text: string, t: number) => renderToStaticMarkup(<Chars text={text} t={t} at={0} step={10} mode="fade" />);
    // "a b": "b" is the third character, so it starts at frame 20 and is still hidden at frame 19.
    expect(at("a b", 19)).toMatch(/opacity:0;[^>]*>b</);
  });
});
