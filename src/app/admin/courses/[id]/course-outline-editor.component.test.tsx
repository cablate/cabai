import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";

const reorderCourseOutline = vi.fn();
const deleteChapter = vi.fn();
const deleteLesson = vi.fn();
const updateChapter = vi.fn();
const refresh = vi.fn();

vi.mock("../actions", () => ({
  reorderCourseOutline,
  deleteChapter,
  deleteLesson,
  updateChapter,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const { CourseOutlineEditor } = await import("./course-outline-editor");

const chapters = [
  {
    id: "chapter-1",
    title: "第一章",
    lessons: [
      {
        id: "lesson-1",
        title: "建立第一條 Agent 工作流",
        type: "video",
        status: "draft",
        isPreview: true,
        duration: 180,
      },
      {
        id: "lesson-2",
        title: "驗證 Agent 回應",
        type: "text",
        status: "published",
        isPreview: false,
        duration: null,
      },
    ],
  },
  {
    id: "chapter-2",
    title: "第二章",
    lessons: Array.from({ length: 42 }, (_, index) => ({
      id: `lesson-long-${index + 1}`,
      title: index === 37 ? "大型課程快速定位" : `進階課堂 ${index + 1}`,
      type: index % 2 === 0 ? "pdf" : "download",
      status: index % 3 === 0 ? "draft" : "published",
      isPreview: false,
      duration: null,
    })),
  },
];

function renderEditor() {
  return render(
    <ConfirmDialogProvider>
      <CourseOutlineEditor
        courseId="course-1"
        initialRevision="revision-1"
        initialChapters={chapters}
      />
    </ConfirmDialogProvider>,
  );
}

describe("CourseOutlineEditor", () => {
  beforeEach(() => {
    document.body.style.pointerEvents = "";
    vi.clearAllMocks();
    reorderCourseOutline.mockResolvedValue({
      success: true,
      status: "saved",
      revision: "revision-2",
    });
    updateChapter.mockResolvedValue({ success: true });
  });

  it("keeps a 40+ lesson outline collapsed and locates one lesson with chapter context", async () => {
    const user = userEvent.setup();
    renderEditor();

    expect(screen.getByText("建立第一條 Agent 工作流")).toBeInTheDocument();
    expect(screen.queryByText("大型課程快速定位")).not.toBeInTheDocument();
    expect(screen.getByText("2 章、44 堂")).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "搜尋課堂或章節" }), "大型課程快速定位");

    expect(screen.getByText("大型課程快速定位")).toBeInTheDocument();
    expect(screen.getByText("1 章、1 堂符合")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /第二章/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText("進階課堂 1")).not.toBeInTheDocument();
  });

  it("stages the complete outline and only persists after explicit save", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: /第一章/ }));
    await user.click(screen.getByRole("button", { name: "下移" }));

    expect(screen.getByText("有未儲存的課綱變更")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上移" })).toBeEnabled();
    expect(reorderCourseOutline).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "儲存課綱" }));
    await waitFor(() => expect(reorderCourseOutline).toHaveBeenCalledWith({
      courseId: "course-1",
      expectedRevision: "revision-1",
      chapters: [
        {
          id: "chapter-2",
          lessons: chapters[1]!.lessons.map((lesson) => ({ id: lesson.id })),
        },
        {
          id: "chapter-1",
          lessons: [{ id: "lesson-1" }, { id: "lesson-2" }],
        },
      ],
    }));
    expect(await screen.findByText("課綱已儲存")).toBeInTheDocument();
  });

  it("preserves staged order after a save failure and allows retry", async () => {
    const user = userEvent.setup();
    reorderCourseOutline
      .mockResolvedValueOnce({ success: false, status: "invalid", error: "暫時無法儲存課綱" })
      .mockResolvedValueOnce({ success: true, status: "saved", revision: "revision-2" });
    renderEditor();

    await user.click(screen.getByRole("button", { name: /第一章/ }));
    await user.click(screen.getByRole("button", { name: "下移" }));
    await user.click(screen.getByRole("button", { name: "儲存課綱" }));

    expect(await screen.findByText("課綱儲存失敗")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("暫時無法儲存課綱");

    await user.click(screen.getByRole("button", { name: "再次儲存" }));
    await waitFor(() => expect(reorderCourseOutline).toHaveBeenCalledTimes(2));
    expect(reorderCourseOutline.mock.calls[1]![0].chapters[0]!.id).toBe("chapter-2");
    expect(await screen.findByText("課綱已儲存")).toBeInTheDocument();
  });

  it("blocks stale revision overwrite and offers a reload path", async () => {
    const user = userEvent.setup();
    reorderCourseOutline.mockResolvedValue({
      success: false,
      status: "conflict",
      error: "課綱已在其他頁面更新，請重新載入",
    });
    renderEditor();

    await user.click(screen.getByRole("button", { name: /第一章/ }));
    await user.click(screen.getByRole("button", { name: "下移" }));
    await user.click(screen.getByRole("button", { name: "儲存課綱" }));

    expect(await screen.findByText("課綱已有較新的版本")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("課綱已在其他頁面更新");
    expect(screen.queryByRole("button", { name: "再次儲存" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重新載入最新課綱" }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(reorderCourseOutline).toHaveBeenCalledOnce();
  });

  it("keeps destructive lesson actions in overflow and cancel does not mutate", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: /建立第一條 Agent 工作流/ }));
    const overflow = screen.getByRole("button", { name: "課堂「建立第一條 Agent 工作流」操作" });
    await user.click(overflow);
    await user.click(await screen.findByRole("menuitem", { name: "刪除課堂" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("刪除課堂「建立第一條 Agent 工作流」？")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(deleteLesson).not.toHaveBeenCalled();
  });

  it("only deletes a lesson after the overflow confirmation is accepted", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: /建立第一條 Agent 工作流/ }));
    await user.click(screen.getByRole("button", { name: "課堂「建立第一條 Agent 工作流」操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "刪除課堂" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "刪除課堂" }));

    await waitFor(() => expect(deleteLesson).toHaveBeenCalledWith("lesson-1"));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("renders touched authoring labels and aria labels as readable Traditional Chinese", async () => {
    const user = userEvent.setup();
    renderEditor();

    expect(screen.getByText("影片 · 3 分鐘")).toBeInTheDocument();
    expect(screen.getAllByText("草稿").length).toBeGreaterThan(0);
    expect(screen.getByText("免費預覽")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "篩選課堂狀態" })).toHaveTextContent("已發布");

    await user.click(screen.getByRole("button", { name: "調整順序" }));
    expect(screen.getByRole("button", { name: "拖曳排序章節：第一章" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "拖曳排序課堂：建立第一條 Agent 工作流" })).toBeInTheDocument();
    expect(screen.getByText(/排序模式已開啟/)).toBeInTheDocument();
  });
});
