import { describe, expect, it } from "vitest";
import { osmHoursText, osmOpenDays, parseOpenDays } from "@/lib/hours";

const days = (d?: number[]) => (d ? d.map((i) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i]).join(",") : "unsure");

describe("OpenStreetMap opening hours → open days", () => {
  it.each([
    ["Mo-Fr 09:00-17:00; Sa 10:00-14:00; Su off", "Mon,Tue,Wed,Thu,Fri,Sat"],
    ["Tu-Su 10:00-18:00", "Sun,Tue,Wed,Thu,Fri,Sat"],
    ["We-Mo 09:00-16:30", "Sun,Mon,Wed,Thu,Fri,Sat"], // wraps around the week
    ["Mo,We,Fr 10:00-12:00", "Mon,Wed,Fri"],
    ["24/7", "Sun,Mon,Tue,Wed,Thu,Fri,Sat"],
    ["10:00-18:00", "Sun,Mon,Tue,Wed,Thu,Fri,Sat"], // no days = every day
    ["Mo-Fr 12:30-15:00,19:30-22:30", "Mon,Tue,Wed,Thu,Fri"],
    ["Mo-Th,Su 12:00-02:00; Fr-Sa 12:00-03:00", "Sun,Mon,Tue,Wed,Thu,Fri,Sat"],
    // Real Lisbon data: "PH,Sa,Su" once made the whole weekend rule disappear
    ["Mo-Fr 10:00-18:00; PH,Sa,Su 11:00-19:00", "Sun,Mon,Tue,Wed,Thu,Fri,Sat"],
    ["Mo-Su 11:00-22:00; PH off", "Sun,Mon,Tue,Wed,Thu,Fri,Sat"],
  ])("%s", (spec, want) => expect(days(osmOpenDays(spec))).toBe(want));

  it.each(["09:00-20:00; Oct 01-Mar 31: 09:00-17:00", "sunrise-sunset", "PH off", "Mo-Fr 10:00-18:00 \"by appointment\""])(
    "never guesses on anything beyond weekly rules: %s",
    (spec) => expect(osmOpenDays(spec)).toBeUndefined(),
  );
});

describe("OpenStreetMap opening hours → plain words", () => {
  it.each([
    ["Mo-Fr 09:00-17:00; Su off", "Mon–Fri 9:00–17:00 · Sun closed"],
    ["Fr,Sa 17:00-26:00", "Fri, Sat 17:00–2:00"], // past midnight
    ["Tu-Th 17:00-24:00", "Tue–Thu 17:00–midnight"],
    ["24/7", "Open 24/7"],
  ])("%s", (spec, want) => expect(osmHoursText(spec)).toBe(want));
});

describe("official-site hours text → open days", () => {
  it("reads ranges and closed days", () => {
    expect(days(parseOpenDays("Wednesday–Monday 9–4:30, closed Tuesday"))).toBe("Sun,Mon,Wed,Thu,Fri,Sat");
    expect(days(parseOpenDays("Open daily 10am-5pm"))).toBe("Sun,Mon,Tue,Wed,Thu,Fri,Sat");
    expect(parseOpenDays("Call ahead")).toBeUndefined();
  });
});
