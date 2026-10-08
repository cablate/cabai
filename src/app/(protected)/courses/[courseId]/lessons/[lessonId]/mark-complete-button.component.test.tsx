import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toggleLessonComplete = vi.fn();
const refresh = vi.fn();

vi.mock("./actions", () => ({
  toggleLessonComplete,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const { MarkCompleteButton } = await import("./mark-complete-button");

describe("MarkCompleteButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refreshes the learner progress after a successful completion", async () => {
    const user = userEvent.setup();
    toggleLessonComplete.mockResolvedValue({ completed: true });
    render(
      <MarkCompleteButton lessonId="lesson-1" isCompleted={false} />,
    );

    await user.click(screen.getByRole("button", { name: "完成這堂" }));
    await waitFor(() =>
      expect(toggleLessonComplete).toHaveBeenCalledWith("lesson-1", true),
    );
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps the action retryable and shows a server error", async () => {
    const user = userEvent.setup();
    toggleLessonComplete.mockResolvedValue({
      completed: false,
      error: "暫時無法更新進度",
    });
    render(
      <MarkCompleteButton lessonId="lesson-1" isCompleted={false} />,
    );

    await user.click(screen.getByRole("button", { name: "完成這堂" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "暫時無法更新進度",
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "完成這堂" })).toBeEnabled();
  });
});
