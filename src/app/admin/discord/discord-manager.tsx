"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Trash,
  DiscordLogo,
  LinkBreak,
  Warning,
  CheckCircle,
} from "@phosphor-icons/react";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  createRoleMappingAction,
  deleteRoleMappingAction,
  unlinkUserDiscordAction,
  fetchDiscordGuildRoles,
  syncDiscordRolesForPlanAction,
  updateDefaultDiscordRoleAction,
} from "./actions";

interface RoleMapping {
  id: string;
  planId: string;
  planName: string;
  roleId: string;
  roleName: string | null;
  createdAt: string;
}

interface LinkedUser {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  discordId: string;
  discordUsername: string | null;
  linkedAt: string;
}

interface Plan {
  id: string;
  name: string;
}

interface Props {
  mappings: RoleMapping[];
  linkedUsers: LinkedUser[];
  plans: Plan[];
  configured: boolean;
  defaultRoleId: string | null;
}

function useDiscordRoles() {
  return useQuery({
    queryKey: ["admin", "discord", "guild-roles"],
    queryFn: fetchDiscordGuildRoles,
    enabled: false,
    staleTime: 5 * 60_000,
  });
}

export function DiscordManager({ mappings, linkedUsers, plans, configured, defaultRoleId }: Props) {
  return (
    <div className="space-y-8">
      {/* Configuration status */}
      {!configured && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <Warning size={20} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-medium text-amber-800">Discord 整合尚未設定</p>
            <p className="mt-1 text-xs text-amber-600">
              需要設定環境變數：DISCORD_BOT_TOKEN、DISCORD_GUILD_ID、DISCORD_CLIENT_ID、DISCORD_CLIENT_SECRET、DISCORD_REDIRECT_URI
            </p>
          </div>
        </div>
      )}

      {configured && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle size={20} className="text-emerald-600" />
          <p className="text-sm font-medium text-emerald-700">Discord 整合已設定</p>
        </div>
      )}

      {/* Default Free Member Role */}
      {configured && <DefaultRoleSection defaultRoleId={defaultRoleId} />}

      {/* Role Mappings */}
      <RoleMappingsSection mappings={mappings} plans={plans} />

      {/* Linked Users */}
      <LinkedUsersSection linkedUsers={linkedUsers} />
    </div>
  );
}

// ─── Default Free Member Role ───

function DefaultRoleSection({
  defaultRoleId,
}: {
  defaultRoleId: string | null;
}) {
  const rolesQuery = useDiscordRoles();
  const discordRoles = rolesQuery.data?.roles ?? [];
  const [selectedRoleId, setSelectedRoleId] = useState(defaultRoleId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadDiscordRoles() {
    setError(null);
    const { data: result } = await rolesQuery.refetch();
    if (!result) return;
    if (result.error) {
      setError(result.error);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    const result = await updateDefaultDiscordRoleAction(selectedRoleId);
    setSaving(false);
    if (result.success) {
      setSuccess("已儲存");
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(result.error ?? "儲存失敗");
    }
  }

  async function handleClear() {
    if (!confirm("確定要清除預設免費會員角色設定？")) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    const result = await updateDefaultDiscordRoleAction("");
    setSaving(false);
    if (result.success) {
      setSelectedRoleId("");
      setSuccess("已清除");
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(result.error ?? "清除失敗");
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200/60 bg-white">
      <div className="border-b border-zinc-200/60 px-6 py-4">
        <h2 className="text-base font-semibold text-zinc-925">預設免費會員角色</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          所有連結 Discord 的使用者（無論有無購買）會自動獲得此角色
        </p>
      </div>
      <div className="px-6 py-4">
        {defaultRoleId && discordRoles.length === 0 && (
          <div className="mb-3 rounded-md bg-zinc-50 px-3 py-2">
            <p className="text-xs text-zinc-600">
              目前預設角色 ID：<span className="font-mono text-zinc-800">{defaultRoleId}</span>
            </p>
          </div>
        )}
        <div className="flex items-start gap-3">
          {discordRoles.length > 0 ? (
            <select
              value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value)}
              className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 focus:border-zinc-400 focus:outline-none"
            >
              <option value="">選擇 Discord 角色</option>
              {discordRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={loadDiscordRoles}
              disabled={rolesQuery.isFetching}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-50 disabled:opacity-50"
            >
              {rolesQuery.isFetching ? "載入角色中..." : "載入 Discord 角色清單"}
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        {success && <p className="mt-2 text-xs text-emerald-600">{success}</p>}
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !selectedRoleId}
            className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            {saving ? "儲存中..." : "儲存"}
          </button>
          {defaultRoleId && (
            <button
              onClick={handleClear}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50"
            >
              清除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Role Mappings ───

function RoleMappingsSection({
  mappings,
  plans,
}: {
  mappings: RoleMapping[];
  plans: Plan[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [planId, setPlanId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rolesQuery = useDiscordRoles();
  const discordRoles = rolesQuery.data?.roles ?? [];

  // All plans available for mapping (one plan can have multiple roles)
  const availablePlans = plans;

  async function loadDiscordRoles() {
    const { data: result } = await rolesQuery.refetch();
    if (!result) return;
    if (result.error) {
      setError(result.error);
    }
  }

  async function handleCreate() {
    if (!planId || !roleId) return;
    setLoading(true);
    setError(null);
    const selectedRole = discordRoles.find((r) => r.id === roleId);
    const result = await createRoleMappingAction(planId, roleId, selectedRole?.name ?? "");
    setLoading(false);
    if (result.success) {
      setPlanId("");
      setRoleId("");
      setShowForm(false);
    } else {
      setError(result.error ?? "建立失敗");
    }
  }

  async function handleDelete(mappingId: string) {
    if (!confirm("確定要刪除此角色映射？")) return;
    await deleteRoleMappingAction(mappingId);
  }

  return (
    <div className="rounded-2xl border border-zinc-200/60 bg-white">
      <div className="flex items-center justify-between border-b border-zinc-200/60 px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-925">角色映射</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            設定 Plan 與 Discord Role 的對應關係
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              setShowForm(true);
              if (discordRoles.length === 0) loadDiscordRoles();
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-800"
          >
            <Plus size={14} />
            新增映射
          </button>
        )}
      </div>

      {showForm && (
        <div className="border-b border-zinc-200/60 bg-zinc-50/50 px-6 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 focus:border-zinc-400 focus:outline-none"
            >
              <option value="">選擇 Plan</option>
              {availablePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {discordRoles.length > 0 ? (
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 focus:border-zinc-400 focus:outline-none"
              >
                <option value="">選擇 Discord 角色</option>
                {discordRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            ) : (
              <button
                type="button"
                onClick={loadDiscordRoles}
                disabled={rolesQuery.isFetching}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-50 disabled:opacity-50"
              >
                {rolesQuery.isFetching ? "載入角色中..." : "點擊載入 Discord 角色清單"}
              </button>
            )}
          </div>
          {error && (
            <p className="mt-2 text-xs text-red-600">{error}</p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleCreate}
              disabled={loading || !planId || !roleId}
              className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              {loading ? "建立中..." : "建立"}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
              className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {mappings.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <DiscordLogo size={32} className="mx-auto text-zinc-300" />
          <p className="mt-3 text-sm text-zinc-500">尚未建立角色映射</p>
          <p className="mt-1 text-xs text-zinc-400">
            建立映射後，購買對應 Plan 的使用者將自動獲得 Discord 角色
          </p>
        </div>
      ) : (
        <MappingsByPlan mappings={mappings} onDelete={handleDelete} />
      )}
    </div>
  );
}

// ─── Mappings grouped by Plan ───

function MappingsByPlan({
  mappings,
  onDelete,
}: {
  mappings: RoleMapping[];
  onDelete: (id: string) => void;
}) {
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Group by planId
  const grouped = mappings.reduce<Record<string, RoleMapping[]>>((acc, m) => {
    (acc[m.planId] ??= []).push(m);
    return acc;
  }, {});

  async function handleSync(planId: string) {
    setSyncing(planId);
    setSyncResult(null);
    const result = await syncDiscordRolesForPlanAction(planId);
    setSyncing(null);
    if (result.success) {
      setSyncResult(`已同步 ${result.synced} 位用戶`);
      setTimeout(() => setSyncResult(null), 3000);
    } else {
      setSyncResult(result.error ?? "同步失敗");
    }
  }

  return (
    <div className="divide-y divide-zinc-200/60">
      {Object.entries(grouped).map(([planId, roles]) => (
        <div key={planId} className="px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-zinc-925">
              {roles[0]!.planName}
            </p>
            <button
              onClick={() => handleSync(planId)}
              disabled={syncing === planId}
              className="text-[11px] font-medium text-zinc-500 transition-colors hover:text-zinc-700 disabled:opacity-50"
            >
              {syncing === planId ? "同步中..." : "同步 Roles"}
            </button>
          </div>
          <div className="space-y-1">
            {roles.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2"
              >
                <p className="text-xs text-zinc-600">
                  {m.roleName || m.roleId}
                  <span className="ml-2 text-zinc-400">({m.roleId})</span>
                </p>
                <button
                  onClick={() => onDelete(m.id)}
                  className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  title="刪除映射"
                >
                  <Trash size={14} />
                </button>
              </div>
            ))}
          </div>
          {syncResult && syncing === null && (
            <p className="mt-1 text-xs text-emerald-600">{syncResult}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Linked Users ───

function LinkedUsersSection({
  linkedUsers,
}: {
  linkedUsers: LinkedUser[];
}) {
  async function handleUnlink(linkId: string) {
    if (!confirm("確定要解除此使用者的 Discord 連結？")) return;
    await unlinkUserDiscordAction(linkId);
  }

  const linkedUserColumns: Column<LinkedUser>[] = [
    {
      key: "user",
      header: "使用者",
      cell: (u) => (
        <div>
          <p className="text-sm font-medium text-zinc-925">
            {u.userName || u.userEmail || "—"}
          </p>
          <p className="text-xs text-zinc-500">{u.userEmail}</p>
        </div>
      ),
      searchValue: (u) => `${u.userEmail ?? ""} ${u.userName ?? ""}`,
    },
    {
      key: "discord",
      header: "Discord",
      cell: (u) => (
        <div className="flex items-center gap-1.5">
          <DiscordLogo size={14} weight="fill" className="text-indigo-500" />
          <span className="text-sm">{u.discordUsername || u.discordId}</span>
        </div>
      ),
      searchValue: (u) => `${u.discordUsername ?? ""} ${u.discordId}`,
    },
    {
      key: "linkedAt",
      header: "連結時間",
      cell: (u) => (
        <span className="text-xs text-zinc-500">
          {new Date(u.linkedAt).toLocaleDateString("zh-TW")}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      cell: (u) => (
        <button
          onClick={() => handleUnlink(u.id)}
          className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500"
          title="解除連結"
        >
          <LinkBreak size={16} />
        </button>
      ),
      className: "w-12",
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-zinc-925">
          已連結帳號
          <span className="ml-2 text-sm font-normal text-zinc-400">
            ({linkedUsers.length})
          </span>
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          已連結 Discord 的使用者會在購買後自動取得對應角色
        </p>
      </div>
      <DataTable
        data={linkedUsers}
        getRowKey={(u) => u.id}
        pageSize={10}
        searchPlaceholder="搜尋 email 或 Discord 名稱..."
        emptyMessage="尚無使用者連結 Discord 帳號"
        columns={linkedUserColumns}
      />
    </div>
  );
}
