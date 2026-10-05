import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "es" | "en";
const STORAGE_KEY = "eurekup_lang";

const dict = {
  es: {
    "nav.chats": "Chats",
    "nav.contacts": "Contactos",
    "nav.storage": "Archivos",
    "nav.settings": "Ajustes",
    "auth.welcome": "Bienvenido",
    "auth.create": "Crea tu cuenta",
    "auth.signinSub": "Accede para continuar",
    "auth.signupSub": "Empieza con 5 GB gratis",
    "auth.name": "Nombre",
    "auth.namePh": "Tu nombre",
    "auth.email": "Email",
    "auth.password": "Contraseña",
    "auth.passwordPh": "Tu contraseña",
    "auth.passwordNewPh": "Mínimo 8 caracteres",
    "auth.mustContain": "Tu contraseña debe contener",
    "auth.ruleLength": "Al menos 8 caracteres",
    "auth.ruleUpper": "Una letra mayúscula (A–Z)",
    "auth.ruleLower": "Una letra minúscula (a–z)",
    "auth.ruleNumber": "Un número (0–9)",
    "auth.referral": "Código de referido",
    "auth.referralHint": "(opcional, +1 GB para tu amigo)",
    "auth.signin": "Entrar",
    "auth.signup": "Crear cuenta",
    "auth.noAccount": "¿No tienes cuenta?",
    "auth.haveAccount": "¿Ya tienes cuenta?",
    "auth.register": "Regístrate",
    "auth.login": "Inicia sesión",
    "auth.forgot": "¿Has olvidado tu contraseña?",
    "auth.forgotTitle": "Recuperar contraseña",
    "auth.forgotSub": "Te enviaremos un enlace para restablecerla.",
    "auth.sendLink": "Enviar enlace",
    "auth.linkSent": "Revisa tu correo para continuar.",
    "auth.show": "Mostrar contraseña",
    "auth.hide": "Ocultar contraseña",
    "auth.back": "Volver",
    "auth.resetTitle": "Nueva contraseña",
    "auth.resetSave": "Guardar contraseña",
    "auth.resetDone": "Contraseña actualizada.",
    "auth.resetInvalid": "El enlace no es válido o ha caducado.",
    "common.cancel": "Cancelar",
    "common.close": "Cerrar",
    "common.confirm": "Confirmar",
    "chat.empty": "Aún no hay mensajes. Escribe el primero.",
    "chat.placeholder": "Escribe un mensaje…",
    "chat.editPlaceholder": "Edita tu mensaje…",
    "chat.editing": "Editando mensaje",
    "chat.deleted": "Mensaje eliminado",
    "chat.edited": "(editado)",
    "chat.copy": "Copiar",
    "chat.forward": "Reenviar",
    "chat.edit": "Editar",
    "chat.delete": "Eliminar",
    "chat.download": "Descargar",
    "chat.move": "Mover a carpeta",
    "chat.saveEurekup": "Guardar en EurekUp",
    "chat.online": "En línea",
    "chat.offline": "Desconectado",
    "chat.lastSeen": "Últ. vez",
    "chat.schedule": "Programar mensaje",
    "chat.scheduleHint": "Mantén pulsado o clic derecho en enviar para programar.",
    "chat.scheduledFor": "Programado para",
    "chat.scheduledOk": "Mensaje programado",
    "chat.scheduleFuture": "Elige una fecha futura",
    "chat.pending": "Pendiente",
    "settings.language": "Idioma",
    "settings.langUpdated": "Idioma actualizado",
    "settings.soon": "Disponible próximamente",
  },
  en: {
    "nav.chats": "Chats",
    "nav.contacts": "Contacts",
    "nav.storage": "Files",
    "nav.settings": "Settings",
    "auth.welcome": "Welcome back",
    "auth.create": "Create your account",
    "auth.signinSub": "Sign in to continue",
    "auth.signupSub": "Start with 5 GB free",
    "auth.name": "Name",
    "auth.namePh": "Your name",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.passwordPh": "Your password",
    "auth.passwordNewPh": "At least 8 characters",
    "auth.mustContain": "Your password must contain",
    "auth.ruleLength": "At least 8 characters",
    "auth.ruleUpper": "One uppercase letter (A–Z)",
    "auth.ruleLower": "One lowercase letter (a–z)",
    "auth.ruleNumber": "One number (0–9)",
    "auth.referral": "Referral code",
    "auth.referralHint": "(optional, +1 GB for your friend)",
    "auth.signin": "Sign in",
    "auth.signup": "Create account",
    "auth.noAccount": "No account yet?",
    "auth.haveAccount": "Already have an account?",
    "auth.register": "Sign up",
    "auth.login": "Sign in",
    "auth.forgot": "Forgot your password?",
    "auth.forgotTitle": "Reset password",
    "auth.forgotSub": "We'll email you a link to reset it.",
    "auth.sendLink": "Send link",
    "auth.linkSent": "Check your inbox to continue.",
    "auth.show": "Show password",
    "auth.hide": "Hide password",
    "auth.back": "Back",
    "auth.resetTitle": "New password",
    "auth.resetSave": "Save password",
    "auth.resetDone": "Password updated.",
    "auth.resetInvalid": "This link is invalid or has expired.",
    "common.cancel": "Cancel",
    "common.close": "Close",
    "common.confirm": "Confirm",
    "chat.empty": "No messages yet. Say hello.",
    "chat.placeholder": "Write a message…",
    "chat.editPlaceholder": "Edit your message…",
    "chat.editing": "Editing message",
    "chat.deleted": "Message deleted",
    "chat.edited": "(edited)",
    "chat.copy": "Copy",
    "chat.forward": "Forward",
    "chat.edit": "Edit",
    "chat.delete": "Delete",
    "chat.download": "Download",
    "chat.move": "Move to folder",
    "chat.saveEurekup": "Save to EurekUp",
    "chat.online": "Online",
    "chat.offline": "Offline",
    "chat.lastSeen": "Last seen",
    "chat.schedule": "Schedule message",
    "chat.scheduleHint": "Long-press or right-click send to schedule.",
    "chat.scheduledFor": "Scheduled for",
    "chat.scheduledOk": "Message scheduled",
    "chat.scheduleFuture": "Pick a future date",
    "chat.pending": "Pending",
    "settings.language": "Language",
    "settings.langUpdated": "Language updated",
    "settings.soon": "Coming soon",
  },
} as const;

export type TKey = keyof (typeof dict)["es"];

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: TKey) => string;
  /** Inline translation: tr("Hola", "Hello") */
  tr: (es: string, en: string) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("es");
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "es" || saved === "en") setLangState(saved);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }, []);
  const t = useCallback((k: TKey) => dict[lang][k] ?? dict.es[k] ?? k, [lang]);
  const tr = useCallback((es: string, en: string) => (lang === "en" ? en : es), [lang]);
  return <Ctx.Provider value={{ lang, setLang, t, tr }}>{children}</Ctx.Provider>;
}

export function useT() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useT must be used within I18nProvider");
  return c;
}

export function dateLocale(lang: Lang) {
  return lang === "en" ? "en" : "es";
}
