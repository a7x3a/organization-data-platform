import React, { useState, useMemo } from 'react';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../hooks/useUsers';
import { useAuth } from '../hooks/useAuth';
import { DataTable, Column } from '../components/DataTable';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/Button';
import { Input, Select } from '../components/Input';
import { User, UserRole } from '@odp/shared-types';
import {
  Plus,
  ShieldCheck,
  ShieldAlert,
  X,
  Pencil,
  Trash2,
  Search,
  Users as UsersIcon,
  Shield,
  CheckCircle,
  UserCheck,
} from 'lucide-react';

const ALL_ROLES: { role: UserRole; label: string; desc: string }[] = [
  { role: UserRole.ADMIN, label: 'Admin', desc: 'Full platform administration & user management' },
  { role: UserRole.COLLECTOR, label: 'Collector', desc: 'Run collections, manage scrapers & upload data' },
];

const ROLE_BADGE_STYLES: Record<string, string> = {
  [UserRole.ADMIN]: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  [UserRole.COLLECTOR]: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

export const Users: React.FC = () => {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.roles.includes(UserRole.ADMIN);

  const { data: users, isLoading } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createUsername, setCreateUsername] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createRoles, setCreateRoles] = useState<UserRole[]>([UserRole.COLLECTOR]);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit Modal state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRoles, setEditRoles] = useState<UserRole[]>([]);
  const [editIsActive, setEditIsActive] = useState(true);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Confirm Dialog state
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  const userList = users || [];

  // Metrics
  const metrics = useMemo(() => {
    const total = userList.length;
    const active = userList.filter((u) => u.isActive).length;
    const adminCount = userList.filter((u) => u.roles.includes(UserRole.ADMIN)).length;
    const collectorCount = userList.filter((u) => u.roles.includes(UserRole.COLLECTOR)).length;

    return { total, active, adminCount, collectorCount };
  }, [userList]);

  const toggleCreateRole = (role: UserRole) => {
    setCreateRoles((prev) =>
      prev.includes(role) ? (prev.length > 1 ? prev.filter((r) => r !== role) : prev) : [...prev, role]
    );
  };

  const toggleEditRole = (role: UserRole) => {
    setEditRoles((prev) =>
      prev.includes(role) ? (prev.length > 1 ? prev.filter((r) => r !== role) : prev) : [...prev, role]
    );
  };

  const handleOpenCreate = () => {
    setCreateUsername('');
    setCreatePassword('');
    setCreateRoles([UserRole.COLLECTOR]);
    setCreateError(null);
    setIsCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    try {
      await createUser.mutateAsync({
        username: createUsername.trim(),
        password: createPassword,
        name: createUsername.trim(),
        roles: createRoles,
      });
      setIsCreateOpen(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setCreateError(e.response?.data?.error || 'Failed to create user account');
    }
  };

  const handleOpenEdit = (u: User) => {
    setEditingUser(u);
    setEditName(u.name);
    setEditEmail(u.email || '');
    setEditPassword('');
    const validRoles = u.roles.filter((r) => r === UserRole.ADMIN || r === UserRole.COLLECTOR);
    setEditRoles(validRoles.length > 0 ? validRoles : [UserRole.COLLECTOR]);
    setEditIsActive(u.isActive);
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditError(null);

    try {
      await updateUser.mutateAsync({
        id: editingUser.id,
        data: {
          name: editName.trim() || undefined,
          email: editEmail.trim() ? editEmail.trim() : null,
          roles: editRoles,
          isActive: editIsActive,
          password: editPassword.trim() ? editPassword : undefined,
        },
      });
      setEditingUser(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setEditError(e.response?.data?.error || 'Failed to update user');
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!userToDelete) return;
    try {
      await deleteUser.mutateAsync(userToDelete.id);
      setUserToDelete(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      alert(e.response?.data?.error || 'Failed to delete user');
    }
  };

  const filteredUsers = useMemo(() => {
    return userList.filter((u) => {
      if (roleFilter && !u.roles.includes(roleFilter as UserRole)) {
        return false;
      }
      if (statusFilter === 'active' && !u.isActive) return false;
      if (statusFilter === 'disabled' && u.isActive) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchUsername = u.username.toLowerCase().includes(q);
        const matchName = u.name?.toLowerCase().includes(q);
        const matchEmail = (u.email || '').toLowerCase().includes(q);
        return matchUsername || matchName || matchEmail;
      }
      return true;
    });
  }, [userList, roleFilter, statusFilter, searchQuery]);

  const columns: Column<User>[] = [
    {
      header: 'User',
      accessor: (u) => (
        <div className="min-w-0">
          <div className="font-semibold text-xs text-[var(--color-text-primary)] flex items-center gap-1.5 truncate">
            <span>{u.name || u.username}</span>
            {u.id === currentUser?.id && (
              <span className="px-1.5 py-0.2 rounded text-[10px] bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] font-mono">
                You
              </span>
            )}
          </div>
          <div className="font-mono text-[11px] text-[var(--color-text-muted)] truncate mt-0.5">
            @{u.username}
          </div>
        </div>
      ),
    },
    {
      header: 'Email',
      accessor: (u) => (
        <span className="text-xs font-mono text-[var(--color-text-muted)] truncate">
          {u.email || '—'}
        </span>
      ),
    },
    {
      header: 'Assigned Roles',
      accessor: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.roles.map((r) => (
            <span
              key={r}
              className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded-md border ${
                r === UserRole.ADMIN
                  ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                  : r === UserRole.COLLECTOR
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-[var(--color-bg-overlay)] text-[var(--color-text-muted)] border-[var(--color-border-subtle)]'
              }`}
            >
              {r}
            </span>
          ))}
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (u) => (
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded-full border ${
            u.isActive
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${u.isActive ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          {u.isActive ? 'Active' : 'Disabled'}
        </span>
      ),
    },
    {
      header: 'Created',
      accessor: (u) => (
        <span className="text-xs font-mono text-[var(--color-text-muted)] whitespace-nowrap">
          {new Date(u.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right pr-3',
      accessor: (u) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={() => handleOpenEdit(u)}
            title="Edit User"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="danger"
            size="sm"
            iconOnly
            onClick={() => setUserToDelete(u)}
            disabled={u.id === currentUser?.id}
            title={u.id === currentUser?.id ? 'Cannot delete own account' : 'Delete User'}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ShieldAlert className="w-10 h-10 text-[var(--color-text-muted)] mb-3" />
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Administrator Access Only</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          User account management is restricted to system administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[var(--color-brand-400)]" />
            User Management
          </h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Manage organization members, access permissions, and role-based security.
          </p>
        </div>
        <Button variant="primary" onClick={handleOpenCreate} className="font-semibold">
          <Plus className="w-4 h-4 mr-1" />
          Add User
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Total Accounts</span>
            <UsersIcon className="w-4 h-4 text-[var(--color-brand-400)]" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[var(--color-text-primary)]">
            {metrics.total}
          </div>
          <span className="text-[11px] text-[var(--color-text-muted)]">Registered team users</span>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Active Accounts</span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[var(--color-text-primary)]">
            {metrics.active}
          </div>
          <span className="text-[11px] text-[var(--color-text-muted)]">Eligible to sign in</span>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Administrators</span>
            <Shield className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[var(--color-text-primary)]">
            {metrics.adminCount}
          </div>
          <span className="text-[11px] text-[var(--color-text-muted)]">Full platform control</span>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Collectors</span>
            <UserCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[var(--color-text-primary)]">
            {metrics.collectorCount}
          </div>
          <span className="text-[11px] text-[var(--color-text-muted)]">Collection & scraper access</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] p-2.5 rounded-xl shadow-xs">
        <div className="relative flex-1 min-w-[240px]">
          <Input
            icon={<Search className="w-4 h-4" />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by username or name..."
          />
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={roleFilter}
            onValueChange={setRoleFilter}
            className="w-36"
            options={[
              { value: '', label: 'All Roles' },
              ...ALL_ROLES.map((r) => ({ value: r.role, label: r.label })),
            ]}
          />
          <Select
            value={statusFilter}
            onValueChange={setStatusFilter}
            className="w-32"
            options={[
              { value: '', label: 'All Status' },
              { value: 'active', label: 'Active' },
              { value: 'disabled', label: 'Disabled' },
            ]}
          />
        </div>
      </div>

      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-2xl)] p-5 shadow-[var(--shadow-card)]">
        <DataTable
          columns={columns}
          data={filteredUsers}
          keyExtractor={(u) => u.id}
          isLoading={isLoading}
          emptyMessage="No users matching the filters."
        />
      </div>

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans">
          <div className="relative w-full max-w-md bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)]">
              <div>
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Add New User</h2>
                <p className="text-[11px] text-[var(--color-text-muted)]">
                  Create a new platform account with username and password.
                </p>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createError && (
              <div className="px-5 pt-3">
                <div className="p-2.5 text-xs rounded-lg bg-[var(--color-error-bg)] text-[var(--color-error-400)] border border-[var(--color-error-400)]/20">
                  {createError}
                </div>
              </div>
            )}

            <form onSubmit={handleCreate} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                    Username <span className="text-red-400">*</span>
                  </label>
                  <Input
                    type="text"
                    required
                    pattern="^[a-zA-Z0-9_\-]+$"
                    value={createUsername}
                    onChange={(e) => setCreateUsername(e.target.value)}
                    placeholder="e.g. jsmith"
                    className="font-mono text-xs"
                  />
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
                    Letters, numbers, underscores, and hyphens only.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                    Password <span className="text-red-400">*</span>
                  </label>
                  <Input
                    type="password"
                    required
                    minLength={8}
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="Min 8 characters"
                    className="text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                    Access Roles & Permissions <span className="text-red-400">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_ROLES.map((r) => {
                      const selected = createRoles.includes(r.role);
                      return (
                        <label
                          key={r.role}
                          onClick={() => toggleCreateRole(r.role)}
                          className={`flex items-start gap-2 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                            selected
                              ? 'bg-[var(--color-brand-500)]/5 border-[var(--color-brand-400)] text-[var(--color-text-primary)]'
                              : 'bg-[var(--color-bg-base)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => {}}
                            className="mt-0.5 rounded text-[var(--color-brand-500)]"
                          />
                          <div>
                            <div className="font-semibold text-xs">{r.label}</div>
                            <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                              {r.desc}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="shrink-0 flex justify-end gap-2 px-5 py-3 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)]">
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={createUser.isPending || createRoles.length === 0}>
                  {createUser.isPending ? 'Creating...' : 'Create User'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans">
          <div className="relative w-full max-w-md bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)]">
              <div>
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Edit User: @{editingUser.username}
                </h2>
                <p className="text-[11px] text-[var(--color-text-muted)]">
                  Update profile, credentials, and access roles.
                </p>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="px-5 pt-3">
                <div className="p-2.5 text-xs rounded-lg bg-[var(--color-error-bg)] text-[var(--color-error-400)] border border-[var(--color-error-400)]/20">
                  {editError}
                </div>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                      Full Name <span className="text-red-400">*</span>
                    </label>
                    <Input
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                      Email Address
                    </label>
                    <Input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="e.g. user@organization.org"
                      className="text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                    Reset Password (Optional)
                  </label>
                  <Input
                    type="password"
                    minLength={8}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Leave blank to keep existing password"
                    className="text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                    Account Status
                  </label>
                  <label className="flex items-center gap-2 p-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-base)] text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editIsActive}
                      onChange={(e) => setEditIsActive(e.target.checked)}
                      disabled={editingUser.id === currentUser?.id}
                      className="accent-[var(--color-brand-500)] cursor-pointer"
                    />
                    <div>
                      <span className="font-semibold text-xs text-[var(--color-text-primary)]">Account Active</span>
                      <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                        {editingUser.id === currentUser?.id
                          ? 'You cannot disable your own active account.'
                          : 'Disabled accounts cannot log in or perform actions.'}
                      </p>
                    </div>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                    Access Roles & Permissions <span className="text-red-400">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_ROLES.map((r) => {
                      const selected = editRoles.includes(r.role);
                      return (
                        <label
                          key={r.role}
                          onClick={() => toggleEditRole(r.role)}
                          className={`flex items-start gap-2 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                            selected
                              ? 'bg-[var(--color-brand-500)]/5 border-[var(--color-brand-400)] text-[var(--color-text-primary)]'
                              : 'bg-[var(--color-bg-base)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => {}}
                            className="mt-0.5 accent-[var(--color-brand-500)] cursor-pointer"
                          />
                          <div>
                            <div className="font-semibold text-xs">{r.label}</div>
                            <div className="text-[10px] opacity-75 mt-0.5 leading-tight">{r.desc}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="shrink-0 flex justify-end gap-2 px-5 py-3 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)]">
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditingUser(null)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={updateUser.isPending || editRoles.length === 0}>
                  {updateUser.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={!!userToDelete}
        title={userToDelete ? `Delete User "${userToDelete.username}"` : 'Delete User'}
        message={
          userToDelete
            ? `Are you sure you want to permanently delete user account "${userToDelete.name}" (@${userToDelete.username})? This action cannot be undone.`
            : ''
        }
        confirmText="Delete Account"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setUserToDelete(null)}
        isLoading={deleteUser.isPending}
      />
    </div>
  );
};
