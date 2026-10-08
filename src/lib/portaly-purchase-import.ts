import { inflateRawSync } from "node:zlib";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  orders,
  plans,
  portalyMarketplaceEvents,
  users,
} from "@/lib/db/schema";
import { processMarketplaceEvent } from "@/lib/marketplace-processor";

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 2000;
const MAX_XLSX_ENTRIES = 200;
const MAX_XLSX_ENTRY_BYTES = 10 * 1024 * 1024;
const MAX_XLSX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_ORDER_ID_LENGTH = 128;
const MAX_EMAIL_LENGTH = 254;
const MAX_AMOUNT = 100_000_000;
const IMPORT_PRODUCT_PREFIX = "import";

type ImportEvent = "paid" | "refund";
type ImportRowAction = "create" | "process_existing" | "skip" | "block";
type ImportRowStatus = "new" | "duplicate" | "conflict" | "invalid";

type ParsedWorkbookRow = {
  rowNumber: number;
  project: string | null;
  transactionTime: string | number | null;
  orderId: string;
  couponCode: string | null;
  source: string | null;
  amount: number | null;
  statusLabel: string;
  event: ImportEvent | null;
  paymentMethod: string | null;
  customerName: string | null;
  customerEmail: string;
  customerPhone: string | null;
  paidAt: Date | null;
  raw: Record<string, unknown>;
  error?: string;
};

export type PortalyPurchaseImportPreviewRow = {
  rowNumber: number;
  orderId: string;
  event: ImportEvent | null;
  status: ImportRowStatus;
  action: ImportRowAction;
  reason: string;
  project: string | null;
  customerEmail: string;
  customerName: string | null;
  amount: number | null;
  currency: string;
  transactionTime: string | null;
  existingOrderId?: string;
  existingEventId?: string;
};

export type PortalyPurchaseImportPreview = {
  fileName: string;
  planId: string;
  planName: string;
  totalRows: number;
  validRows: number;
  newRows: number;
  processExistingRows: number;
  duplicateRows: number;
  conflictRows: number;
  invalidRows: number;
  paidRows: number;
  refundRows: number;
  amountTotal: number;
  projects: string[];
  rows: PortalyPurchaseImportPreviewRow[];
};

export type PortalyPurchaseImportApplyResult = {
  preview: PortalyPurchaseImportPreview;
  insertedEvents: number;
  processedRows: number;
  skippedRows: number;
  failedRows: number;
  errors: string[];
};

type ExistingEvent = typeof portalyMarketplaceEvents.$inferSelect;

type ExistingOrder = {
  id: string;
  merchantOrderNumber: string;
  status: string;
  paidAmount: number | null;
  planId: string;
  userEmail: string | null;
};

type AnalyzeInput = {
  fileName: string;
  bytes: Uint8Array;
  planId: string;
};

const headerAliases = {
  project: ["專案", "商品", "商品名稱", "產品", "project"],
  transactionTime: ["交易時間", "付款時間", "交易日期", "createdAt", "paidAt"],
  orderId: ["訂單編號", "訂單id", "orderId", "order id", "id"],
  couponCode: ["折扣碼", "coupon", "couponCode"],
  source: ["來源", "source"],
  amount: ["交易金額", "金額", "amount"],
  status: ["交易狀態", "狀態", "status"],
  paymentMethod: ["付款方式", "paymentMethod", "payment method"],
  customerName: ["姓名", "名稱", "name", "customerName"],
  customerEmail: ["e-mail", "email", "電子郵件", "信箱", "customerEmail"],
  customerPhone: ["電話", "手機", "phone", "customerPhone"],
} as const;

const requiredFields: Array<keyof typeof headerAliases> = [
  "transactionTime",
  "orderId",
  "amount",
  "status",
  "customerEmail",
];

export async function analyzePortalyPurchaseImport(
  input: AnalyzeInput,
): Promise<PortalyPurchaseImportPreview> {
  assertImportSize(input.bytes);

  const plan = await db.query.plans.findFirst({
    where: eq(plans.id, input.planId),
    columns: { id: true, name: true },
  });
  if (!plan) {
    throw new Error("找不到指定的 plan，請重新選擇匯入目標。");
  }

  const parsedRows = parseImportRows(input.fileName, input.bytes);
  const validCandidateRows = parsedRows.filter((row) => !row.error);
  const existing = await loadExistingRecords(validCandidateRows);

  const fileKeys = new Map<string, ParsedWorkbookRow>();
  const rows: PortalyPurchaseImportPreviewRow[] = [];

  for (const row of parsedRows) {
    const base = toPreviewBase(row);
    if (row.error || !row.event) {
      rows.push({
        ...base,
        status: "invalid",
        action: "block",
        reason: row.error ?? "交易狀態無法判斷。",
      });
      continue;
    }

    const fileKey = rowKey(row.orderId, row.event);
    const previous = fileKeys.get(fileKey);
    if (previous) {
      const same = rowsMatch(previous, row);
      rows.push({
        ...base,
        status: same ? "duplicate" : "conflict",
        action: same ? "skip" : "block",
        reason: same
          ? "檔案內已有相同訂單編號與事件，將略過重複列。"
          : "檔案內同一訂單編號的內容不一致，請先修正。",
      });
      continue;
    }
    fileKeys.set(fileKey, row);

    const existingEvent = existing.eventsByKey.get(fileKey);
    const existingOrder = existing.ordersByOrderId.get(row.orderId);
    const comparison = classifyExisting(row, input.planId, existingEvent, existingOrder);
    rows.push({
      ...base,
      ...comparison,
      existingEventId: existingEvent?.id,
      existingOrderId: existingOrder?.id,
    });
  }

  const projects = Array.from(
    new Set(rows.map((row) => row.project).filter((value): value is string => !!value)),
  );

  return {
    fileName: input.fileName,
    planId: plan.id,
    planName: plan.name,
    totalRows: rows.length,
    validRows: rows.filter((row) => row.status !== "invalid").length,
    newRows: rows.filter((row) => row.action === "create").length,
    processExistingRows: rows.filter((row) => row.action === "process_existing").length,
    duplicateRows: rows.filter((row) => row.status === "duplicate").length,
    conflictRows: rows.filter((row) => row.status === "conflict").length,
    invalidRows: rows.filter((row) => row.status === "invalid").length,
    paidRows: rows.filter((row) => row.event === "paid").length,
    refundRows: rows.filter((row) => row.event === "refund").length,
    amountTotal: rows
      .filter((row) =>
        row.event === "paid" &&
        (row.action === "create" || row.action === "process_existing") &&
        row.amount != null,
      )
      .reduce((sum, row) => sum + (row.amount ?? 0), 0),
    projects,
    rows,
  };
}

export async function applyPortalyPurchaseImport(
  input: AnalyzeInput,
): Promise<PortalyPurchaseImportApplyResult> {
  const preview = await analyzePortalyPurchaseImport(input);
  if (preview.conflictRows > 0 || preview.invalidRows > 0) {
    throw new Error("匯入檔仍有 conflict 或 invalid 列，請先修正或移除後再匯入。");
  }

  const parsedRows = parseImportRows(input.fileName, input.bytes);
  const rowsByKey = new Map(
    parsedRows
      .filter((row) => row.event && !row.error)
      .map((row) => [rowKey(row.orderId, row.event!), row]),
  );

  const actionableRows = preview.rows
    .filter((row) => row.action === "create" || row.action === "process_existing")
    .sort((a, b) => eventSortValue(a.event) - eventSortValue(b.event));

  let insertedEvents = 0;
  let processedRows = 0;
  let failedRows = 0;
  const errors: string[] = [];

  for (const previewRow of actionableRows) {
    const event = previewRow.event;
    if (!event) continue;

    const parsed = rowsByKey.get(rowKey(previewRow.orderId, event));
    if (!parsed || !parsed.paidAt || parsed.amount == null) continue;

    try {
      let eventId = previewRow.existingEventId;

      if (!eventId) {
        const [inserted] = await db
          .insert(portalyMarketplaceEvents)
          .values({
            portalyOrderId: parsed.orderId,
            portalyProductId: importedProductId(input.planId),
            event,
            customerEmail: parsed.customerEmail,
            customerName: parsed.customerName,
            customerPhone: parsed.customerPhone,
            amount: parsed.amount,
            currency: "TWD",
            discount: 0,
            feeAmount: 0,
            netTotal: parsed.amount,
            paymentMethod: parsed.paymentMethod,
            couponCode: parsed.couponCode,
            rawPayload: {
              source: "portaly_purchase_import",
              fileName: input.fileName,
              rowNumber: parsed.rowNumber,
              project: parsed.project,
              transactionTime: parsed.transactionTime,
              status: parsed.statusLabel,
              sourceColumn: parsed.source,
              raw: parsed.raw,
            },
            portalyCreatedAt: parsed.paidAt,
          })
          .onConflictDoNothing()
          .returning({ id: portalyMarketplaceEvents.id });

        if (inserted) {
          eventId = inserted.id;
          insertedEvents++;
        } else {
          const existing = await db.query.portalyMarketplaceEvents.findFirst({
            where: and(
              eq(portalyMarketplaceEvents.portalyOrderId, parsed.orderId),
              eq(portalyMarketplaceEvents.event, event),
            ),
            columns: { id: true },
          });
          eventId = existing?.id;
        }
      }

      if (!eventId) {
        throw new Error(`無法建立或取得 event：${parsed.orderId}`);
      }

      const result = await processMarketplaceEvent(eventId, {
        planIdOverride: input.planId,
        verifiedImport: true,
      });
      if (result.success) {
        processedRows++;
      } else {
        failedRows++;
        errors.push(`第 ${parsed.rowNumber} 列 ${parsed.orderId}: ${result.error ?? result.status}`);
      }
    } catch (err) {
      failedRows++;
      errors.push(
        `第 ${parsed.rowNumber} 列 ${parsed.orderId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  return {
    preview,
    insertedEvents,
    processedRows,
    skippedRows: preview.duplicateRows,
    failedRows,
    errors,
  };
}

function classifyExisting(
  row: ParsedWorkbookRow,
  planId: string,
  existingEvent?: ExistingEvent,
  existingOrder?: ExistingOrder,
): Pick<
  PortalyPurchaseImportPreviewRow,
  "status" | "action" | "reason"
> {
  if (existingEvent) {
    if (!eventMatches(row, existingEvent)) {
      return {
        status: "conflict",
        action: "block",
        reason: "資料庫已有相同訂單編號事件，但 email、金額或事件類型不同。",
      };
    }

    if (existingEvent.status === "processed" || existingEvent.status === "refunded") {
      return {
        status: "duplicate",
        action: "skip",
        reason: "資料庫已有已處理的 marketplace event，將略過。",
      };
    }

    return {
      status: "new",
      action: "process_existing",
      reason: "資料庫已有未完成 event，將用選定 plan 補處理。",
    };
  }

  if (existingOrder) {
    if (!orderMatches(row, planId, existingOrder)) {
      return {
        status: "conflict",
        action: "block",
        reason: "資料庫已有相同訂單編號，但 email、金額、plan 或訂單狀態不同。",
      };
    }

    return {
      status: "duplicate",
      action: "skip",
      reason: "資料庫已有相同訂單，將略過。",
    };
  }

  return {
    status: "new",
    action: "create",
    reason: "可匯入。",
  };
}

async function loadExistingRecords(rows: ParsedWorkbookRow[]) {
  const orderIds = Array.from(new Set(rows.map((row) => row.orderId).filter(Boolean)));
  if (orderIds.length === 0) {
    return {
      eventsByKey: new Map<string, ExistingEvent>(),
      ordersByOrderId: new Map<string, ExistingOrder>(),
    };
  }

  const merchantOrderNumbers = orderIds.map((id) => marketplaceMerchantOrderNumber(id));
  const [eventRows, orderRows] = await Promise.all([
    db
      .select()
      .from(portalyMarketplaceEvents)
      .where(inArray(portalyMarketplaceEvents.portalyOrderId, orderIds)),
    db
      .select({
        id: orders.id,
        merchantOrderNumber: orders.merchantOrderNumber,
        status: orders.status,
        paidAmount: orders.paidAmount,
        planId: orders.planId,
        userEmail: users.email,
      })
      .from(orders)
      .leftJoin(users, eq(orders.userId, users.id))
      .where(inArray(orders.merchantOrderNumber, merchantOrderNumbers)),
  ]);

  return {
    eventsByKey: new Map(eventRows.map((event) => [rowKey(event.portalyOrderId, event.event), event])),
    ordersByOrderId: new Map(
      orderRows.map((order) => [
        order.merchantOrderNumber.replace(/^mkt-/, ""),
        order,
      ]),
    ),
  };
}

function parseImportRows(fileName: string, bytes: Uint8Array): ParsedWorkbookRow[] {
  const matrix = fileName.toLowerCase().endsWith(".xlsx")
    ? readXlsxFirstSheet(bytes)
    : readDelimitedText(bytes);
  if (matrix.length > MAX_IMPORT_ROWS + 10) {
    throw new Error(`一次最多匯入 ${MAX_IMPORT_ROWS} 筆資料，請拆分檔案後再試。`);
  }

  const headerInfo = findHeaderRow(matrix);
  if (!headerInfo) {
    throw new Error("找不到可辨識的欄位列，請確認檔案包含訂單編號、交易金額、交易狀態與 E-mail。");
  }

  const { headerRowIndex, headers, indexes } = headerInfo;
  const rows: ParsedWorkbookRow[] = [];

  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const values = matrix[i] ?? [];
    if (values.every((value) => normalizeCell(value) === "")) continue;

    const raw = Object.fromEntries(
      headers.map((header, index) => [
        sanitizeRawHeader(header),
        sanitizeRawValue(values[index] ?? null),
      ]),
    );
    const row = normalizeParsedRow(values, indexes, raw, i + 1);
    rows.push(row);
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new Error(`一次最多匯入 ${MAX_IMPORT_ROWS} 筆資料，請拆分檔案後再試。`);
    }
  }

  return rows;
}

function normalizeParsedRow(
  values: unknown[],
  indexes: Record<keyof typeof headerAliases, number | undefined>,
  raw: Record<string, unknown>,
  rowNumber: number,
): ParsedWorkbookRow {
  const project = nullableString(valueAt(values, indexes.project), 160);
  const transactionTime = valueAt(values, indexes.transactionTime);
  const orderId = normalizeCell(valueAt(values, indexes.orderId));
  const couponCode = nullableString(valueAt(values, indexes.couponCode), 80);
  const source = nullableString(valueAt(values, indexes.source), 120);
  const amount = parseAmount(valueAt(values, indexes.amount));
  const statusLabel = normalizeCell(valueAt(values, indexes.status));
  const event = parseStatus(statusLabel);
  const paymentMethod = nullableString(valueAt(values, indexes.paymentMethod), 80);
  const customerName = nullableString(valueAt(values, indexes.customerName), 120);
  const customerEmail = normalizeCell(valueAt(values, indexes.customerEmail)).toLowerCase();
  const customerPhone = nullableString(valueAt(values, indexes.customerPhone), 40);
  const paidAt = parseTransactionDate(transactionTime);

  const errors = [
    !orderId ? "缺少訂單編號" : null,
    orderId.length > MAX_ORDER_ID_LENGTH ? "訂單編號過長" : null,
    orderId && !isSafeOrderId(orderId) ? "訂單編號格式不正確" : null,
    !customerEmail ? "缺少 E-mail" : null,
    customerEmail.length > MAX_EMAIL_LENGTH ? "E-mail 過長" : null,
    customerEmail && !isLikelyEmail(customerEmail) ? "E-mail 格式不正確" : null,
    amount == null ? "交易金額無法解析" : null,
    amount != null && amount < 0 ? "交易金額不可小於 0" : null,
    amount != null && amount > MAX_AMOUNT ? "交易金額異常過大" : null,
    !statusLabel ? "缺少交易狀態" : null,
    statusLabel && !event ? `不支援的交易狀態：${statusLabel}` : null,
    !paidAt ? "交易時間無法解析" : null,
    paidAt && paidAt.getTime() > Date.now() + 24 * 60 * 60 * 1000
      ? "交易時間不可在未來"
      : null,
    project && hasSpreadsheetFormulaPrefix(project) ? "專案欄位包含不安全公式內容" : null,
    couponCode && hasSpreadsheetFormulaPrefix(couponCode) ? "折扣碼包含不安全公式內容" : null,
    source && hasSpreadsheetFormulaPrefix(source) ? "來源欄位包含不安全公式內容" : null,
    paymentMethod && hasSpreadsheetFormulaPrefix(paymentMethod)
      ? "付款方式包含不安全公式內容"
      : null,
    customerName && hasSpreadsheetFormulaPrefix(customerName)
      ? "姓名欄位包含不安全公式內容"
      : null,
  ].filter((error): error is string => !!error);

  return {
    rowNumber,
    project,
    transactionTime: transactionTime == null ? null : (transactionTime as string | number),
    orderId,
    couponCode,
    source,
    amount,
    statusLabel,
    event,
    paymentMethod,
    customerName,
    customerEmail,
    customerPhone,
    paidAt,
    raw,
    error: errors.join("；") || undefined,
  };
}

function findHeaderRow(matrix: unknown[][]) {
  let best:
    | {
        headerRowIndex: number;
        headers: string[];
        indexes: Record<keyof typeof headerAliases, number | undefined>;
        score: number;
      }
    | undefined;

  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    const headers = (matrix[i] ?? []).map((value) => normalizeCell(value));
    const indexes = resolveHeaderIndexes(headers);
    const score = Object.values(indexes).filter((value) => value != null).length;
    if (!best || score > best.score) {
      best = { headerRowIndex: i, headers, indexes, score };
    }
  }

  if (!best) return undefined;
  const missing = requiredFields.filter((field) => best.indexes[field] == null);
  if (missing.length > 0) {
    throw new Error(`缺少必要欄位：${missing.map((field) => headerAliases[field][0]).join("、")}`);
  }

  return best;
}

function resolveHeaderIndexes(headers: string[]) {
  const normalized = headers.map(normalizeHeader);
  const indexes = {} as Record<keyof typeof headerAliases, number | undefined>;

  for (const [field, aliases] of Object.entries(headerAliases) as Array<
    [keyof typeof headerAliases, readonly string[]]
  >) {
    indexes[field] = normalized.findIndex((header) =>
      aliases.some((alias) => header === normalizeHeader(alias)),
    );
    if (indexes[field] === -1) indexes[field] = undefined;
  }

  return indexes;
}

function readDelimitedText(bytes: Uint8Array): unknown[][] {
  const text = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", "\t", ";"].sort(
    (a, b) => countChars(firstLine, b) - countChars(firstLine, a),
  )[0] ?? ",";
  return parseDelimitedRows(text, delimiter);
}

function parseDelimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function readXlsxFirstSheet(bytes: Uint8Array): unknown[][] {
  const entries = unzipEntries(bytes);
  const sharedStrings = parseSharedStrings(entries.get("xl/sharedStrings.xml")?.toString("utf8") ?? "");

  const workbookXml = entries.get("xl/workbook.xml")?.toString("utf8");
  const relsXml = entries.get("xl/_rels/workbook.xml.rels")?.toString("utf8");
  const sheetPath = resolveFirstSheetPath(workbookXml, relsXml) ?? "xl/worksheets/sheet1.xml";
  const sheetXml = entries.get(sheetPath)?.toString("utf8");

  if (!sheetXml) {
    throw new Error("XLSX 內找不到第一個工作表。");
  }

  return parseSheetXml(sheetXml, sharedStrings);
}

function unzipEntries(bytes: Uint8Array): Map<string, Buffer> {
  const buffer = Buffer.from(bytes);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map<string, Buffer>();
  let cursor = centralDirOffset;
  let entryCount = 0;
  let totalUncompressed = 0;

  while (cursor < buffer.length && buffer.readUInt32LE(cursor) === 0x02014b50) {
    entryCount++;
    if (entryCount > MAX_XLSX_ENTRIES) {
      throw new Error("XLSX 檔案內部項目過多，請確認檔案來源。");
    }

    const compression = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const fileName = buffer
      .subarray(cursor + 46, cursor + 46 + fileNameLength)
      .toString("utf8");

    if (uncompressedSize > MAX_XLSX_ENTRY_BYTES) {
      throw new Error("XLSX 內部工作表過大，請拆分檔案後再試。");
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_XLSX_UNCOMPRESSED_BYTES) {
      throw new Error("XLSX 解壓後內容過大，請確認檔案來源。");
    }

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const content = compression === 0
      ? Buffer.from(compressed)
      : compression === 8
        ? inflateRawSync(compressed)
        : undefined;

    if (content) {
      if (content.byteLength > MAX_XLSX_ENTRY_BYTES) {
        throw new Error("XLSX 內部工作表過大，請拆分檔案後再試。");
      }
      entries.set(fileName.replace(/\\/g, "/"), content);
    }
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let i = buffer.length - 22; i >= minOffset; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error("XLSX 檔案格式無法解析。");
}

function resolveFirstSheetPath(workbookXml?: string, relsXml?: string): string | undefined {
  if (!workbookXml || !relsXml) return undefined;

  const sheetMatch = workbookXml.match(/<sheet\b([^>]*)\/?>/);
  if (!sheetMatch) return undefined;

  const sheetAttrs = parseXmlAttributes(sheetMatch[1] ?? "");
  const relId = sheetAttrs["r:id"];
  if (!relId) return undefined;

  const relationships = Array.from(relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g));
  for (const relationship of relationships) {
    const attrs = parseXmlAttributes(relationship[1] ?? "");
    if (attrs.Id !== relId || !attrs.Target) continue;
    return resolveZipPath("xl", attrs.Target);
  }

  return undefined;
}

function resolveZipPath(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts: string[] = [];
  for (const part of `${baseDir}/${target}`.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

function parseSharedStrings(xml: string): string[] {
  if (!xml) return [];
  return Array.from(xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)).map((match) =>
    collectXmlText(match[1] ?? ""),
  );
}

function parseSheetXml(xml: string, sharedStrings: string[]): unknown[][] {
  const rows: unknown[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: unknown[] = [];
    for (const cellMatch of (rowMatch[1] ?? "").matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = parseXmlAttributes(cellMatch[1] ?? "");
      const cellRef = attrs.r ?? "";
      const columnIndex = columnIndexFromRef(cellRef);
      if (columnIndex == null) continue;
      cells[columnIndex] = parseCellValue(cellMatch[2] ?? "", attrs.t, sharedStrings);
    }
    rows.push(cells);
  }
  return rows;
}

function parseCellValue(cellXml: string, type: string | undefined, sharedStrings: string[]): unknown {
  if (type === "inlineStr") {
    const inline = cellXml.match(/<is\b[^>]*>([\s\S]*?)<\/is>/);
    return collectXmlText(inline?.[1] ?? "");
  }

  const valueMatch = cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
  if (!valueMatch) return "";

  const raw = decodeXml(valueMatch[1] ?? "");
  if (type === "s") return sharedStrings[Number(raw)] ?? "";
  if (type === "b") return raw === "1";
  if (type === "str") return raw;

  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : raw;
}

function collectXmlText(xml: string): string {
  return Array.from(xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g))
    .map((match) => decodeXml(match[1] ?? ""))
    .join("");
}

function parseXmlAttributes(input: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of input.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) {
    const key = match[1];
    if (key) attrs[key] = decodeXml(match[2] ?? "");
  }
  return attrs;
}

function decodeXml(input: string): string {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#x([0-9a-f]+);/gi, (_, value: string) =>
      String.fromCodePoint(Number.parseInt(value, 16)),
    )
    .replace(/&#(\d+);/g, (_, value: string) =>
      String.fromCodePoint(Number.parseInt(value, 10)),
    );
}

function columnIndexFromRef(ref: string): number | undefined {
  const match = ref.match(/^[A-Z]+/i);
  if (!match) return undefined;
  let index = 0;
  for (const char of match[0].toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

function parseStatus(status: string): ImportEvent | null {
  const normalized = normalizeHeader(status);
  if (["已入帳", "已付款", "付款成功", "paid", "completed", "success", "succeeded"].some(
    (value) => normalized === normalizeHeader(value),
  )) {
    return "paid";
  }
  if (["已退款", "退款", "refunded", "refund"].some(
    (value) => normalized === normalizeHeader(value),
  )) {
    return "refund";
  }
  return null;
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
  const normalized = normalizeCell(value).replace(/[,\s$NTD台幣元]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function parseTransactionDate(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const text = normalizeCell(value);
  if (!text) return null;

  const match = text.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/,
  );
  if (match) {
    const y = match[1] ?? "";
    const m = match[2] ?? "";
    const d = match[3] ?? "";
    const hh = match[4] ?? "0";
    const mm = match[5] ?? "0";
    const ss = match[6] ?? "0";
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${hh.padStart(2, "0")}:${mm.padStart(2, "0")}:${ss.padStart(2, "0")}+08:00`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toPreviewBase(row: ParsedWorkbookRow) {
  return {
    rowNumber: row.rowNumber,
    orderId: row.orderId,
    event: row.event,
    project: row.project,
    customerEmail: row.customerEmail,
    customerName: row.customerName,
    amount: row.amount,
    currency: "TWD",
    transactionTime: row.paidAt?.toISOString() ?? null,
  };
}

function rowsMatch(a: ParsedWorkbookRow, b: ParsedWorkbookRow): boolean {
  return (
    a.orderId === b.orderId &&
    a.event === b.event &&
    a.customerEmail === b.customerEmail &&
    a.amount === b.amount
  );
}

function eventMatches(row: ParsedWorkbookRow, event: ExistingEvent): boolean {
  return (
    row.event === event.event &&
    row.customerEmail === event.customerEmail &&
    row.amount === event.amount
  );
}

function orderMatches(row: ParsedWorkbookRow, planId: string, order: ExistingOrder): boolean {
  return (
    row.event === "paid" &&
    order.status === "completed" &&
    order.planId === planId &&
    order.paidAmount === row.amount &&
    normalizeCell(order.userEmail).toLowerCase() === row.customerEmail
  );
}

function assertImportSize(bytes: Uint8Array): void {
  if (bytes.byteLength === 0) throw new Error("匯入檔案是空的。");
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    throw new Error("匯入檔案太大，請控制在 5 MB 以內。");
  }
}

function importedProductId(planId: string): string {
  return `${IMPORT_PRODUCT_PREFIX}:${planId}`;
}

function marketplaceMerchantOrderNumber(orderId: string): string {
  return `mkt-${orderId}`;
}

function rowKey(orderId: string, event: ImportEvent): string {
  return `${orderId}:${event}`;
}

function eventSortValue(event: ImportEvent | null): number {
  return event === "refund" ? 1 : 0;
}

function valueAt(values: unknown[], index: number | undefined): unknown {
  return index == null ? null : values[index];
}

function nullableString(value: unknown, maxLength = 200): string | null {
  const text = normalizeCell(value);
  return text ? text.slice(0, maxLength) : null;
}

function normalizeCell(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function sanitizeRawHeader(value: string): string {
  return normalizeCell(value).slice(0, 120);
}

function sanitizeRawValue(value: unknown): unknown {
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  const text = normalizeCell(value).slice(0, 500);
  return hasSpreadsheetFormulaPrefix(text) ? `'${text}` : text;
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isSafeOrderId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function hasSpreadsheetFormulaPrefix(value: string): boolean {
  return /^[=+\-@]/.test(value.trim());
}

function countChars(input: string, char: string): number {
  return input.split(char).length - 1;
}
