import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { confirmDelete, deleteCourse, push, refresh, toastError, toastSuccess } = vi.hoisted(() => ({
  confirmDelete: vi.fn(),
  deleteCourse: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("../actions", () => ({ deleteCourse }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));
vi.mock("@/components/ui/confirm-dialog", () => ({
  useConfirm: () => confirmDelete,
}));
vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

const { DeleteCourseButton } = await import("./delete-course-button");

describe("DeleteCourseButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmDelete.mockResolvedValue(true);
  });

  it("keeps the admin on the course when deletion is blocked", async () => {
    deleteCourse.mockResolvedValue({
      success: false,
      error: "無法刪除已發佈且有用戶購買的課程",
    });

    render(<DeleteCourseButton courseId="course-1" courseTitle="受保護課程" />);
    fireEvent.click(screen.getByRole("button", { name: "刪除" }));

    await waitFor(() => expect(deleteCourse).toHaveBeenCalledWith("course-1"));
    expect(toastError).toHaveBeenCalledWith("無法刪除已發佈且有用戶購買的課程");
    expect(push).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("returns to the course list after successful deletion", async () => {
    deleteCourse.mockResolvedValue({ success: true });

    render(<DeleteCourseButton courseId="course-2" courseTitle="草稿課程" />);
    fireEvent.click(screen.getByRole("button", { name: "刪除" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/courses"));
    expect(toastSuccess).toHaveBeenCalledWith("課程已刪除");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("does not call the action when confirmation is cancelled", async () => {
    confirmDelete.mockResolvedValue(false);

    render(<DeleteCourseButton courseId="course-3" courseTitle="保留課程" />);
    fireEvent.click(screen.getByRole("button", { name: "刪除" }));

    await waitFor(() => expect(confirmDelete).toHaveBeenCalledOnce());
    expect(deleteCourse).not.toHaveBeenCalled();
  });
});
