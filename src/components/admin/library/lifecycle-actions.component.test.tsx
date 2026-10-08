import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  publishLibraryAction: vi.fn(),
  withdrawLibraryAction: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/app/admin/library/actions", () => ({
  publishLibraryAction: mocks.publishLibraryAction,
  withdrawLibraryAction: mocks.withdrawLibraryAction,
}));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => mocks.confirm }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));

import { LibraryLifecycleActions } from "./lifecycle-actions";

const draftProps = {
  entryId: "library-1",
  title: "Entry",
  revision: 3,
  status: "draft" as const,
  canPublish: true,
  publishBlockers: [],
  informationId: "info-1",
  informationRevision: 2,
  idempotencyKey: "publish-library-1-r3-i2",
};

describe("LibraryLifecycleActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.confirm.mockResolvedValue(true);
    mocks.publishLibraryAction.mockResolvedValue({ success: true });
  });

  it("keeps publish disabled and shows canonical blockers when readiness fails", () => {
    render(<LibraryLifecycleActions {...draftProps} canPublish={false} publishBlockers={["Information actions：Missing action"]} />);

    expect(screen.getByRole("button", { name: "發佈 Library 與 Information" })).toBeDisabled();
    expect(screen.getByText("Information actions：Missing action")).toBeInTheDocument();
  });

  it("requires explicit confirmation before calling bundle publication", async () => {
    render(<LibraryLifecycleActions {...draftProps} />);
    fireEvent.click(screen.getByRole("button", { name: "發佈 Library 與 Information" }));

    await waitFor(() => expect(mocks.publishLibraryAction).toHaveBeenCalledOnce());
    const firstCall = mocks.publishLibraryAction.mock.calls.at(0);
    expect(firstCall).toBeDefined();
    const formData = firstCall?.[0] as FormData;
    expect(formData.get("confirmed")).toBe("yes");
    expect(formData.get("informationId")).toBe("info-1");
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Library 與 Information 已發佈。");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("does not publish when confirmation is cancelled", async () => {
    mocks.confirm.mockResolvedValue(false);
    render(<LibraryLifecycleActions {...draftProps} />);
    fireEvent.click(screen.getByRole("button", { name: "發佈 Library 與 Information" }));

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
    expect(mocks.publishLibraryAction).not.toHaveBeenCalled();
  });
});
