"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, CloudArrowUp, FloppyDisk, WarningCircle } from "@phosphor-icons/react";
import { updateLesson } from "../../../../actions";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { LessonContentEditor } from "@/components/admin/lesson-content-editor";
import type { LessonResource } from "@/lib/lesson-content";

interface Lesson {
  id: string;
  chapterId: string;
  title: string;
  type: string;
  content: string;
  duration: number | null;
  isPreview: boolean;
  sortOrder: number;
  status: string;
  version: string;
  resources: LessonResource[];
}

interface Props {
  courseId: string;
  lesson: Lesson;
  chapters: { id: string; title: string }[];
}

type SaveState = "saved" | "unsaved" | "saving" | "failed" | "conflict";

export function EditLessonClient({ courseId, lesson, chapters }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const savingRef = useRef(false);
  const editRevisionRef = useRef(0);
  const queuedSaveRef = useRef(false);
  const saveRef = useRef<() => Promise<void>>(async () => undefined);
  const versionRef = useRef(lesson.version);
  const [lessonType, setLessonType] = useState(lesson.type);
  const [content, setContent] = useState(lesson.content);
  const [resources, setResources] = useState<LessonResource[]>(lesson.resources);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(lesson.version);
  const [saveState, setSaveState] = useState<SaveState>("saved");

  const markDirty = useCallback(() => {
    editRevisionRef.current += 1;
    setSaveState((current) => current === "conflict" ? current : "unsaved");
    setError(null);
  }, []);

  const save = useCallback(async () => {
    if (!formRef.current || saveState === "conflict") return;
    if (savingRef.current) {
      queuedSaveRef.current = true;
      return;
    }

    savingRef.current = true;
    const submittedRevision = editRevisionRef.current;
    const formData = new FormData(formRef.current);
    formData.set("expectedVersion", versionRef.current);
    setError(null);
    setSaveState("saving");

    try {
      const result = await updateLesson(lesson.id, formData);
      if (result?.success && result.version) {
        versionRef.current = result.version;
        setVersion(result.version);
        setSaveState(editRevisionRef.current === submittedRevision ? "saved" : "unsaved");
      } else {
        setSaveState(result?.status === "conflict" ? "conflict" : "failed");
        setError(result?.error ?? "儲存失敗");
      }
    } catch (caught) {
      setSaveState("failed");
      setError(caught instanceof Error ? caught.message : "儲存失敗");
    } finally {
      savingRef.current = false;
      if (queuedSaveRef.current || editRevisionRef.current !== submittedRevision) {
        queuedSaveRef.current = false;
        window.setTimeout(() => void saveRef.current(), 0);
      }
    }
  }, [lesson.id, saveState]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    if (saveState !== "unsaved") return;
    const timer = window.setTimeout(() => void saveRef.current(), 1400);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (["unsaved", "saving", "failed", "conflict"].includes(saveState)) {
        event.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveState]);

  function leaveEditor() {
    const unsafe = ["unsaved", "saving", "failed", "conflict"].includes(saveState);
    if (!unsafe || window.confirm("尚有未安全儲存的變更，確定離開？")) {
      router.push(`/admin/courses/${courseId}`);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={(event) => { event.preventDefault(); void saveRef.current(); }}
      onChangeCapture={markDirty}
      className="space-y-6"
    >
      <input type="hidden" name="expectedVersion" value={version} />

      <div className="sticky top-16 z-10 -mx-4 flex flex-col gap-3 border-y border-border-subtle bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-2 text-sm" aria-live="polite">
          {saveState === "saved" && <CheckCircle size={18} weight="fill" className="text-success" />}
          {saveState === "saving" && <CloudArrowUp size={18} className="text-text-muted" />}
          {(saveState === "failed" || saveState === "conflict") && <WarningCircle size={18} weight="fill" className="text-danger" />}
          <span className={saveState === "saved" ? "text-success" : saveState === "failed" || saveState === "conflict" ? "text-danger" : "text-text-secondary"}>
            {saveState === "saved" && "所有變更已儲存"}
            {saveState === "unsaved" && "有尚未儲存的變更"}
            {saveState === "saving" && "正在儲存…"}
            {saveState === "failed" && "儲存失敗，可重試"}
            {saveState === "conflict" && "其他頁面已有較新的版本"}
          </span>
        </div>
        <Button type="submit" size="sm" disabled={saveState === "saved" || saveState === "conflict"} loading={saveState === "saving"}>
          <FloppyDisk size={15} />儲存
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Input name="title" label="課堂標題" required defaultValue={lesson.title} />
        <Select name="chapterId" label="所屬章節" required defaultValue={lesson.chapterId}>
          {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
        </Select>
        <Select name="type" label="類型" required value={lessonType} onChange={(event) => setLessonType(event.target.value)}>
          <option value="video">影片</option>
          <option value="text">文字</option>
          <option value="pdf">PDF</option>
          <option value="download">下載</option>
        </Select>
        <input type="hidden" name="sortOrder" value={lesson.sortOrder} />
        <Select name="status" label="發布狀態" defaultValue={lesson.status}>
          <option value="draft">草稿</option>
          <option value="published">已發布</option>
        </Select>
      </div>

      <LessonContentEditor
        type={lessonType}
        value={content}
        onChange={(value) => { setContent(value); markDirty(); }}
        resources={resources}
        onResourcesChange={(value) => { setResources(value); markDirty(); }}
      />

      <div className="flex items-center gap-6">
        {lessonType === "video" && <Input name="duration" label="時長（秒）" type="number" className="w-40" defaultValue={lesson.duration ?? ""} />}
        <CheckboxField name="isPreview" label="免費預覽" defaultChecked={lesson.isPreview} containerClassName="pt-4" />
      </div>

      {error && <div role="alert" className="rounded-lg border border-danger/20 bg-danger-light px-4 py-3"><p className="text-sm text-danger">{error}</p></div>}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={saveState === "saving"} disabled={saveState === "saved" || saveState === "conflict"}>儲存變更</Button>
        <Button type="button" variant="ghost" onClick={leaveEditor}>返回課程</Button>
      </div>
    </form>
  );
}
