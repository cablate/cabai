import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updateLesson = vi.fn();
const push = vi.fn();

vi.mock("../../../../actions", () => ({ updateLesson }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/admin/lesson-content-editor", () => ({
  LessonContentEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <input aria-label="課堂內容" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

const { EditLessonClient } = await import("./edit-lesson-client");

describe("EditLessonClient save state", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    updateLesson.mockResolvedValue({ success: true, status: "saved", version: "2026-07-12T00:00:01.000Z" });
  });

  afterEach(() => vi.useRealTimers());

  it("autosaves a dirty lesson and returns to saved state", async () => {
    render(
      <EditLessonClient
        courseId="course-1"
        lesson={{
          id: "lesson-1",
          chapterId: "chapter-1",
          title: "原始標題",
          type: "video",
          content: "https://example.com/video.mp4",
          duration: null,
          isPreview: false,
          sortOrder: 0,
          status: "draft",
          version: "2026-07-12T00:00:00.000Z",
          resources: [],
        }}
        chapters={[{ id: "chapter-1", title: "第一章" }]}
      />,
    );

    fireEvent.change(screen.getByLabelText("課堂標題"), { target: { value: "更新標題" } });
    expect(screen.getByText("有尚未儲存的變更")).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(1400); });
    await act(async () => { await Promise.resolve(); });
    expect(updateLesson).toHaveBeenCalledOnce();
    expect(screen.getByText("所有變更已儲存")).toBeInTheDocument();
  });
});
