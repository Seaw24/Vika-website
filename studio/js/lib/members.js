// Adding a person to the team (Nam, 2026-10-21): the checks before the call and the words after it.
// The add-member function makes the login and the members row (supabase/functions/add-member).

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const STUDIO_URL = 'https://vikavn.app/studio/';

export const cleanEmail = (v) => String(v ?? '').trim().toLowerCase();
export const cleanName = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');

// The first problem with the form, or '' when it can go.
export function checkMember(email, name) {
  if (email.length > 254 || !EMAIL.test(email)) return 'Email chưa đúng dạng.';
  if (!name) return 'Nhập tên của người mới.';
  if (name.length > 60) return 'Tên tối đa 60 ký tự.';
  return '';
}

const FAIL = {
  bad_email: 'Email chưa đúng dạng.',
  bad_name: 'Tên cần từ 1 đến 60 ký tự.',
  not_admin: 'Chỉ admin thêm được người vào nhóm.',
  already_member: 'Email này đã ở trong nhóm.',
};
export const failText = (code) => FAIL[code] ?? 'Chưa thêm được. Thử lại nhé.';

// password is null when the email already had a login; that password stays.
export function addedText({ member, password }) {
  return password ? `Đã thêm ${member.name}. Đăng nhập bằng ${member.email}, mật khẩu ${password}.`
    : `Đã thêm ${member.name}. Email này đã có đăng nhập từ trước, nên mật khẩu giữ nguyên.`;
}

// The message the admin copies and sends to the new person.
export function inviteText({ member, password }) {
  const login = password ? `đăng nhập bằng ${member.email}, mật khẩu ${password}` : `đăng nhập bằng ${member.email} với mật khẩu cũ`;
  return `Chào ${member.name}, vào ${STUDIO_URL} rồi ${login}. Sau đó vào Cài đặt, thêm tài khoản Threads của bạn để nhận bài.`;
}
