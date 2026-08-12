import React, { useState } from 'react';
import { useUsers, useCreateUser } from '../hooks/useUsers';
import { useAuth } from '../hooks/useAuth';
import { DataTable, Column } from '../components/DataTable';
import { User, UserRole } from '@odp/shared-types';
import { Plus, ShieldCheck, ShieldAlert } from 'lucide-react';

const ALL_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.DATA_MANAGER,
  UserRole.COLLECTOR,
  UserRole.REVIEWER,
  UserRole.ML_ENGINEER,
  UserRole.RESEARCHER,
];

export const Users: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.roles.includes(UserRole.ADMIN);

  // The API also enforces this — this just avoids showing a management UI
  // that would 403 on every action for non-admins.
  const { data: users, isLoading } = useUsers();
  const createUser = useCreateUser();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [roles, setRoles] = useState<UserRole[]>([UserRole.COLLECTOR]);
  const [error, setError] = useState<string | null>(null);

  const toggleRole = (role: UserRole) => {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createUser.mutateAsync({ username, password, name, roles });
      setIsModalOpen(false);
      setUsername('');
      setPassword('');
      setName('');
      setRoles([UserRole.COLLECTOR]);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Failed to create user');
    }
  };

  const columns: Column<User>[] = [
    {
      header: 'Username',
      accessor: (u) => <span className="font-mono text-sm text-[var(--color-text-primary)]">{u.username}</span>,
    },
    { header: 'Name', accessor: (u) => u.name },
    {
      header: 'Roles',
      accessor: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.roles.map((r) => (
            <span
              key={r}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono bg-[var(--color-brand-900)]/40 text-[var(--color-brand-300)] border border-[var(--color-brand-500)]/30"
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
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            u.isActive
              ? 'bg-[var(--color-success-bg)] text-[var(--color-success-400)]'
              : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)]'
          }`}
        >
          {u.isActive ? 'Active' : 'Disabled'}
        </span>
      ),
    },
  ];

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ShieldAlert className="w-10 h-10 text-[var(--color-text-muted)] mb-3" />
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Admins only</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Ask an admin to create or manage accounts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[var(--color-brand-400)]" />
            Users
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Create accounts and assign what they can do — scrape/upload (Collector), manage sources
            (Data Manager), or full access (Admin).
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-brand-600)] text-white text-sm font-medium rounded-[var(--radius-md)] hover:bg-[var(--color-brand-500)] transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Create User
        </button>
      </div>

      <DataTable
        columns={columns}
        data={users || []}
        keyExtractor={(u) => u.id}
        isLoading={isLoading}
        emptyMessage="No users yet."
      />

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] p-6 max-w-lg w-full shadow-[var(--shadow-elevated)]">
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Create User</h2>

            {error && (
              <div className="mt-3 p-3 bg-[var(--color-error-bg)] border border-[var(--color-error-500)]/30 rounded-[var(--radius-md)] text-xs text-[var(--color-error-400)]">
                {error}
              </div>
            )}

            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  pattern="^[a-zA-Z0-9_\-]+$"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="jsmith"
                  className="w-full px-3 py-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm font-mono text-[var(--color-text-primary)] focus:border-[var(--color-brand-500)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  Full name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm text-[var(--color-text-primary)] focus:border-[var(--color-brand-500)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm text-[var(--color-text-primary)] focus:border-[var(--color-brand-500)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                  Roles — what this account can do
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_ROLES.map((role) => (
                    <label
                      key={role}
                      className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-base)] text-xs font-mono cursor-pointer hover:border-[var(--color-brand-500)]/50"
                    >
                      <input
                        type="checkbox"
                        checked={roles.includes(role)}
                        onChange={() => toggleRole(role)}
                        className="accent-[var(--color-brand-500)]"
                      />
                      {role}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-overlay)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createUser.isPending || roles.length === 0}
                  className="px-4 py-2 bg-[var(--color-brand-600)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:bg-[var(--color-brand-500)] transition-colors disabled:opacity-50"
                >
                  {createUser.isPending ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
