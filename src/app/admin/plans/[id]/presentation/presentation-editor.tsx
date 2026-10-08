"use client";

import { useState, useCallback, useEffect } from "react";

import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft } from "@phosphor-icons/react";
import type { Plan, PlanPresentation } from "@/lib/db/schema";
import {
  savePresentationAction,
  publishPresentationAction,
  unpublishPresentationAction,
} from "./actions";
import OfferingTypeSelector from "./offering-type-selector";
import CommonFieldsSection from "./common-fields-section";
import MetadataByType from "./metadata-by-type";
import FeaturedSection from "./featured-section";
import PreviewPane from "./preview-pane";
import SaveBar from "./save-bar";
import ValidationSummary from "./validation-summary";

interface PresentationEditorProps {
  plan: Plan;
  initialPresentation: PlanPresentation | null;
}

// Initial form state from presentation or defaults
function getInitialFormData(
  presentation: PlanPresentation | null
): Record<string, unknown> {
  if (!presentation) {
    return {
      offeringType: "course",
      title: "",
      subtitle: "",
      description: "",
      coverImage: "",
      bannerImage: "",
      ctaLabel: "了解更多",
      metadata: null,
      trustNotes: null,
      isFeatured: false,
      featuredSortOrder: null,
    };
  }

  return {
    offeringType: presentation.offeringType,
    title: presentation.title,
    subtitle: presentation.subtitle || "",
    description: presentation.description || "",
    coverImage: presentation.coverImage || "",
    bannerImage: presentation.bannerImage || "",
    ctaLabel: presentation.ctaLabel || "了解更多",
    metadata: presentation.metadataJson || null,
    trustNotes: presentation.trustNotesJson || null,
    isFeatured: presentation.isFeatured,
    featuredSortOrder: presentation.featuredSortOrder || null,
  };
}

export default function PresentationEditor({
  plan,
  initialPresentation,
}: PresentationEditorProps) {
  // Form state
  const [formData, setFormData] = useState<Record<string, unknown>>(
    getInitialFormData(initialPresentation)
  );
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublished, setIsPublished] = useState(
    initialPresentation?.publishedAt !== null &&
      initialPresentation?.publishedAt !== undefined
  );
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Handle field change
  const handleFieldChange = useCallback((name: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setIsDirty(true);

    // Clear error for this field when user starts typing
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  }, []);

  // Handle metadata change (nested object)
  const handleMetadataChange = useCallback(
    (metadata: Record<string, unknown>) => {
      setFormData((prev) => ({ ...prev, metadata }));
      setIsDirty(true);
      setErrors((prev) => ({ ...prev, metadata: undefined }));
    },
    []
  );

  // Validate basic fields on client side
  const validateFormData = useCallback(() => {
    const newErrors: Record<string, string | undefined> = {};

    if (!formData.title || typeof formData.title !== "string") {
      newErrors.title = "標題為必填";
    }

    if (
      !formData.offeringType ||
      typeof formData.offeringType !== "string"
    ) {
      newErrors.offeringType = "請選擇服務類型";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!validateFormData()) {
      toast.error("請修正表單錯誤");
      return;
    }

    setIsSaving(true);

    try {
      const result = await savePresentationAction(plan.id, formData);

      if (result.success) {
        toast.success("已保存");
        setIsDirty(false);
        // Reset form to new state
        const updatedForm = { ...formData };
        setFormData(updatedForm);
      } else {
        toast.error(`保存失敗: ${result.error || "未知錯誤"}`);
      }
    } finally {
      setIsSaving(false);
    }
  }, [formData, plan.id, validateFormData]);

  // Handle discard
  const handleDiscard = useCallback(() => {
    if (!showDiscardConfirm) {
      setShowDiscardConfirm(true);
      return;
    }

    // Reset form to initial state
    setFormData(getInitialFormData(initialPresentation));
    setErrors({});
    setIsDirty(false);
    setShowDiscardConfirm(false);
  }, [showDiscardConfirm, initialPresentation]);

  // Handle publish / unpublish
  const handleTogglePublish = useCallback(async () => {
    if (isDirty) {
      toast.error("請先儲存變更再發佈");
      return;
    }
    if (!initialPresentation) {
      toast.error("請先儲存一次再發佈");
      return;
    }
    setIsPublishing(true);
    try {
      const action = isPublished
        ? unpublishPresentationAction
        : publishPresentationAction;
      const result = await action(plan.id);
      if (result.success) {
        setIsPublished(!isPublished);
        toast.success(isPublished ? "已取消發佈" : "已發佈");
      } else {
        toast.error(result.error || "操作失敗");
      }
    } finally {
      setIsPublishing(false);
    }
  }, [isDirty, isPublished, plan.id, initialPresentation]);

  // Warn on navigation if dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const hasErrors = Object.values(errors).some((e) => e !== undefined);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border-subtle bg-surface px-6 py-4 sticky top-0 z-20">
        <div className="mx-auto max-w-6xl">
          <Link prefetch={false}
            href={`/admin/plans/${plan.id}`}
            className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-2"
          >
            <ArrowLeft size={16} />
            返回詳情
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-text-primary">
                編輯 {(initialPresentation?.title || plan.name)} 前台展示
              </h1>
              <p className="text-sm text-text-muted mt-1">
                NT${plan.amount} ({plan.billingPeriod})
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  isPublished
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {isPublished ? "已發佈" : "草稿"}
              </span>
              <button
                onClick={handleTogglePublish}
                disabled={isPublishing || isDirty}
                className={`rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                  isPublished
                    ? "border border-border-subtle text-text-secondary hover:bg-surface-muted"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {isPublishing
                  ? "處理中..."
                  : isPublished
                    ? "取消發佈"
                    : "發佈"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Form */}
          <div className="lg:col-span-2 space-y-6 pb-24">
            {/* Validation Summary */}
            <ValidationSummary errors={errors} />

            {/* Offering Type Selector */}
            <OfferingTypeSelector
              value={
                (formData.offeringType as
                  | "course"
                  | "lecture"
                  | "free_event"
                  | "offline_event"
                  | "service"
                  | "membership"
                  | "download") || "course"
              }
              onChange={(type) => handleFieldChange("offeringType", type)}
            />

            {/* Common Fields */}
            <CommonFieldsSection
              formData={formData}
              errors={errors}
              onChange={handleFieldChange}
            />

            {/* Type-Specific Metadata */}
            <MetadataByType
              offeringType={
                (formData.offeringType as
                  | "course"
                  | "lecture"
                  | "free_event"
                  | "offline_event"
                  | "service"
                  | "membership"
                  | "download") || "course"
              }
              metadata={formData.metadata as Record<string, unknown> | null}
              onChange={handleMetadataChange}
            />

            {/* Featured Section */}
            <FeaturedSection
              isFeatured={formData.isFeatured === true}
              sortOrder={
                typeof formData.featuredSortOrder === "number"
                  ? formData.featuredSortOrder
                  : null
              }
              onIsFeaturedChange={(value) =>
                handleFieldChange("isFeatured", value)
              }
              onSortOrderChange={(value) =>
                handleFieldChange("featuredSortOrder", value)
              }
            />
          </div>

          {/* Right Column - Preview */}
          <div className="lg:col-span-1">
            <PreviewPane formData={formData} plan={plan} />
          </div>
        </div>
      </div>

      {/* Save Bar */}
      {isDirty && (
        <SaveBar
          isSaving={isSaving}
          hasErrors={hasErrors}
          onSave={handleSave}
          onDiscard={handleDiscard}
          showConfirm={showDiscardConfirm}
        />
      )}
    </div>
  );
}
