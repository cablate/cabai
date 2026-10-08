"use client";

import { useState } from "react";

import Link from "next/link";
import { ArrowLeft, Check, X, Plus, Trash } from "@phosphor-icons/react";
import type { PlanDeliveryStatus } from "@/lib/plan-delivery-status";
import type { Course, PlanContent, ServiceConfig } from "@/lib/db/schema";
import { PlanContentForm } from "./plan-content-form";
import { addCourseToPlan, removeCoursFromPlan } from "./plan-course-actions";
import { deletePlanContent } from "./content-actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface AvailableCourse {
  id: string;
  title: string;
  status: string;
}

interface DeliveryBuilderProps {
  planId: string;
  planName: string;
  offeringType: string;
  deliveryStatus: PlanDeliveryStatus;
  courses: Course[];
  availableCourses: AvailableCourse[];
  contents: PlanContent[];
  services: ServiceConfig[];
}

type TabKey = "overview" | "courses" | "contents" | "services";

function StatusBadge({
  isComplete,
  label,
}: {
  isComplete: boolean;
  label: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium ${
        isComplete
          ? "bg-emerald-100 text-emerald-700"
          : "bg-amber-100 text-amber-700"
      }`}
    >
      {isComplete ? <Check size={14} /> : <X size={14} />}
      {label}
    </div>
  );
}

export default function DeliveryBuilder({
  planId,
  planName,
  deliveryStatus,
  courses,
  availableCourses,
  contents,
  services,
}: DeliveryBuilderProps) {
  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "overview", label: "總覽" },
    { key: "courses", label: "課程" },
    { key: "contents", label: "內容" },
    { key: "services", label: "服務" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border-subtle bg-surface px-6 py-4 sticky top-0 z-20">
        <div className="mx-auto max-w-6xl">
          <Link prefetch={false}
            href={`/admin/plans/${planId}`}
            className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-2"
          >
            <ArrowLeft size={16} />
            返回詳情
          </Link>
          <h1 className="text-2xl font-bold text-text-primary">
            {planName} 的交付設定
          </h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-6xl px-6 py-8">
        <Tabs defaultValue="overview">
        {/* Tabs */}
        <div className="border-b border-border-subtle mb-6">
          <TabsList className="gap-6 overflow-x-auto" aria-label="交付設定區段">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Presentation Status */}
                <div className="rounded-lg border border-border-subtle bg-surface p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-text-primary">
                      前台展示
                    </h3>
                    <StatusBadge
                      isComplete={deliveryStatus.hasPresentation}
                      label={deliveryStatus.hasPresentation ? "已設定" : "未設定"}
                    />
                  </div>

                  {deliveryStatus.hasPresentation ? (
                    <p className="text-sm text-text-secondary">
                      已設定前台展示，
                      {deliveryStatus.presentationPublished
                        ? "已發佈"
                        : "未發佈"}
                    </p>
                  ) : (
                    <p className="text-sm text-text-muted mb-4">
                      未設定前台展示
                    </p>
                  )}

                  <Link prefetch={false}
                    href={`/admin/plans/${planId}/presentation`}
                    className="inline-block mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-md transition-colors"
                  >
                    編輯前台展示
                  </Link>
                </div>

                {/* Delivery Completeness */}
                <div className="rounded-lg border border-border-subtle bg-surface p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-text-primary">
                      交付方式
                    </h3>
                    <StatusBadge
                      isComplete={deliveryStatus.canDeliver}
                      label={
                        deliveryStatus.canDeliver ? "已設定" : "未設定"
                      }
                    />
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      {deliveryStatus.hasCourses ? (
                        <Check size={16} className="text-emerald-600" />
                      ) : (
                        <X size={16} className="text-zinc-400" />
                      )}
                      <span
                        className={
                          deliveryStatus.hasCourses
                            ? "text-text-primary"
                            : "text-text-muted"
                        }
                      >
                        課程內容
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {deliveryStatus.hasPlanContents ? (
                        <Check size={16} className="text-emerald-600" />
                      ) : (
                        <X size={16} className="text-zinc-400" />
                      )}
                      <span
                        className={
                          deliveryStatus.hasPlanContents
                            ? "text-text-primary"
                            : "text-text-muted"
                        }
                      >
                        方案內容
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {deliveryStatus.hasServiceConfigs ? (
                        <Check size={16} className="text-emerald-600" />
                      ) : (
                        <X size={16} className="text-zinc-400" />
                      )}
                      <span
                        className={
                          deliveryStatus.hasServiceConfigs
                            ? "text-text-primary"
                            : "text-text-muted"
                        }
                      >
                        服務設定
                      </span>
                    </div>

                  </div>
                </div>
              </div>

              {/* Missing Setup Items */}
              {deliveryStatus.missingSetup.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
                  <h3 className="font-semibold text-amber-900 mb-2">
                    缺漏的設定項目
                  </h3>
                  <ul className="space-y-1">
                    {deliveryStatus.missingSetup.map((item) => (
                      <li key={item} className="text-sm text-amber-800">
                        • {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </TabsContent>

          <TabsContent value="courses">
            <CoursesTab
              planId={planId}
              courses={courses}
              availableCourses={availableCourses}
            />
          </TabsContent>

          <TabsContent value="contents" className="space-y-6">
              <h2 className="font-semibold text-text-primary">
                內容列表 ({contents.length})
              </h2>

              {contents.length > 0 && (
                <div className="space-y-2">
                  {contents.map((content) => (
                    <div
                      key={content.id}
                      className="flex items-center justify-between p-4 rounded-lg border border-border-subtle"
                    >
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium text-text-primary">
                          {content.title}
                        </h4>
                        <p className="text-xs text-text-muted mt-1">
                          類型: {content.type} | 排序: {content.sortOrder}
                        </p>
                        {content.content && (
                          <p className="text-xs text-text-muted mt-0.5 truncate max-w-md">
                            {content.content.slice(0, 80)}{content.content.length > 80 ? "..." : ""}
                          </p>
                        )}
                      </div>
                      <form action={deletePlanContent.bind(null, content.id, planId)}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="submit"
                              className="ml-3 rounded-md p-1.5 text-text-muted transition-colors hover:bg-danger-light hover:text-danger"
                              aria-label={`刪除內容：${content.title}`}
                              onClick={(e) => {
                                if (!confirm(`確定刪除「${content.title}」？`)) e.preventDefault();
                              }}
                            >
                              <Trash size={16} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>刪除內容</TooltipContent>
                        </Tooltip>
                      </form>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-lg border border-border-subtle bg-surface-muted p-6">
                <h3 className="text-sm font-medium text-text-primary mb-4">新增交付內容</h3>
                <PlanContentForm
                  planId={planId}
                  nextSortOrder={contents.length}
                />
              </div>
          </TabsContent>

          <TabsContent value="services" className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-text-primary">
                  服務設定 ({services.length})
                </h2>
                <Link prefetch={false}
                  href="/admin/services"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-md transition-colors"
                >
                  管理服務
                </Link>
              </div>

              {services.length === 0 ? (
                <p className="text-sm text-text-muted">無服務</p>
              ) : (
                <div className="space-y-2">
                  {services.map((service) => (
                    <div
                      key={service.id}
                      className="block p-4 rounded-lg border border-border-subtle"
                    >
                      <h4 className="font-medium text-text-primary">
                        {service.serviceName}
                      </h4>
                      <p className="text-xs text-text-muted mt-1">
                        {service.isActive ? "啟用中" : "已停用"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
          </TabsContent>

        </div>
        </Tabs>
      </div>
    </div>
  );
}

// ─── Courses Tab with Picker ───

function CoursesTab({
  planId,
  courses,
  availableCourses,
}: {
  planId: string;
  courses: Course[];
  availableCourses: AvailableCourse[];
}) {
  const [adding, setAdding] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!selectedCourseId) return;
    setLoading(true);
    setError(null);
    const result = await addCourseToPlan(planId, selectedCourseId);
    setLoading(false);
    if (result.success) {
      setSelectedCourseId("");
      setAdding(false);
    } else {
      setError(result.error ?? "新增失敗");
    }
  }

  async function handleRemove(courseId: string) {
    if (!confirm("確定要從此方案移除此課程？已購買的用戶仍可存取（grandfather 保護）。")) return;
    const result = await removeCoursFromPlan(planId, courseId);
    if (!result.success) {
      alert(result.error ?? "移除失敗");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-text-primary">
          已包含的課程 ({courses.length})
        </h2>
        <div className="flex items-center gap-2">
          <Link prefetch={false}
            href="/admin/courses"
            className="px-3 py-1.5 text-xs font-medium text-text-secondary border border-border-subtle rounded-md hover:bg-surface-muted transition-colors"
          >
            課程管理
          </Link>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-md transition-colors"
            >
              <Plus size={14} />
              加入課程
            </button>
          )}
        </div>
      </div>

      {adding && (
        <div className="rounded-lg border border-border-subtle bg-surface-muted p-4 space-y-3">
          {availableCourses.length === 0 ? (
            <p className="text-sm text-text-muted">沒有可加入的課程。請先在課程管理中建立課程。</p>
          ) : (
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text-primary focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="">選擇課程</option>
              {availableCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.status === "published" ? "已發佈" : "草稿"})
                </option>
              ))}
            </select>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={loading || !selectedCourseId}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
            >
              {loading ? "加入中..." : "確認加入"}
            </button>
            <button
              onClick={() => { setAdding(false); setError(null); }}
              className="px-4 py-2 border border-border-subtle text-text-secondary text-sm font-medium rounded-md hover:bg-surface-muted transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {courses.length === 0 ? (
        <p className="text-sm text-text-muted">尚未加入任何課程</p>
      ) : (
        <div className="space-y-2">
          {courses.map((course) => (
            <div
              key={course.id}
              className="flex items-center justify-between p-4 rounded-lg border border-border-subtle"
            >
              <Link prefetch={false} href={`/admin/courses/${course.id}`} className="flex-1 min-w-0">
                <h4 className="font-medium text-text-primary hover:text-accent transition-colors">
                  {course.title}
                </h4>
                <p className="text-xs text-text-muted mt-1">
                  {course.status === "published" ? "已發佈" : course.status === "draft" ? "草稿" : "已封存"}
                </p>
              </Link>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleRemove(course.id)}
                    className="ml-3 rounded-md p-1.5 text-text-muted transition-colors hover:bg-danger-light hover:text-danger"
                    aria-label={`從方案移除：${course.title}`}
                  >
                    <Trash size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>從方案移除</TooltipContent>
              </Tooltip>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
