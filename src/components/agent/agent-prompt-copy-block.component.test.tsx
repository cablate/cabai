import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AgentPromptCopyBlock } from "./agent-prompt-copy-block";

describe("AgentPromptCopyBlock", () => {
  it("shows a concise prompt and copies it without exposing a token", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <AgentPromptCopyBlock
        title="User Agent"
        description="Copy this prompt"
        prompt="Use /api/agent/user/v1/openapi.yaml with $CABAI_USER_TOKEN"
      />,
    );

    expect(screen.getByText("Use /api/agent/user/v1/openapi.yaml with $CABAI_USER_TOKEN")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "User Agent：複製提示詞" }));

    expect(writeText).toHaveBeenCalledWith("Use /api/agent/user/v1/openapi.yaml with $CABAI_USER_TOKEN");
    expect(screen.getByRole("button", { name: "User Agent：複製提示詞" })).toHaveTextContent("已複製");
  });
});
