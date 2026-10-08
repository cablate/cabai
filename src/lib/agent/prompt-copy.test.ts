import { describe, expect, it } from "vitest";
import { CABAI_AGENT_BASE_URL, USER_AGENT_PROMPT } from "./prompt-copy";

describe("USER_AGENT_PROMPT", () => {
  it("gives the AI a concise first-success and entitlement-safe workflow", () => {
    expect(USER_AGENT_PROMPT).toContain(
      `GET ${CABAI_AGENT_BASE_URL}/api/agent/user/v1/information?state=unread&limit=20`,
    );
    expect(USER_AGENT_PROMPT).toContain("getUserCourseContent");
    expect(USER_AGENT_PROMPT).toContain("只有取得真實 course id");
    expect(USER_AGENT_PROMPT).toContain("若沒有公告，不要送出 ACK");
    expect(USER_AGENT_PROMPT).toContain('"informationIds": ["實際公告 ID"]');
    expect(USER_AGENT_PROMPT).toContain("CABAI_USER_TOKEN");
    expect(USER_AGENT_PROMPT.length).toBeLessThan(1100);
    expect(USER_AGENT_PROMPT).not.toContain("/api/agent/v1/courses");
    expect(USER_AGENT_PROMPT).not.toContain("/api/agent/openapi.yaml");
  });
});
