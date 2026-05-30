import { useVpn } from '../../../context';
import { useLoadUsers, useUserForm, useUserActions } from './hooks';
import {
  UserListHeader,
  UserListTable,
  UserListMessages,
  UserFormHeader,
  UserFormMessages,
  UserFormUsernameInput,
  UserFormPasswordInput,
  UserFormRoleSelector,
  UserFormActions,
} from './components';

export default function UserManagementModule() {
  const { credentials } = useVpn();
  const loadUsers = useLoadUsers();
  const userForm = useUserForm();
  const userActions = useUserActions({ currentUsername: credentials?.user });

  const handleDelete = async (user: typeof loadUsers.users[0]) => {
    const success = await userActions.handleDelete(user, loadUsers.users);
    if (success) {
      loadUsers.loadUsers();
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await userActions.handleSave({
      id: userForm.formId,
      username: userForm.formUsername,
      password: userForm.formPassword,
      role: userForm.formRole,
    });
    if (success) {
      userForm.resetForm();
      userForm.setView('list');
      loadUsers.loadUsers();
    }
  };

  if (userForm.view === 'form') {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
        <UserFormHeader isEdit={!!userForm.formId} onBack={userForm.closeForm} />

        <div className="p-6">
          <UserFormMessages errorMsg={userActions.errorMsg} />

          <form onSubmit={handleSave} className="space-y-6 max-w-lg">
            <UserFormUsernameInput
              value={userForm.formUsername}
              onChange={userForm.setFormUsername}
              autoFocus
            />

            <UserFormPasswordInput
              value={userForm.formPassword}
              onChange={userForm.setFormPassword}
              isEdit={!!userForm.formId}
            />

            <UserFormRoleSelector
              value={userForm.formRole}
              onChange={userForm.setFormRole}
            />

            <UserFormActions
              isEdit={!!userForm.formId}
              isLoading={userActions.isActioning}
              onSubmit={handleSave}
            />
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
      <UserListHeader onInvite={() => userForm.openForm()} />

      <UserListMessages successMsg={userActions.successMsg} />

      <UserListTable
        users={loadUsers.users}
        isLoading={loadUsers.isLoading}
        currentUsername={credentials?.user}
        onEdit={userForm.openForm}
        onDelete={handleDelete}
        isActioning={userActions.isActioning}
      />
    </div>
  );
}
