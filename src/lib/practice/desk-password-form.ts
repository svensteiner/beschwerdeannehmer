export const SETTINGS_PASSWORD_FORM_ID = "settings-password";
export const SETTINGS_PASSWORD_USERNAME_ID = "settings-password-username";
export const SETTINGS_PASSWORD_CHANGED_TOAST =
  "Passwort geändert. Andere Sitzungen müssen sich neu anmelden.";
export const STAFF_INVITE_FORM_ID = "staff-invite-form";
export const STAFF_RESET_FORM_ID = "staff-reset";
export const LOGIN_RESET_FORM_ID = "login-reset";

export function deskPasswordFormIds() {
  return {
    own: SETTINGS_PASSWORD_FORM_ID,
    username: SETTINGS_PASSWORD_USERNAME_ID,
    changedToast: SETTINGS_PASSWORD_CHANGED_TOAST,
    invite: STAFF_INVITE_FORM_ID,
    reset: STAFF_RESET_FORM_ID,
    loginReset: LOGIN_RESET_FORM_ID,
  };
}
