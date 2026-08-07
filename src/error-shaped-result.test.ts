import { describe, expect, it } from "vitest";

import { isErrorShapedResult } from "./error-shaped-result.js";

describe("isErrorShapedResult", () => {
  it("classifies the exact 2026-08-06 502 blob as an error", () => {
    expect(isErrorShapedResult("API Error: 502 error code: 502\n")).toBe(true);
  });

  it("classifies proxy 503 overload blobs as errors", () => {
    expect(
      isErrorShapedResult(
        'API Error: 503 {"type":"error","error":{"type":"overloaded_error","message":"Account broker unavailable before upstream request."}}',
      ),
    ).toBe(true);
  });

  it("classifies policy-refusal API Error blobs as errors", () => {
    expect(
      isErrorShapedResult(
        "API Error: Claude Code is unable to respond to this request, which appears to violate our Usage Policy",
      ),
    ).toBe(true);
  });

  it("classifies short bare error-code blobs as errors", () => {
    expect(isErrorShapedResult("error code: 502")).toBe(true);
    expect(isErrorShapedResult("502 error code: 502")).toBe(true);
  });

  it("is case-insensitive on the API Error prefix", () => {
    expect(isErrorShapedResult("api error: 502")).toBe(true);
  });

  it("does NOT flag normal replies", () => {
    expect(isErrorShapedResult("done. all-hands tomorrow 11:30-12:30")).toBe(
      false,
    );
    expect(isErrorShapedResult("")).toBe(false);
    expect(isErrorShapedResult("   ")).toBe(false);
  });

  it("does NOT flag long replies that merely quote an error string", () => {
    const longReply =
      "here is what happened yesterday: the proxy returned error code: 502 " +
      "for about four minutes, which is why some messages were delayed. " +
      "everything recovered on its own and no action is needed. ".repeat(3);
    expect(isErrorShapedResult(longReply)).toBe(false);
  });

  it("does NOT flag replies that mention API errors mid-sentence", () => {
    expect(
      isErrorShapedResult(
        "the deploy failed because the API Error handling was missing a retry, i patched it and pushed. the fix adds a classifier so raw failures never reach the chat, plus a regression test covering the 502 and 503 shapes we saw in the logs yesterday evening around six.",
      ),
    ).toBe(false);
  });
});
