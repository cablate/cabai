import { describe, expect, it } from "vitest";
import {
  AGENT_PERMISSION_OPTIONS,
  DEFAULT_AGENT_PERMISSIONS,
  hasAgentPermission,
  normalizeAgentPermissions,
} from "./agent-permissions";

describe("Library/Skill/Information Admin Agent scopes", () => {
  const newScopes = [
    "library:read", "library:write", "library:publish",
    "skill:read", "skill:write", "skill:publish",
    "information:read", "information:write", "information:publish",
  ] as const;

  it("offers all nine explicit scopes", () => {
    const values = AGENT_PERMISSION_OPTIONS.map((option) => option.value);
    expect(values).toEqual(expect.arrayContaining([...newScopes]));
  });

  it("does not add a new scope to defaults or legacy mappings", () => {
    expect(DEFAULT_AGENT_PERMISSIONS).toEqual(["content:read"]);
    expect(normalizeAgentPermissions(["read", "write", "publish"])).not.toEqual(
      expect.arrayContaining([...newScopes]),
    );
    for (const scope of newScopes) expect(hasAgentPermission(undefined, scope)).toBe(false);
  });

  it("preserves an explicitly granted new scope", () => {
    expect(normalizeAgentPermissions(["library:read", "information:write"]))
      .toEqual(["library:read", "information:write"]);
  });
});
