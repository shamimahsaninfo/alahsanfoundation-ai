export const ADMIN_EMAIL = "alahsanfoundation.info@gmail.com";
export const isAdminEmail = (e?: string | null) => (e ?? "").toLowerCase() === ADMIN_EMAIL;
