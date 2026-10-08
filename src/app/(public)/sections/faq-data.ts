/**
 * 首頁 FAQ 資料 — 與 faq.tsx 共用，也用於 FAQPage JSON-LD。
 */
export const faqs = [
  {
    q: "沒有 Agent API，也可以使用 CabAI 嗎？",
    a: "可以。你仍然可以在網站上瀏覽公開內容、購買課程並進入會員中心學習。Agent API 是額外提供給 AI 的入口，不是使用 CabAI 的前提。",
  },
  {
    q: "AI 會讀到我沒有購買的課程嗎？",
    a: "不會。公開 Library 與公開 Skill 可以直接讀取；付費課程與其他受保護內容會依 CabAI 帳號權限判斷。Agent API Key 不會繞過購買限制。",
  },
  {
    q: "公告、Library 與 Skill 有什麼不同？",
    a: "公告用來說明最新變化；Library 保存完整指南與參考資料；Skill 則是 AI 可以直接採用的工作方法。公告可以引導 AI 前往對應內容，但不取代內容本身。",
  },
  {
    q: "Agent API Key 要怎麼開始使用？",
    a: "登入後前往 Agent API 設定頁建立 Key，複製頁面提供的 AI 指令與 OpenAPI 文件交給你的工具。Key 只會顯示一次，之後可以撤銷並重新建立。",
  },
];
