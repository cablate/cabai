"use client";
import { AppErrorState } from "@/components/ui/states/app-error-state";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) { return <AppErrorState contextLabel="Skills 載入遇到問題" title="Skill 目錄暫時打不開" description="我們不會提供不完整的版本資料，請再試一次。" reset={reset} destinationHref="/skills" destinationLabel="回到 Skills" error={error} errorId={error.digest} surface="public-skills" />; }
