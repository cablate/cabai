import type { PlanPresentation } from "@/lib/db/schema";
import type { DeliveryOverview } from "@/lib/delivery";
import type { OfferingType } from "@/lib/validations/plan-presentations";
import { BookOpen, FileText, Plugs } from "@phosphor-icons/react/dist/ssr";

export interface CheckoutDeliveryExpectationProps {
  presentation: PlanPresentation | null;
  delivery: DeliveryOverview;
}

/**
 * Type-aware delivery expectation message.
 * Shows what user will receive after successful purchase.
 */
export function CheckoutDeliveryExpectation({
  presentation,
  delivery,
}: CheckoutDeliveryExpectationProps) {
  const offeringType = presentation?.offeringType;
  const visibleCourses = delivery.courses.slice(0, 3);
  const remainingCourseCount = delivery.courses.length - visibleCourses.length;
  const activeServices = delivery.services.filter((service) => service.isActive);

  const messages: Record<OfferingType, string> = {
    course:
      "購買完成後，請前往會員中心查看目前已開放的課程內容與學習資源。",
    lecture:
      "購買完成後，請前往會員中心查看目前可用的講座資訊與報名狀態。",
    free_event:
      "報名完成後，請前往會員中心查看目前可用的活動資訊。",
    offline_event:
      "購票完成後，請前往會員中心查看目前可用的票券與入場資訊。",
    service:
      "購買完成後，請前往會員中心查看目前的服務資訊與後續安排。",
    membership:
      "訂閱完成後，請前往會員中心查看目前已開放的會員權益、內容與訂閱狀態。",
    download:
      "購買完成後，可用檔案與取得方式會顯示在會員中心。",
  };

  const message = offeringType
    ? messages[offeringType]
    : "付款完成並通過確認後，已設定的內容會開通至你的會員中心。";

  return (
    <section aria-labelledby="checkout-delivery-heading" className="rounded-2xl border border-border-subtle bg-surface p-5 sm:p-6">
      <div>
        <p className="text-xs font-medium text-text-muted">交付內容</p>
        <h2 id="checkout-delivery-heading" className="mt-1 text-lg font-semibold text-text-primary">
          付款後會開通什麼
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary [text-wrap:pretty]">{message}</p>
      </div>

      {delivery.hasDelivery ? (
        <div className="mt-5 space-y-3 border-t border-border-subtle pt-5">
          {visibleCourses.map((course) => (
            <DeliveryItem
              key={course.id}
              icon={<BookOpen size={18} weight="duotone" aria-hidden="true" />}
              title={course.title}
              detail={`${course.lessonCount} 堂課`}
            />
          ))}
          {remainingCourseCount > 0 ? (
            <DeliveryItem
              icon={<BookOpen size={18} weight="duotone" aria-hidden="true" />}
              title={`另外 ${remainingCourseCount} 門課程`}
              detail="完成付款後一併開通"
            />
          ) : null}
          {delivery.contentCount > 0 ? (
            <DeliveryItem
              icon={<FileText size={18} weight="duotone" aria-hidden="true" />}
              title={`${delivery.contentCount} 個檔案或站內內容`}
              detail={delivery.contents.slice(0, 2).map((content) => content.title).join("、")}
            />
          ) : null}
          {activeServices.length > 0 ? (
            <DeliveryItem
              icon={<Plugs size={18} weight="duotone" aria-hidden="true" />}
              title={`${activeServices.length} 個服務項目`}
              detail={activeServices.slice(0, 2).map((service) => service.serviceName).join("、")}
            />
          ) : null}
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-border-subtle bg-surface-muted/45 p-4 text-xs leading-5 text-text-muted">
          此商品目前沒有可另外列出的站內交付項目；付款前如需確認細節，請返回商品頁查看完整說明。
        </p>
      )}
    </section>
  );
}

function DeliveryItem({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl bg-surface-muted/45 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-accent ring-1 ring-border-subtle">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{title}</p>
        <p className="mt-0.5 text-xs text-text-muted">{detail}</p>
      </div>
    </div>
  );
}
