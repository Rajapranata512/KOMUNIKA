'use client';

export function DeleteUserForm({ userId, email }: { userId: string; email: string }) {
  return (
    <form
      action={'/auth/admin-user-delete'}
      method={'post'}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Hapus akun ${email} secara permanen? Sesi dan kredensial akun akan dihapus. Tindakan ini tidak dapat dibatalkan.`,
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      <input type={'hidden'} name={'userId'} value={userId} />
      <button className={'danger-button'} type={'submit'}>
        Hapus akun
      </button>
    </form>
  );
}
