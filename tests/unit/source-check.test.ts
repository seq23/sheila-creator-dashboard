// Whose video is it (Phase 0 live test, 25 Sep 2026: another creator's downloaded TikToks,
// watermark "TikTok @texasgardenfairyx", went through the cutter unnoticed). The decision is
// pure; the job's OCR parsing is driven in a real python3.
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { POSTABLE_CLIP_SQL, heldSentence, sameHandle, sourceVerdict } from "@worker/domain/sourceCheck";
import { sourceUpdates } from "@worker/jobs/cut";

const HERS = ["iamcindymercer", "seq23", "Sequoia Taylor"];

describe("sourceVerdict", () => {
  it("another creator's TikTok watermark is held", () => {
    expect(sourceVerdict({ platform: "tiktok", handles: ["texasgardenfairyx"] }, HERS)).toEqual({ owner: "other", foreign: ["texasgardenfairyx"] });
  });
  it("her own recycled TikTok (her handle, even misread by one letter) is hers", () => {
    expect(sourceVerdict({ platform: "tiktok", handles: ["@iamcindymercer"] }, HERS)).toEqual({ owner: "hers", foreign: [] });
    expect(sourceVerdict({ platform: "tiktok", handles: ["iamcindymerccr"] }, HERS)).toEqual({ owner: "hers", foreign: [] });
    expect(sameHandle("iam.cindy_mercer", "iamcindymercer")).toBe(true);
  });
  it("a watermark whose handle cannot be read is held; so is one where she has no handles", () => {
    expect(sourceVerdict({ platform: "tiktok", handles: [] }, HERS)?.owner).toBe("other");
    expect(sourceVerdict({ platform: "tiktok", handles: ["iamcindymercer"] }, [])?.owner).toBe("other");
  });
  it("no watermark: nothing to say (a handle she tagged in her own video is not a sign)", () => {
    expect(sourceVerdict({ platform: null, handles: ["somevenue"] }, HERS)).toBeNull();
  });
  it("short handles never match by near-miss", () => {
    expect(sameHandle("seq24", "seq23")).toBe(false);
  });
  it("the sentence names the watermark and the handle, and says what to tap", () => {
    expect(heldSentence(["texasgardenfairyx"], "tiktok")).toBe("Looks like someone else's video: we saw a TikTok watermark for @texasgardenfairyx. Its clips stay off your calendar. If it is your own video, tap This is my video.");
  });
  it("the calendar rule excludes held videos", () => {
    expect(POSTABLE_CLIP_SQL).toContain("source_owner = 'other'");
  });
});

describe("sourceUpdates (cut result → assets)", () => {
  it("only this dump's assets, one verdict each, junk ignored", () => {
    const marks = [
      { asset_id: "a1", platform: "tiktok", handles: ["texasgardenfairyx"] },
      { asset_id: "a1", platform: "tiktok", handles: ["iamcindymercer"] },
      { asset_id: "not-mine", platform: "tiktok", handles: ["x"] },
      { asset_id: "a2", platform: "myspace", handles: ["x"] },
      null,
    ];
    const out = sourceUpdates(marks, new Set(["a1", "a2"]), HERS);
    expect(out).toEqual([{ asset_id: "a1", owner: "other", note: expect.stringContaining("@texasgardenfairyx") }]);
    expect(sourceUpdates("nope", new Set(["a1"]), HERS)).toEqual([]);
  });
});

const PY = `
import json, sys
sys.path.insert(0, "jobs")
import cut
sys.stdout.write(json.dumps(cut.parse_marks(json.loads(sys.argv[1]))))
`;
const parse = (texts: string[]) => JSON.parse(execFileSync("python3", ["-c", PY, JSON.stringify(texts)], { encoding: "utf8" }));

describe("jobs/cut.py parse_marks (OCR text of sampled frames)", () => {
  it("reads the TikTok watermark and its handle, as tesseract prints them", () => {
    expect(parse(["but you are\nprogrammed.\n", "d TikTok\n@texasgardenfairyx\n"])).toEqual({ platform: "tiktok", handles: ["texasgardenfairyx"] });
    expect(parse(["Tik Tok\n", "@iamcindymercer."])).toEqual({ platform: "tiktok", handles: ["iamcindymercer"] });
  });
  it("Instagram only with a handle on the same line; a caption mentioning it is not a watermark", () => {
    expect(parse(["Instagram @seq23"])).toEqual({ platform: "instagram", handles: ["seq23"] });
    expect(parse(["follow me on Instagram", "thanks @thevenue"])).toBeNull();
  });
  it("no watermark → nothing", () => {
    expect(parse(["TEST POST", "Sheila Studio"])).toBeNull();
  });
});
