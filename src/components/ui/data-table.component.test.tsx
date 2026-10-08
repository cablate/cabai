import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DataTable, type Column } from "./data-table";

interface Row {
  id: string;
  name: string;
  amount: number;
}

const columns: Column<Row>[] = [
  {
    key: "name",
    header: "名稱",
    cell: (row) => row.name,
    searchValue: (row) => row.name,
    sortValue: (row) => row.name,
  },
  {
    key: "amount",
    header: "金額",
    cell: (row) => String(row.amount),
    sortValue: (row) => row.amount,
  },
];

describe("DataTable", () => {
  it("keeps the Cab AI facade while providing filtering, sorting and pagination", async () => {
    const user = userEvent.setup();
    const onQueryChange = vi.fn();
    render(
      <DataTable
        data={[
          { id: "1", name: "Zulu", amount: 30 },
          { id: "2", name: "Alpha", amount: 10 },
          { id: "3", name: "Beta", amount: 20 },
        ]}
        columns={columns}
        getRowKey={(row) => row.id}
        pageSize={2}
        searchPlaceholder="搜尋資料"
        onQueryChange={onQueryChange}
      />,
    );

    expect(screen.getByText("共 3 筆，第 1/2 頁")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "名稱" }));
    expect(screen.getByRole("columnheader", { name: "名稱" })).toHaveAttribute("aria-sort", "ascending");

    await user.type(screen.getByRole("textbox", { name: "搜尋資料" }), "Beta");
    expect(screen.getByText("Beta")).toBeVisible();
    expect(screen.queryByText("Zulu")).not.toBeInTheDocument();
    await waitFor(() => expect(onQueryChange).toHaveBeenLastCalledWith({
      search: "Beta",
      sort: { key: "name", direction: "asc" },
      pageIndex: 0,
      pageSize: 2,
    }));
  });

  it("distinguishes loading, empty and error states", () => {
    const { rerender } = render(
      <DataTable data={[]} columns={columns} getRowKey={(row) => row.id} loading />,
    );
    expect(screen.getByRole("table").closest("div[aria-busy='true']")).toBeTruthy();
    expect(screen.queryByText("無資料")).not.toBeInTheDocument();

    rerender(<DataTable data={[]} columns={columns} getRowKey={(row) => row.id} errorMessage="載入失敗" />);
    expect(screen.getByText("載入失敗")).toBeInTheDocument();
    expect(screen.queryByText("無資料")).not.toBeInTheDocument();

    rerender(<DataTable data={[]} columns={columns} getRowKey={(row) => row.id} />);
    expect(screen.getByText("無資料")).toBeInTheDocument();
  });
});
