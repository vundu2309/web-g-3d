import { HubError } from "../hub/model";
export function firebaseAccountError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    "auth/invalid-credential": "Email hoặc mật khẩu không đúng.",
    "auth/wrong-password": "Email hoặc mật khẩu không đúng.",
    "auth/user-not-found": "Email hoặc mật khẩu không đúng.",
    "auth/email-already-in-use":
      "Email này đã có tài khoản. Hãy đăng nhập hoặc đặt lại mật khẩu.",
    "auth/invalid-email": "Địa chỉ email chưa hợp lệ.",
    "auth/weak-password": "Mật khẩu cần ít nhất 6 ký tự.",
    "auth/password-does-not-meet-requirements":
      "Mật khẩu chưa đáp ứng chính sách của game. Hãy dùng mật khẩu dài hơn, có chữ hoa, chữ thường và số.",
    "auth/too-many-requests":
      "Bạn đã thử quá nhiều lần. Hãy đợi một lúc rồi thử lại.",
    "auth/network-request-failed":
      "Không kết nối được dịch vụ đăng nhập. Kiểm tra mạng rồi thử lại.",
    "auth/operation-not-allowed":
      "Chưa bật Email/Password trong Firebase Authentication.",
    "auth/admin-restricted-operation":
      "Email/Password chưa được phép trong Firebase Authentication.",
    "auth/user-disabled": "Tài khoản đã bị vô hiệu hóa.",
  };
  return error instanceof HubError
    ? error.message
    : messages[code || ""] || "Không hoàn tất được thao tác. Hãy thử lại.";
}
